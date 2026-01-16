import { writable, get } from "svelte/store";
import { isPlaying, isShaking } from "$lib/stores";
import { AudioEngine } from "./AudioEngine";
import {
  WordManager,
  wordActiveList,
  isCustomCSVStore,
  wordLastErrors,
} from "./WordManager";
import { KanaEngine, type Word } from "$lib/word-utils";

// Types
export interface GameStats {
  score: number;
  accuracy: string;
  kpm: number;
  maxCombo: number;
  wrong: number;
}

export interface HistoryEntry {
  score: number;
  accuracy: string;
  kpm: number;
  date: string;
}

export interface Bonus {
  id: number;
  text: string;
  type: string;
}

// Stores for Reactive UI
export const score = writable(0);
export const timeLeft = writable(60);
export const currentCombo = writable(0);
export const maxCombo = writable(0);
export const currentWord = writable<any>(null);
export const tokenIndex = writable(0);
export const inputBuffer = writable("");
export const errorIndex = writable<number | null>(null);
export const gameStats = writable<GameStats | null>(null);
export const scoreBonuses = writable<Bonus[]>([]);
export const timeBonuses = writable<Bonus[]>([]);
export const message = writable("PRESS START OR LOAD CSV");
export const isPreparing = writable(false);

let bonusCounter = 0;

export class GameEngineClass {
  private timerId: ReturnType<typeof setInterval> | null = null;
  private startTime: number = 0;
  private correctKeys: number = 0;
  private wrongKeys: number = 0;
  private hasErrorInWord: boolean = false;
  private keyLog: any[] = [];
  private playedWords: any[] = [];
  private currentGameId: string | null = null;

  // Config (Should be synchronized with +page.svelte CONFIG)
  private readonly CONFIG = {
    DEFAULT_TIME: 60,
    MAX_TIME: 90,
    BASE_SCORE_PER_CHAR: 5,
    COMBO_MULTIPLIER: 0.05,
    PERFECT_SCORE_BONUS: 20,
  };

  async start(
    fetch: any,
    data: any,
    hiddenInputEl: HTMLInputElement | null,
    actionPath = ""
  ) {
    if (
      get(wordActiveList).length === 0 ||
      get(isPreparing) ||
      get(isPlaying)
    ) {
      if (get(wordActiveList).length === 0) {
        message.set("LOAD CSV TO START");
        // fileStatus and isFileError are still managed in +page.svelte for now
      }
      return;
    }

    isPreparing.set(true);
    AudioEngine.init();
    message.set("PREPARING SESSION...");
    this.resetState();

    try {
      const fd = new FormData();
      fd.set("_action", "getGameToken");
      const url = actionPath ? `${actionPath}?/getGameToken` : "?/getGameToken";
      console.log(`[Game] Requesting token from: ${url}`);
      const res = await fetch(url, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error(`Token request failed: ${res.status}`);

      let result: any = await res.json();
      let gameObj: any = result;
      if (result?.data) {
        try {
          gameObj =
            typeof result.data === "string"
              ? JSON.parse(result.data)
              : result.data;
        } catch {
          gameObj = result.data;
        }
      }

      if (Array.isArray(gameObj)) {
        const strId = gameObj.find((el: any) => typeof el === "string");
        const numSeed = gameObj.find((el: any) => typeof el === "number");
        if (strId && numSeed !== undefined) {
          gameObj = { gameId: strId, seed: numSeed };
        } else {
          const obj = gameObj.find(
            (el: any) =>
              el && typeof el === "object" && typeof el.seed === "number"
          );
          if (obj) {
            if (!obj.gameId && strId) obj.gameId = strId;
            gameObj = obj;
          } else if (numSeed !== undefined) {
            const str = gameObj.find((el: any) => typeof el === "string");
            gameObj = { gameId: str ?? null, seed: numSeed };
          }
        }
      }

      this.currentGameId =
        gameObj?.gameId != null ? String(gameObj.gameId) : null;
      if (typeof gameObj?.seed === "number") WordManager.setSeed(gameObj.seed);
    } catch (e) {
      console.error("Session error:", e);
      message.set("SESSION ERROR. TRY AGAIN.");
      isPreparing.set(false);
      return;
    }

    // Start immediately (countdown feature removed)
    isPreparing.set(false);

    this.nextWord();
    isPlaying.set(true);
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = setInterval(() => this.tick(), 1000);
    hiddenInputEl?.focus();
    message.set("");
  }

  resetState() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    isPlaying.set(false);
    score.set(0);
    timeLeft.set(this.CONFIG.DEFAULT_TIME);
    this.startTime = Date.now();
    this.correctKeys = 0;
    this.wrongKeys = 0;
    currentCombo.set(0);
    maxCombo.set(0);
    currentWord.set(null);
    WordManager.gamePRNG = null;
    tokenIndex.set(0);
    inputBuffer.set("");
    this.hasErrorInWord = false;
    errorIndex.set(null);
    gameStats.set(null);
    this.keyLog = [];
    this.playedWords = [];
  }

