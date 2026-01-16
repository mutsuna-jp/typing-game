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
