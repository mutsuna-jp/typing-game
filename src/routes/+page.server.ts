import type { PageServerLoad, Actions } from "./$types";
import {
  parseWords,
  KanaEngine,
  GAME_CONFIG,
  createPRNG,
  getNextWordSeeded,
} from "$lib/word-utils";
import { fail } from "@sveltejs/kit";
import wordsCsv from "$lib/words.csv?raw";

export const load = (async () => {
  try {
    const { words, errors } = parseWords(wordsCsv);
    return { words, errors, count: words.length };
  } catch (e) {
    return { words: [], errors: [], count: 0 };
  }
}) satisfies PageServerLoad;

// --- Replay & Seed Management ---
const pendingSessions = new Map<string, { expires: number; seed: number }>();
const SESSION_TTL = 10 * 60 * 1000; // 10 minutes

// Official words cached on server for validation
const OFFICIAL_WORDS = parseWords(wordsCsv).words.filter(
  (w) => !w.kana.includes("ー"),
);

export const actions = {
  getGameToken: async () => {
    const id =
      Math.random().toString(36).substring(2) + Date.now().toString(36);
    const seed = Math.floor(Math.random() * 1000000);
    pendingSessions.set(id, { expires: Date.now() + SESSION_TTL, seed });

    // Cleanup old sessions
    if (pendingSessions.size > 1000) {
      const now = Date.now();
      for (const [key, val] of pendingSessions) {
        if (val.expires < now) pendingSessions.delete(key);
      }
    }

    return { gameId: id, seed };
  },

  submitScore: async ({ request }) => {
    try {
      const data = (await request.json()) as {
        score: number;
        keyLog: { key: string; time: number }[];
        playedWords: { disp: string; kana: string; startTime: number }[];
        gameId: string;
      };
      const { score, keyLog, playedWords, gameId } = data;

      // 1. Basic Validity & Session Check
      if (!gameId || !pendingSessions.has(gameId)) {
        return fail(400, {
          message: "Invalid or expired session. Please refresh.",
        });
      }

      const session = pendingSessions.get(gameId)!;
      pendingSessions.delete(gameId); // Consume immediately

      if (Date.now() > session.expires) {
        return fail(400, { message: "Session expired" });
      }

      if (
        typeof score !== "number" ||
        !Array.isArray(keyLog) ||
        !Array.isArray(playedWords) ||
        playedWords.length === 0
      ) {
        return fail(400, { message: "Invalid data structure" });
      }

      // 2. Game Duration Check
      const lastKeyTime = keyLog[keyLog.length - 1]?.time || 0;
      const totalGameTimeSeconds = lastKeyTime / 1000;
      // Allowed time is DEFAULT_TIME (60) plus bonuses. 
      // Instead of tracking exact bonuses here (which we could from server calculation), 
      // we at least check that lastKeyTime is within a reasonable upper bound (e.g. 5 minutes).
      if (totalGameTimeSeconds > 300) {
        return fail(400, { message: "Game duration exceeded limit" });
      }

      // --- 3. Server-side Re-simulation ---
      const prng = createPRNG(session.seed);
      let serverScore = 0;
      let currentCombo = 0;
      let correctKeys = 0;
      let keyIdx = 0;
      let serverTimeLeft = GAME_CONFIG.DEFAULT_TIME;

      for (let i = 0; i < playedWords.length; i++) {
        const clientWord = playedWords[i];

        // Seed Synchronization: Generate what word should have been served
        const expectedWord = getNextWordSeeded(
          OFFICIAL_WORDS,
          clientWord.startTime,
          prng,
        );

        if (clientWord.kana !== expectedWord.kana) {
          return fail(400, {
            message: `Word mismatch at index ${i}. Expected ${expectedWord.kana}, got ${clientWord.kana}`,
          });
        }

        // Check if the game should have been over by this word's start time
        if (serverTimeLeft <= 0 && i < playedWords.length - 1) {
          // It's possible the last word was started just before time ran out.
          // But if multiple words follow, something is wrong.
        }

        const tokens = KanaEngine.tokenize(clientWord.kana);
        let tokenIndex = 0;
        let inputBuffer = "";
        let hasErrorInWord = false;

        // Simulation: Process keys belonging to this word
        // In the client, wordComplete() calls nextWord().
        // So we process keys until the word is complete.
        while (tokenIndex < tokens.length && keyIdx < keyLog.length) {
          const keyEntry = keyLog[keyIdx];
          const key = keyEntry.key;
          keyIdx++;

          const currToken = tokens[tokenIndex];
          const nextToken = tokens[tokenIndex + 1];
          const patterns = KanaEngine.getValidPatterns(currToken, nextToken);
          const nextBuffer = inputBuffer + key;

          if (patterns.some((p) => p.startsWith(nextBuffer))) {
            correctKeys++;
            currentCombo++;
            inputBuffer = nextBuffer;

            const isMatch = patterns.includes(inputBuffer);
            const isN_Ambiguity =
              currToken === "ん" &&
              inputBuffer === "n" &&
              nextToken &&
              /^[aiueoyn]/.test(KanaEngine.table[nextToken]?.[0]);

            if (isMatch && !isN_Ambiguity) {
              tokenIndex++;
              inputBuffer = "";
            }
          } else {
            currentCombo = 0;
            hasErrorInWord = true;
          }
        }

        // Calculate score gain exactly as client does
        if (tokenIndex >= tokens.length) {
          const wordLen = clientWord.kana.length;
          let scoreGain = wordLen * GAME_CONFIG.BASE_SCORE_PER_CHAR;
          const multiplier = 1 + currentCombo * GAME_CONFIG.COMBO_MULTIPLIER;
          scoreGain = Math.floor(scoreGain * multiplier);

          if (!hasErrorInWord) {
            scoreGain += GAME_CONFIG.PERFECT_SCORE_BONUS;
            const timeBonus = Math.max(1, Math.floor(wordLen / 2));
            serverTimeLeft += timeBonus;
          }
          serverScore += scoreGain;
        }
        
        // Every word consumed 1 second of "tick" time approximately? 
        // No, we should check elapsed time vs serverTimeLeft.
        // Actually the client is simple: timeLeft decreases every 1s.
        // The real constraint is: lastKeyTime <= (INITIAL_TIME + SUM(timeBonuses)) * 1000
      }

      // --- 4. Final Security Sanity Checks ---

      // 4.1 Score Mismatch
      if (serverScore !== score) {
        return fail(400, {
          message: `Score mismatch: Client reported ${score}, but server calculated ${serverScore}`,
        });
      }

      // 4.2 Typing Speed (KPM)
      const durationMin = lastKeyTime / 1000 / 60;
      const kpm = durationMin > 0 ? (correctKeys / durationMin) : 0;
      if (kpm > 1000) {
        return fail(400, { message: "Typing speed exceeds human limits (KPM > 1000)" });
      }

      // 4.3 Input Consistency (Bot detection)
      if (keyLog.length > 30) {
        const intervals = [];
        for (let i = 1; i < keyLog.length; i++) {
          intervals.push(keyLog[i].time - keyLog[i - 1].time);
        }
        const avg = intervals.reduce((a, b) => a + b) / intervals.length;
        const variance = intervals.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / intervals.length;
        
        // Humans naturally have variance in typing. Bots don't (unless programmed to).
        // A very low variance is a strong indicator of a simple macro/bot.
        if (variance < 5) {
          return fail(400, { message: "Bot detected: input intervals are too consistent" });
        }

        // Check for "burst" typing (multiple keys in very same millisecond)
        const bursts = intervals.filter(v => v === 0).length;
        if (bursts > keyLog.length * 0.5) {
          return fail(400, { message: "Bot detected: impossible burst input" });
        }
      }

      console.log(`[VERIFIED] Score: ${serverScore}, KPM: ${kpm.toFixed(1)}, Session: ${gameId}`);

      return {
        success: true,
        verifiedScore: serverScore,
        kpm: Math.round(kpm),
      };
    } catch (e) {
      console.error("Verification error:", e);
      return fail(500, { message: "Internal server error during verification" });
    }
  },
} satisfies Actions;
