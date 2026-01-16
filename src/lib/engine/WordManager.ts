import {
  KanaEngine,
  parseWords,
  createPRNG,
  getNextWordSeeded,
  type Word,
} from "$lib/word-utils";
import { writable, get } from "svelte/store";

// Reactive stores for WordManager
export const wordList = writable<Word[]>([]);
export const wordActiveList = writable<Word[]>([]);
export const wordLastErrors = writable<string[]>([]);
export const isCustomCSVStore = writable(false);

export class WordManagerClass {
  rawList: Word[] = [];
  gamePRNG: (() => number) | null = null;
  gameSeed: number | null = null;

  async init(initialWords?: Word[]) {
    if (initialWords && initialWords.length > 0) {
      this.rawList = initialWords;
      wordList.set(initialWords);
      isCustomCSVStore.set(false);
      this.updateActiveList();
      return initialWords.length;
    }
    return 0;
  }

  updateActiveList() {
    const filtered = this.rawList.filter((w) => !w.kana.includes("ー"));
    wordActiveList.set(filtered);
  }

  setSeed(seed: number) {
    if (typeof seed !== "number" || !Number.isFinite(seed)) {
      this.gamePRNG = null;
      this.gameSeed = null;
      return;
    }
    this.gamePRNG = createPRNG(seed);
    this.gameSeed = seed;
  }

  loadCSV(text: string) {
    const { words, errors } = parseWords(text);
    wordLastErrors.set(errors);
    this.rawList = words;
    wordList.set(words);
    isCustomCSVStore.set(true);
    this.updateActiveList();
    return words.length;
  }

  getNextWord(elapsedTime: number) {
    const active = get(wordActiveList);
    // Use seeded PRNG if available (for official Online mode)
    if (this.gamePRNG) {
      const word = getNextWordSeeded(
        active,
        elapsedTime,
        this.gamePRNG,
      );
      return { ...word, tokens: KanaEngine.tokenize(word.kana) };
    }

    // Fallback for custom offline mode
    const candidates = active;
    if (candidates.length === 0) {
      return { disp: "NO DATA", kana: "nodata", tokens: ["nodata"] };
    }
    const wordObj = candidates[Math.floor(Math.random() * candidates.length)];
    return { ...wordObj, tokens: KanaEngine.tokenize(wordObj.kana) };
  }
}

export const WordManager = new WordManagerClass();