  private tick() {
    timeLeft.update((t) => {
      if (t <= 1) {
        this.gameOver();
        return 0;
      }
      return t - 1;
    });
  }

  private nextWord() {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const word = WordManager.getNextWord(elapsed);
    currentWord.set(word);
    if (word) {
      this.playedWords.push({
        disp: word.disp,
        kana: word.kana,
        startTime: elapsed,
      });
    }
    tokenIndex.set(0);
    inputBuffer.set("");
    errorIndex.set(null);
    this.hasErrorInWord = false;
  }

  processInput(key: string) {
    const word = get(currentWord);
    if (!word) return;

    this.keyLog.push({ key, time: Date.now() - this.startTime });

    const tokens = word.tokens;
    const idx = get(tokenIndex);
    const currToken = tokens[idx];
    const nextToken = tokens[idx + 1];
    const patterns = KanaEngine.getValidPatterns(currToken, nextToken);
    const buffer = get(inputBuffer) + key;

    if (patterns.some((p) => p.startsWith(buffer))) {
      errorIndex.set(null);
      inputBuffer.set(buffer);
      this.correctKeys++;
      currentCombo.update((c) => {
        const next = c + 1;
        maxCombo.update((m) => (next > m ? next : m));
        return next;
      });
      AudioEngine.playType();

      const isMatch = patterns.includes(buffer);
      const isN_Ambiguity =
        currToken === "ん" &&
        buffer === "n" &&
        nextToken &&
        /^[aiueoyn]/.test(KanaEngine.table[nextToken]?.[0]);

      if (isMatch && !isN_Ambiguity) {
        tokenIndex.update((i) => i + 1);
        inputBuffer.set("");
        if (get(tokenIndex) >= tokens.length) this.wordComplete();
      }
    } else {
      this.inputError();
    }
  }

  processFlickInput(hiragana: string) {
    const word = get(currentWord);
    if (!word) return;

    this.keyLog.push({ key: hiragana, time: Date.now() - this.startTime });

    const tokens = word.tokens;
    const idx = get(tokenIndex);
    const currToken = tokens[idx];

    if (currToken === hiragana) {
      errorIndex.set(null);
      this.correctKeys++;
      currentCombo.update((c) => {
        const next = c + 1;
        maxCombo.update((m) => (next > m ? next : m));
        return next;
      });
      AudioEngine.playType();
      tokenIndex.update((i) => i + 1);
      if (get(tokenIndex) >= tokens.length) this.wordComplete();
    } else {
      this.inputError();
    }
  }

  inputError() {
    this.wrongKeys++;
    currentCombo.set(0);
    this.hasErrorInWord = true;
    errorIndex.set(get(tokenIndex));
    AudioEngine.playError();

    timeLeft.update((t) => {
      const next = Math.max(0, t - 1);
      this.showBonus("time", "-1", "error");
      if (next === 0) this.gameOver();
      return next;
    });

    this.inputErrorVisuals();
    const currentIdx = get(tokenIndex);
    setTimeout(() => {
      if (get(errorIndex) === currentIdx) errorIndex.set(null);
    }, 300);
  }

