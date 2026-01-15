import type { PageServerLoad } from "./$types";
import { parseWords } from "$lib/word-utils";

export const load = (async ({ fetch }) => {
  try {
    const res = await fetch("/words.csv");
    if (res.ok) {
      const text = await res.text();
      const { words, errors } = parseWords(text);
      return { words, errors, count: words.length };
    }
    return { words: [], errors: [], count: 0 };
  } catch (e) {
    return { words: [], errors: [], count: 0 };
  }
}) satisfies PageServerLoad;
