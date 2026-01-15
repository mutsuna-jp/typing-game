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

export const load = (async ({ platform, url }) => {
  const userId = url.searchParams.get("userId");
  let top5: any[] = [];
  let userBest: any = null;

  if (platform?.env?.DB) {
    try {
      // Fetch Top 5
      const { results } = await platform.env.DB.prepare(
        "SELECT username, score, kpm FROM scores ORDER BY score DESC LIMIT 5"
      ).all();
      top5 = results;

      // Fetch user's best if userId is provided
      if (userId && userId.startsWith("usr_")) {
        userBest = await platform.env.DB.prepare(
          "SELECT score, kpm, (SELECT COUNT(*) + 1 FROM scores WHERE score > s.score) as rank FROM scores s WHERE user_id = ?"
        )
          .bind(userId)
          .first();
      }
    } catch (e) {
      console.error("D1 Load Error:", e);
    }
  }

  try {
    const { words, errors } = parseWords(wordsCsv);
    return { words, errors, count: words.length, top5, userBest };
  } catch (e) {
    return { words: [], errors: [], count: 0, top5, userBest };
  }
}) satisfies PageServerLoad;

// --- Replay & Seed Management ---
const pendingSessions = new Map<string, { expires: number; seed: number }>();
const SESSION_TTL = 10 * 60 * 1000; // 10 minutes

// Official words cached on server for validation
const OFFICIAL_WORDS = parseWords(wordsCsv).words.filter(
  (w) => !w.kana.includes("ー")
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

    // Return a plain serializable object expected by SvelteKit actions
    return { success: true, gameId: id, seed };
  },

  submitScore: async ({ request, platform }) => {
    try {
      const fd = await request.formData();
      const data = JSON.parse(fd.get("json") as string) as {
        score: number;
        keyLog: { key: string; time: number }[];
        playedWords: { disp: string; kana: string; startTime: number }[];
        duration?: number;
        gameId: string;
        userId?: string;
        username?: string;
      };
      const { score, keyLog, playedWords, gameId, duration, userId, username } =
        data;

      console.log(
        `[SUBMIT] gameId=${gameId} pending=${pendingSessions.has(gameId)}`
      );

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
      const totalGameTimeSeconds = duration || lastKeyTime / 1000;

      // Safety limit: No game should last more than 10 minutes even with bonuses
      if (totalGameTimeSeconds > 600) {
        return fail(400, { message: "Game duration exceeded limit" });
      }

      // --- 3. Server-side Re-simulation ---
      const prng = createPRNG(session.seed);
      let serverScore = 0;
      let currentCombo = 0;
      let correctKeys = 0;
      let keyIdx = 0;
      let totalTimeBonuses = 0;

      for (let i = 0; i < playedWords.length; i++) {
        const clientWord = playedWords[i];

        // Seed Synchronization: Generate what word should have been served
        const expectedWord = getNextWordSeeded(
          OFFICIAL_WORDS,
          clientWord.startTime,
          prng
        );

        if (clientWord.kana !== expectedWord.kana) {
          return fail(400, {
            message: `Word mismatch at index ${i}. Expected ${expectedWord.kana}, got ${clientWord.kana} (seed: ${session.seed})`,
          });
        }

        // Check if the word was started within valid time
        // Word must start before (Initial Time + Total Bonuses earned so far)
        if (
          clientWord.startTime >
          GAME_CONFIG.DEFAULT_TIME + totalTimeBonuses + 2
        ) {
          // Added 2s grace for network/lag
          return fail(400, {
            message: `Invalid word start time at index ${i}. Time budget exceeded.`,
          });
        }

        const tokens = KanaEngine.tokenize(clientWord.kana);
        let tokenIndex = 0;
        let inputBuffer = "";
        let hasErrorInWord = false;

        // Simulation: Process keys belonging to this word
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
            totalTimeBonuses += timeBonus;
          }
          serverScore += scoreGain;
        }
      }

      // --- 4. Final Security Sanity Checks ---

      // 4.1 Score Mismatch
      if (Math.abs(serverScore - score) > 0) {
        return fail(400, {
          message: `Score mismatch: Client reported ${score}, but server calculated ${serverScore}`,
        });
      }

      // 4.2 Typing Speed (KPM)
      const durationMin = totalGameTimeSeconds / 60;
      const kpm = durationMin > 0.05 ? correctKeys / durationMin : 0;
      if (kpm > 1200) {
        return fail(400, {
          message: "Typing speed exceeds human limits (KPM > 1200)",
        });
      }

      // 4.3 Input Consistency (Bot detection)
      if (keyLog.length > 30) {
        const intervals = [];
        for (let i = 1; i < keyLog.length; i++) {
          intervals.push(keyLog[i].time - keyLog[i - 1].time);
        }
        const avg = intervals.reduce((a, b) => a + b) / intervals.length;
        const variance =
          intervals.reduce((a, b) => a + Math.pow(b - avg, 2), 0) /
          intervals.length;

        if (variance < 2) {
          return fail(400, {
            message: "Bot detected: input intervals are too consistent",
          });
        }

        const bursts = intervals.filter((v) => v === 0).length;
        if (bursts > keyLog.length * 0.8) {
          return fail(400, { message: "Bot detected: impossible burst input" });
        }
      }

      console.log(
        `[VERIFIED] Score: ${serverScore}, KPM: ${kpm.toFixed(
          1
        )}, Session: ${gameId}`
      );

      // --- 5. D1 Integration: Save if Personal Best ---
      let isNewRecord = false;
      const db = platform?.env?.DB;

      if (db && userId && userId.startsWith("usr_")) {
        // Use guest if username is empty
        const finalName = username?.trim() || "guest";

        // Check current best
        const currentBest = await db
          .prepare("SELECT score FROM scores WHERE user_id = ?")
          .bind(userId)
          .first<{ score: number }>();

        if (!currentBest || serverScore > currentBest.score) {
          // INSERT or UPDATE (using SQLITE's INSERT OR REPLACE or similar if unique)
          // Since we have a UNIQUE constraint on user_id, we can use ON CONFLICT
          await db
            .prepare(
              `INSERT INTO scores (user_id, username, score, kpm) 
               VALUES (?, ?, ?, ?) 
               ON CONFLICT(user_id) DO UPDATE SET 
               username = excluded.username, 
               score = excluded.score, 
               kpm = excluded.kpm,
               played_at = CURRENT_TIMESTAMP`
            )
            .bind(userId, finalName, serverScore, Math.round(kpm))
            .run();
          isNewRecord = true;
        }
      }

      return {
        success: true,
        verifiedScore: serverScore,
        kpm: Math.round(kpm),
        isNewRecord,
      };
    } catch (e) {
      console.error("Verification error:", e);
      return fail(500, {
        message: "Internal server error during verification",
      });
    }
  },
} satisfies Actions;
