import type { PageServerLoad } from "./$types";

export const load = (async ({ platform }) => {
  let rankings: any[] = [];

  if (platform?.env?.DB) {
    try {
      const { results } = await platform.env.DB.prepare(
        "SELECT username, score, kpm, played_at FROM scores ORDER BY score DESC LIMIT 100"
      ).all();
      rankings = results;
    } catch (e) {
      console.error("D1 Rankings Load Error:", e);
    }
  }

  return { rankings };
}) satisfies PageServerLoad;
