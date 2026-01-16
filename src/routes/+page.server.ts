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

const SESSION_TTL = 10 * 60 * 1000; // 10 minutes

// Official words cached on server for validation
const OFFICIAL_WORDS = parseWords(wordsCsv).words.filter(
  (w) => !w.kana.includes("ー")
);

export const actions = {
  getGameToken: async ({ platform }) => {
    const db = platform?.env?.DB;
    if (!db) {
      return fail(500, { message: "Database connection failed" });
    }

    const id =
      Math.random().toString(36).substring(2) + Date.now().toString(36);
    const seed = Math.floor(Math.random() * 1000000);
    const expires = Date.now() + SESSION_TTL;

    try {
      // Insert new session
      await db
        .prepare(
          "INSERT INTO game_sessions (id, seed, expires_at) VALUES (?, ?, ?)"
        )
        .bind(id, seed, expires)
        .run();

      // Periodically cleanup old sessions (10% chance to run cleanup on token request)
      if (Math.random() < 0.1) {
        await db
          .prepare("DELETE FROM game_sessions WHERE expires_at < ?")
          .bind(Date.now())
          .run();
      }

      return { success: true, gameId: id, seed };
    } catch (e) {
      console.error("D1 Session Error:", e);
      return fail(500, { message: "Failed to create session" });
    }
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

      const db = platform?.env?.DB;
      if (!db) {
        return fail(500, { message: "Database connection failed" });
      }

      console.log(`[SUBMIT] gameId=${gameId}`);

      // 1. Basic Validity & Session Check
      if (!gameId) {
        return fail(400, { message: "Missing session ID" });
      }

      // Fetch and delete session atomically-ish (one-time use)
      const session = await db
        .prepare("SELECT seed, expires_at FROM game_sessions WHERE id = ?")
        .bind(gameId)
        .first<{ seed: number; expires_at: number }>();

      if (!session) {
        return fail(400, {
          message: "Invalid or expired session. Please refresh.",
        });
      }

      // Delete the session token so it can't be reused
      await db.prepare("DELETE FROM game_sessions WHERE id = ?").bind(gameId).run();

      if (Date.now() > session.expires_at) {
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
          
          // フリック入力の判定: keyがひらがな1文字でcurrTokenと完全一致
          const isFlickInput = key.length === 1 && /[\u3040-\u309F]/.test(key);
          
          if (isFlickInput && key === currToken) {
            // フリック入力: ひらがな直接入力
            correctKeys++;
            currentCombo++;
            tokenIndex++;
            inputBuffer = ""; // フリック入力では常にバッファをクリア
          } else if (!isFlickInput) {
            // ローマ字入力: 既存のパターンマッチング
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
          } else {
            // フリック入力だが不一致、またはその他のエラー
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
  registerName: async ({ request, platform }) => {
    try {
      const fd = await request.formData();
      const { userId, username } = JSON.parse(fd.get("json") as string);
      const db = platform?.env?.DB;

      if (!db || !userId || !userId.startsWith("usr_")) {
        return fail(400, { message: "Invalid request" });
      }

      const finalName = username?.trim() || "guest";

      await db
        .prepare("UPDATE scores SET username = ? WHERE user_id = ?")
        .bind(finalName, userId)
        .run();

      return { success: true };
    } catch (e) {
      console.error("Name registration error:", e);
      return fail(500, { message: "Failed to register name" });
    }
  },
} satisfies Actions;