  inputErrorVisuals() {
    isShaking.set(true);
    setTimeout(() => isShaking.set(false), 200);
  }

  private wordComplete() {
    const word = get(currentWord);
    const wordLength = word.kana.length;
    let scoreGain = wordLength * this.CONFIG.BASE_SCORE_PER_CHAR;
    const multiplier = 1 + get(currentCombo) * this.CONFIG.COMBO_MULTIPLIER;
    scoreGain = Math.floor(scoreGain * multiplier);

    if (!this.hasErrorInWord) {
      const timeBonusValue = Math.max(1, Math.floor(wordLength / 2));
      const prevTime = get(timeLeft);
      timeLeft.update((t) =>
        Math.min(this.CONFIG.MAX_TIME, t + timeBonusValue)
      );
      const actualBonus = get(timeLeft) - prevTime;

      if (actualBonus > 0) {
        this.showBonus("time", `PERFECT +${actualBonus}`, "perfect");
      } else {
        this.showBonus("time", "MAX!", "perfect");
      }
      scoreGain += this.CONFIG.PERFECT_SCORE_BONUS;
      AudioEngine.playBonus();
    }

    score.update((s) => s + scoreGain);
    let bonusText = `+${scoreGain}`;
    const combo = get(currentCombo);
    if (combo > 1) bonusText += ` (x${multiplier.toFixed(1)})`;
    this.showBonus("score", bonusText, "");
    this.nextWord();
  }

  private showBonus(target: "score" | "time", text: string, type: string) {
    const id = bonusCounter++;
    const bonus = { id, text, type };
    if (target === "score") scoreBonuses.update((b) => [...b, bonus]);
    else timeBonuses.update((b) => [...b, bonus]);

    setTimeout(() => {
      if (target === "score")
        scoreBonuses.update((b) => b.filter((x) => x.id !== id));
      else timeBonuses.update((b) => b.filter((x) => x.id !== id));
    }, 1000);
  }

  gameOver() {
    if (!get(isPlaying)) return;
    isPlaying.set(false);
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    AudioEngine.playGameOver();

    const total = this.correctKeys + this.wrongKeys;
    const accuracy =
      total === 0 ? "0" : ((this.correctKeys / total) * 100).toFixed(1);
    const duration = (Date.now() - this.startTime) / 1000;
    const kpmValue = Math.round((this.correctKeys / duration) * 60);

    const stats: GameStats = {
      score: get(score),
      accuracy,
      kpm: kpmValue,
      maxCombo: get(maxCombo),
      wrong: this.wrongKeys,
    };
    gameStats.set(stats);

    if (!get(isCustomCSVStore)) {
      message.set("VERIFYING SCORE...");
    } else {
      message.set("✓ FINISHED (CUSTOM LIST - OFFLINE)");
    }
  }

  async submitScore(verifyCallback: (payload: any) => Promise<any>) {
    if (!this.currentGameId) return;
    const stats = get(gameStats);
    if (!stats) return;

    try {
      const payload = {
        score: stats.score,
        keyLog: this.keyLog,
        playedWords: this.playedWords,
        duration: (Date.now() - this.startTime) / 1000,
        gameId: this.currentGameId,
      };

      const verified = await verifyCallback(payload);
      this.currentGameId = null;

      if (verified?.success) {
        message.set("✓ SCORE VERIFIED");
        return verified;
      } else {
        message.set(`⚠ VERIFICATION FAILED: ${verified?.message || "unknown"}`);
      }
    } catch (e) {
      console.error("Submission error:", e);
      message.set("COMMUNICATION ERROR");
    }
    return null;
  }
}

export const Game = new GameEngineClass();
