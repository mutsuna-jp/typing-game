<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { PageData } from "./$types";

  export let data: PageData;
  let { words: initialWords, top5, userBest } = data;

  let userId = "";
  let username = "";
  let isSubmittingRanking = false;
  let isRankingSubmitted = false;
  let transferInput = "";
  let showProfileModal = false;
  type HistoryEntry = {
    score: number;
    kpm: number;
    accuracy: string | number;
    date: string;
  };
  let scoreHistory: HistoryEntry[] = [];

  // Type aliases
  type Word = { disp: string; kana: string };
  type GameStats = {
    score: number;
    accuracy: number | string;
    kpm: number;
    maxCombo: number;
    wrong: number;
  };

  type KeyLog = {
    key: string;
    time: number; // ゲーム開始時からの経過ミリ秒
  };

  type PlayedWord = Word & { startTime: number };

  // Element refs
  let hiddenInputEl: HTMLInputElement | null = null;
  let screenEl: HTMLElement | null = null;

  import {
    KanaEngine,
    parseWords,
    GAME_CONFIG,
    createPRNG,
    getNextWordSeeded,
  } from "$lib/word-utils";

  /**
   * Configuration Constants
   */
  const CONFIG = {
    DEFAULT_TIME: GAME_CONFIG.DEFAULT_TIME,
    BASE_SCORE_PER_CHAR: GAME_CONFIG.BASE_SCORE_PER_CHAR,
    COMBO_MULTIPLIER: GAME_CONFIG.COMBO_MULTIPLIER,
    PERFECT_SCORE_BONUS: GAME_CONFIG.PERFECT_SCORE_BONUS,
    MAX_TIME: GAME_CONFIG.MAX_TIME,

    DIFFICULTY_THRESHOLDS: [20, 40, 60], // Seconds thresholds for difficulty increase
    WORD_LENGTHS: {
      // Min/Max length per level
      LEVEL1: { min: 1, max: 3 },
      LEVEL2: { min: 3, max: 5 },
      LEVEL3: { min: 4, max: 6 },
      LEVEL4: { min: 5, max: 20 },
    },
    RANKS: {
      S: { score: 1500, label: "S", color: "rank-S" },
      A: { score: 1000, label: "A", color: "rank-A" },
      B: { score: 500, label: "B", color: "rank-B" },
      C: { score: 200, label: "C", color: "rank-C" },
      D: { score: 0, label: "D", color: "rank-D" },
    },
  };

  /**
   * Audio Engine
   * Handles all sound synthesis using Web Audio API.
   */
  const AudioEngine = {
    ctx: null as AudioContext | null,
    init() {
      if (!this.ctx) {
        const Ctor =
          (window as any).AudioContext || (window as any).webkitAudioContext;
        if (Ctor) this.ctx = new Ctor();
      }
      if (this.ctx?.state === "suspended") this.ctx.resume();
    },
    playTone(
      freq: number,
      type: OscillatorType | string,
      duration: number,
      vol: number,
    ) {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type as OscillatorType;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(vol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.01,
        this.ctx.currentTime + duration,
      );
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    },
    playType() {
      this.playTone(800, "square", 0.05, 0.1);
    },
    playError() {
      this.playTone(150, "sawtooth", 0.2, 0.2);
    },
    playSuccess() {
      this.playTone(1200, "sine", 0.1, 0.1);
    },
    playBonus() {
      this.playTone(1500, "square", 0.1, 0.1);
      setTimeout(() => this.playTone(2000, "square", 0.1, 0.1), 100);
    },
    playGameOver() {
      this.playTone(300, "sawtooth", 0.5, 0.2);
      setTimeout(() => this.playTone(200, "sawtooth", 0.5, 0.2), 400);
    },
  };

  import { base } from "$app/paths";
  import { replaceState } from "$app/navigation";
  import WordDisplay from "$lib/components/WordDisplay.svelte";
  import GameReport from "$lib/components/GameReport.svelte";

  // Reactive State
  let isPlaying = false;
  let score = 0;
  let timeLeft = CONFIG.DEFAULT_TIME;
  let startTime = 0;
  let correctKeys = 0;
  let wrongKeys = 0;
  let currentCombo = 0;
  let maxCombo = 0;
  let currentWord: (Word & { tokens: string[] }) | null = null;
  let tokenIndex = 0;
  let inputBuffer = "";
  let composingText = ""; // フリック入力中の未確定文字
  let hasErrorInWord = false;
  let errorIndex: number | null = null;
  let gameStats: GameStats | null = null;

  // Logging for Anti-cheat
  let keyLog: KeyLog[] = [];
  let playedWords: PlayedWord[] = [];

  let currentGameId: string | null = null;
  let isCustomCSV = false;

  // CSV parse errors (for UI listing)
  let lastErrors: string[] = [];
  let showErrorList = false;

  let message = "PRESS START OR LOAD CSV";
  let fileStatus = "";
  let isFileError = false;
  let isStartEnabled = false;

  // Mobile Input Mode: "flick" or "halfwidth"
  let inputMode: "flick" | "halfwidth" = "flick";

  type Bonus = { id: number; text: string; type: string };
  let scoreBonuses: Bonus[] = [];
  let timeBonuses: Bonus[] = [];
  let bonusCounter = 0;

  function showBonus(list: Bonus[], text: string, type: string) {
    const id = bonusCounter++;
    const newBonus = { id, text, type };
    if (list === scoreBonuses) scoreBonuses = [...scoreBonuses, newBonus];
    else timeBonuses = [...timeBonuses, newBonus];

    setTimeout(() => {
      if (list === scoreBonuses)
        scoreBonuses = scoreBonuses.filter((b) => b.id !== id);
      else timeBonuses = timeBonuses.filter((b) => b.id !== id);
    }, 1000);
  }

  /**
   * Word Manager
   */
  const WordManager = {
    rawList: [] as Word[],
    activeList: [] as Word[],
    lastErrors: [] as string[],
    gamePRNG: null as (() => number) | null,

    async init(initialWords?: Word[]) {
      if (initialWords && initialWords.length > 0) {
        this.rawList = initialWords;
        isCustomCSV = false;
        this.updateActiveList();
        return initialWords.length;
      }
      return 0;
    },

    updateActiveList() {
      this.activeList = this.rawList.filter((w) => !w.kana.includes("ー"));
      isStartEnabled = this.activeList.length > 0;
    },

    gameSeed: null as number | null,
    setSeed(seed: number) {
      if (typeof seed !== "number" || !Number.isFinite(seed)) {
        this.gamePRNG = null;
        this.gameSeed = null;
        return;
      }
      this.gamePRNG = createPRNG(seed);
      this.gameSeed = seed;
    },

    loadCSV(text: string) {
      const { words, errors } = parseWords(text);
      this.lastErrors = errors;
      this.rawList = words;
      isCustomCSV = true;
      this.updateActiveList();
      return words.length;
    },

    getNextWord(elapsedTime: number) {
      // Use seeded PRNG if available (for official Online mode)
      if (this.gamePRNG) {
        const word = getNextWordSeeded(
          this.activeList,
          elapsedTime,
          this.gamePRNG,
        );
        return { ...word, tokens: KanaEngine.tokenize(word.kana) };
      }

      // Fallback for custom offline mode
      const candidates = this.activeList;
      const wordObj = candidates[Math.floor(Math.random() * candidates.length)];
      return { ...wordObj, tokens: KanaEngine.tokenize(wordObj.kana) };
    },
  };

  /**
   * Game Controller
   */
  let timerId: ReturnType<typeof setInterval> | null = null;
  let clickHandler: () => void;
  let keydownHandler: (e: KeyboardEvent) => void;
  let isPreparing = false;

  const Game = {
    async init() {
      const count = await WordManager.init(data?.words);
      const serverErrCount = data?.errors?.length || 0;
      const errCount = WordManager.lastErrors.length || serverErrCount;

      if (count > 0) {
        // Words loaded — treat ignored rows as non-fatal (user-visible as IGNORED)
        fileStatus = `FILE LOADED: ${count} WORDS${errCount ? ` (${errCount} IGNORED)` : ""}`;
        isFileError = false;
        if (errCount > 0) {
          lastErrors = WordManager.lastErrors.length
            ? WordManager.lastErrors
            : data?.errors || [];
          message = `${errCount} invalid rows ignored`;
        } else {
          lastErrors = [];
          message = "";
        }
      } else {
        fileStatus = "NO WORDS LOADED";
        isFileError = true;
        if (errCount > 0) {
          lastErrors = WordManager.lastErrors.length
            ? WordManager.lastErrors
            : data?.errors || [];
          message = `${errCount} invalid rows — no data loaded`;
        } else {
          lastErrors = [];
          message = "LOAD CSV TO START";
        }
      }
    },

    handleFile(e: Event) {
      const input = e.target as HTMLInputElement | null;
      const file = input?.files ? input.files[0] : null;
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result;
        if (typeof result === "string") {
          const count = WordManager.loadCSV(result);
          const errCount = WordManager.lastErrors.length;
          if (count > 0) {
            // Words loaded — ignored rows are non-fatal
            fileStatus = `FILE LOADED: ${count} WORDS${errCount ? ` (${errCount} IGNORED)` : ""}`;
            isFileError = false;
            if (errCount > 0) {
              lastErrors = WordManager.lastErrors;
              message = `${errCount} invalid rows ignored`;
            } else {
              lastErrors = [];
              message = "";
            }
          } else {
            fileStatus = errCount
              ? `ERROR: INVALID CSV (${errCount} ERRORS)`
              : "ERROR: NO DATA";
            isFileError = true;
            if (errCount > 0) lastErrors = WordManager.lastErrors;
            else lastErrors = [];
            message = errCount
              ? `${errCount} invalid rows found — load a valid CSV`
              : "ERROR: NO DATA";
          }
        }
      };
      reader.readAsText(file);
    },

    async start() {
      if (WordManager.activeList.length === 0 || isPreparing || isPlaying) {
        if (WordManager.activeList.length === 0) {
          message = "LOAD CSV TO START";
          fileStatus = "NO WORDS LOADED";
          isFileError = true;
        }
        return;
      }

      isPreparing = true;
      AudioEngine.init();
      message = "PREPARING SESSION...";
      this.resetState();

      try {
        const fd = new FormData();
        fd.set("_action", "getGameToken");
        const res = await fetch("?/getGameToken", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) throw new Error(`Token request failed: ${res.status}`);

        // Expect a simple JSON object: { success: true, gameId, seed }
        let result: any = await res.json();

        // Some adapters might still wrap data; try to extract without logging
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

        // If an array is returned for compatibility, pick the object/seed element
        if (Array.isArray(gameObj)) {
          // Prefer an explicit string gameId if present (adapter may return [obj, gameIdStr, seed])
          const strId = gameObj.find((el: any) => typeof el === "string");
          const numSeed = gameObj.find((el: any) => typeof el === "number");
          if (strId && numSeed !== undefined) {
            gameObj = { gameId: strId, seed: numSeed };
          } else {
            // Fallback: pick an object with numeric seed, or reconstruct
            const obj = gameObj.find(
              (el: any) =>
                el && typeof el === "object" && typeof el.seed === "number",
            );
            if (obj) {
              // If the object contains a numeric small 'gameId' (legacy), prefer string id if available
              if (!obj.gameId && strId) obj.gameId = strId;
              gameObj = obj;
            } else {
              if (numSeed !== undefined) {
                const possibleGameId = gameObj.find(
                  (el: any) => typeof el === "string" || typeof el === "number",
                );
                gameObj = {
                  gameId:
                    typeof possibleGameId === "string"
                      ? possibleGameId
                      : (possibleGameId ?? null),
                  seed: numSeed,
                };
              } else {
                gameObj = {};
              }
            }
          }
        }

        currentGameId = gameObj?.gameId != null ? String(gameObj.gameId) : null;
        if (typeof gameObj?.seed === "number")
          WordManager.setSeed(gameObj.seed);
      } catch (e) {
        console.error("Session error:", e);
        message = "SESSION ERROR. TRY AGAIN.";
        isPreparing = false;
        return;
      }

      setTimeout(() => {
        isPreparing = false;
        this.nextWord();
        isPlaying = true;
        if (timerId) clearInterval(timerId);
        timerId = setInterval(() => this.tick(), 1000);
        hiddenInputEl?.focus();
        message = "";
      }, 800);
    },

    resetState() {
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
      isPlaying = false;
      score = 0;
      timeLeft = CONFIG.DEFAULT_TIME;
      startTime = Date.now();
      correctKeys = 0;
      wrongKeys = 0;
      currentCombo = 0;
      maxCombo = 0;
      currentWord = null;
      WordManager.gamePRNG = null; // Clear seed
      tokenIndex = 0;
      inputBuffer = "";
      hasErrorInWord = false;
      gameStats = null;
      keyLog = [];
      playedWords = [];
    },

    tick() {
      timeLeft--;
      if (timeLeft <= 0) this.gameOver();
    },

    nextWord() {
      const elapsed = (Date.now() - startTime) / 1000;
      currentWord = WordManager.getNextWord(elapsed);
      if (currentWord) {
        playedWords.push({
          disp: currentWord.disp,
          kana: currentWord.kana,
          startTime: elapsed,
        });
      }
      tokenIndex = 0;
      inputBuffer = "";
      hasErrorInWord = false;
    },

    processFlickInput(hiragana: string) {
      if (!currentWord) return;

      // Log input (ひらがなをそのまま記録)
      keyLog.push({
        key: hiragana,
        time: Date.now() - startTime,
      });

      const { tokens } = currentWord;
      const currToken = tokens[tokenIndex];

      // 入力されたひらがなと現在のトークンを直接比較
      if (currToken === hiragana) {
        // 正解
        correctKeys++;
        currentCombo++;
        if (currentCombo > maxCombo) maxCombo = currentCombo;
        AudioEngine.playType();

        tokenIndex++;

        // composingTextをクリア(UI表示の残留を防ぐ)
        composingText = "";

        if (tokenIndex >= tokens.length) this.wordComplete();
      } else {
        // 不正解
        this.inputError();
      }
    },

    processInput(key: string) {
      if (!currentWord) return;

      // Log key press
      keyLog.push({
        key,
        time: Date.now() - startTime,
      });

      const { tokens } = currentWord;
      const currToken = tokens[tokenIndex];
      const nextToken = tokens[tokenIndex + 1];
      const patterns = KanaEngine.getValidPatterns(currToken, nextToken);
      const nextBuffer = inputBuffer + key;

      if (patterns.some((p) => p.startsWith(nextBuffer))) {
        inputBuffer = nextBuffer;
        correctKeys++;
        currentCombo++;
        if (currentCombo > maxCombo) maxCombo = currentCombo;
        AudioEngine.playType();

        const isMatch = patterns.includes(inputBuffer);
        const isN_Ambiguity =
          currToken === "ん" &&
          inputBuffer === "n" &&
          nextToken &&
          /^[aiueoyn]/.test(KanaEngine.table[nextToken]?.[0]);

        if (isMatch && !isN_Ambiguity) {
          tokenIndex++;
          inputBuffer = "";
          if (tokenIndex >= tokens.length) this.wordComplete();
        }
      } else {
        this.inputError();
      }
    },

    inputError() {
      wrongKeys++;
      currentCombo = 0;
      hasErrorInWord = true;
      errorIndex = tokenIndex;
      AudioEngine.playError();

      // Time penalty
      if (timeLeft > 0) {
        timeLeft = Math.max(0, timeLeft - 1);
        showBonus(timeBonuses, "-1", "error");
        if (timeLeft <= 0) Game.gameOver();
      }

      setTimeout(() => {
        if (errorIndex === tokenIndex) errorIndex = null;
      }, 300);
    },

    wordComplete() {
      // (Logging move to nextWord as word starts)

      const wordLength = currentWord!.kana.length;
      let scoreGain = wordLength * CONFIG.BASE_SCORE_PER_CHAR;
      const multiplier = 1 + currentCombo * CONFIG.COMBO_MULTIPLIER;
      scoreGain = Math.floor(scoreGain * multiplier);

      if (!hasErrorInWord) {
        const timeBonus = Math.max(1, Math.floor(wordLength / 2));
        const prevTime = timeLeft;
        timeLeft = Math.min(CONFIG.MAX_TIME, timeLeft + timeBonus);
        const actualBonus = timeLeft - prevTime;

        if (actualBonus > 0) {
          showBonus(timeBonuses, `PERFECT +${actualBonus}`, "perfect");
        } else {
          showBonus(timeBonuses, "MAX!", "perfect");
        }

        scoreGain += CONFIG.PERFECT_SCORE_BONUS;
        AudioEngine.playBonus();
      }

      score += scoreGain;
      let bonusText = `+${scoreGain}`;
      if (currentCombo > 1) bonusText += ` (x${multiplier.toFixed(1)})`;
      showBonus(scoreBonuses, bonusText, "");

      this.nextWord();
    },

    gameOver() {
      isPlaying = false;
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
      AudioEngine.playGameOver();

      const total = correctKeys + wrongKeys;
      const accuracy =
        total === 0 ? 0 : ((correctKeys / total) * 100).toFixed(1);
      const duration = (Date.now() - startTime) / 1000;
      const kpm = Math.round((correctKeys / duration) * 60);

      gameStats = { score, accuracy, kpm, maxCombo, wrong: wrongKeys };

      // Send to server for verification (Official word list only)
      if (!isCustomCSV) {
        this.submitToServer(score);
      } else {
        message = "✓ FINISHED (CUSTOM LIST - OFFLINE)";
      }

      // Save to local history
      this.saveToLocalHistory({
        score,
        accuracy,
        kpm,
        date: new Date().toISOString(),
      });
    },

    saveToLocalHistory(entry: HistoryEntry) {
      scoreHistory = [entry, ...scoreHistory].slice(0, 50); // Keep last 50
      localStorage.setItem("typing_game_history", JSON.stringify(scoreHistory));
    },

    async submitToServer(currentScore: number) {
      if (!currentGameId) return;

      try {
        const fd = new FormData();
        fd.append(
          "json",
          JSON.stringify({
            score: currentScore,
            keyLog,
            playedWords,
            duration: (Date.now() - startTime) / 1000,
            gameId: currentGameId,
            userId,
            username,
          }),
        );

        const response = await fetch("?/submitScore", {
          method: "POST",
          body: fd,
        });

        currentGameId = null;

        const result = (await response.json()) as any;
        // SvelteKit action returns a devalue-encoded array. The actual returned object is at index 0.
        const actionData = result.data ? JSON.parse(result.data) : null;
        const verifiedData = Array.isArray(actionData)
          ? actionData[0]
          : actionData;

        if (response.ok && verifiedData?.success) {
          message = "✓ SCORE VERIFIED";
          // If a personal best was achieved, update the ranking status
          if (verifiedData.isNewRecord) {
            isRankingSubmitted = true;
          }
        } else {
          console.error("Server verification failed:", result);
          message = "⚠ VERIFICATION FAILED";
          const errMsg = verifiedData?.message || (result as any)?.message;
          if (errMsg) {
            message += `: ${errMsg}`;
          }
        }
      } catch (e) {
        console.error("Submission error:", e);
        message = "COMMUNICATION ERROR";
      }
    },

    async registerRanking(newName: string) {
      if (!userId || isSubmittingRanking) return;

      isSubmittingRanking = true;
      try {
        const fd = new FormData();
        // Since we only save personal bests, this registration button is primarily for
        // updating the name or submitting the current session if it was a personal best.
        // The server-side logic already handles the "personal best" check.
        fd.append(
          "json",
          JSON.stringify({
            userId,
            username: newName,
          }),
        );

        const response = await fetch("?/registerName", {
          method: "POST",
          body: fd,
        });

        const result = (await response.json()) as any;
        const actionData = result.data ? JSON.parse(result.data) : null;
        const verifiedData = Array.isArray(actionData)
          ? actionData[0]
          : actionData;

        if (response.ok && verifiedData?.success) {
          isRankingSubmitted = true;
          username = newName;
          localStorage.setItem("typing_game_username", username);
          message = "✓ RANKING REGISTERED";
        } else {
          message = "⚠ REGISTRATION FAILED";
        }
      } catch (e) {
        console.error("Reg error:", e);
        message = "COMMUNICATION ERROR";
      } finally {
        isSubmittingRanking = false;
      }
    },

    importTransferId() {
      if (
        !transferInput ||
        !transferInput.startsWith("usr_") ||
        transferInput.length !== 64
      ) {
        alert(
          "Invalid Transfer ID. Must start with 'usr_' and be 64 characters.",
        );
        return;
      }
      if (
        confirm(
          "Importing this ID will overwrite your current progress. Continue?",
        )
      ) {
        localStorage.setItem("typing_game_user_id", transferInput);
        location.reload(); // Reload to apply new ID and fetch rankings
      }
    },
  };

  onMount(async () => {
    // Load or generate user_id
    userId = localStorage.getItem("typing_game_user_id") || "";
    username = localStorage.getItem("typing_game_username") || "";
    const savedHistory = localStorage.getItem("typing_game_history");
    if (savedHistory) {
      try {
        scoreHistory = JSON.parse(savedHistory);
      } catch (e) {
        console.error("Failed to parse history:", e);
      }
    }

    // Load input mode preference
    const savedInputMode = localStorage.getItem("typing_game_input_mode");
    if (savedInputMode === "flick" || savedInputMode === "halfwidth") {
      inputMode = savedInputMode;
    }

    if (!userId) {
      const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      let rand = "";
      for (let i = 0; i < 60; i++) {
        rand += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      userId = "usr_" + rand;
      localStorage.setItem("typing_game_user_id", userId);
    }

    // Update URL if userId is set but not in params (for SSR userBest)
    const url = new URL(window.location.href);
    if (!url.searchParams.has("userId")) {
      url.searchParams.set("userId", userId);
      replaceState(url.toString(), {});
    }
    clickHandler = () => {
      if (isPlaying) hiddenInputEl?.focus();
    };
    document.addEventListener("click", clickHandler);

    keydownHandler = (e: KeyboardEvent) => {
      if (!isPlaying) return;
      let char = "";
      if (e.code && e.code.startsWith("Key"))
        char = e.code.slice(3).toLowerCase();
      else if (e.code === "Minus") char = "-";
      if (char) {
        e.preventDefault();
        Game.processInput(char);
      }
    };
    document.addEventListener("keydown", keydownHandler);

    // Initialize game with data from server
    await Game.init();
  });

  onDestroy(() => {
    if (timerId) clearInterval(timerId);
    if (typeof document !== "undefined") {
      document.removeEventListener("click", clickHandler);
      document.removeEventListener("keydown", keydownHandler);
    }
  });

  let compositionText = "";
  let isComposing = false;

  // 特殊文字(濁音、半濁音、拗音、小文字)かどうかを判定
  function isSpecialChar(char: string): boolean {
    // 濁音: が ぎ ぐ げ ご ざ じ ず ぜ ぞ だ ぢ づ で ど ば び ぶ べ ぼ
    // 半濁音: ぱ ぴ ぷ ぺ ぽ
    // 拗音: きゃ きゅ きょ しゃ しゅ しょ ちゃ ちゅ ちょ にゃ にゅ にょ ひゃ ひゅ ひょ みゃ みゅ みょ りゃ りゅ りょ ぎゃ ぎゅ ぎょ じゃ じゅ じょ びゃ びゅ びょ ぴゃ ぴゅ ぴょ
    // 小文字: ぁ ぃ ぅ ぇ ぉ っ ゃ ゅ ょ ゎ
    const specialChars =
      /[がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽぁぃぅぇぉっゃゅょゎ]|[きしちにひみりぎじびぴ][ゃゅょ]/;
    return specialChars.test(char);
  }

  function handleCompositionStart(e: CompositionEvent) {
    isComposing = true;
    compositionText = "";
    composingText = "";
  }

  function handleCompositionUpdate(e: CompositionEvent) {
    if (!isPlaying || inputMode !== "flick") {
      compositionText = e.data || "";
      composingText = e.data || "";
      return;
    }

    const inputText = e.data || "";
    compositionText = inputText;

    // 特殊文字のみcomposingTextに表示
    if (currentWord && tokenIndex < currentWord.tokens.length) {
      const targetToken = currentWord.tokens[tokenIndex];

      // 目標が特殊文字の場合のみ表示
      if (isSpecialChar(targetToken)) {
        composingText = inputText;

        // 一致したら即座に処理
        if (inputText === targetToken || inputText.endsWith(targetToken)) {
          Game.processFlickInput(targetToken);
          composingText = "";
          compositionText = "";

          const target = e.target as HTMLInputElement;
          if (target) target.value = "";
        }
      } else {
        // 基本文字の場合は表示しない(inputイベントで処理)
        composingText = "";
      }
    }
  }

  function handleCompositionEnd(e: CompositionEvent) {
    isComposing = false;
    compositionText = "";
    composingText = "";

    if (!isPlaying || inputMode !== "flick") {
      const target = e.target as HTMLInputElement;
      if (target) target.value = "";
      return;
    }

    // エンターで確定された場合のミス判定
    const finalText = e.data || compositionText;
    if (finalText && currentWord && tokenIndex < currentWord.tokens.length) {
      const targetToken = currentWord.tokens[tokenIndex];

      // 特殊文字でない場合、または不一致の場合はミス
      if (!isSpecialChar(targetToken) || finalText !== targetToken) {
        // ただし、既に処理済みの場合はスキップ
        if (finalText !== targetToken) {
          Game.inputError();
        }
      }
    }

    const target = e.target as HTMLInputElement;
    if (target) target.value = "";
  }

  function handleHiddenInput(e: Event) {
    if (!isPlaying) return;

    const target = e.target as HTMLInputElement;
    const val = target.value;

    if (val.length > 0) {
      if (inputMode === "flick") {
        // フリック入力モード
        if (isComposing) {
          // IME変換中は何もしない(compositionupdateで処理)
          return;
        }

        // 変換なしで確定された文字(基本文字)を処理
        const hiragana = val.slice(-1);

        if (currentWord && tokenIndex < currentWord.tokens.length) {
          const targetToken = currentWord.tokens[tokenIndex];

          // 基本文字の場合は即座に判定
          if (!isSpecialChar(targetToken)) {
            if (hiragana === targetToken) {
              Game.processFlickInput(hiragana);
            } else {
              Game.inputError();
            }
          }
          // 特殊文字の場合はcompositionイベントで処理済み
        }

        target.value = "";
      } else {
        // 半角入力モード: 従来通りの処理
        const char = val.slice(-1).toLowerCase();
        if (/^[a-z0-9\-]$/.test(char)) Game.processInput(char);
        target.value = "";
      }
    }
  }

  function toggleInputMode() {
    inputMode = inputMode === "flick" ? "halfwidth" : "flick";
    localStorage.setItem("typing_game_input_mode", inputMode);

    // Force mobile IME to update: blur and refocus the hidden input when focused.
    // Some mobile browsers don't switch keyboard layout until focus changes.
    if (hiddenInputEl) {
      try {
        if (document.activeElement === hiddenInputEl) {
          hiddenInputEl.blur();
          // Small delay to ensure the UA updates the keyboard layout
          setTimeout(() => hiddenInputEl?.focus(), 60);
        } else if (isPlaying) {
          // If game is active, focus to ensure input receives input in the chosen mode
          hiddenInputEl.focus();
        }
      } catch (e) {
        // Ignore focus errors on unusual platforms
        console.error("toggleInputMode focus error:", e);
      }
    }
  }
</script>

<div id="tv-set">
  <div id="screen" class:turn-on-anim={!isPlaying} bind:this={screenEl}>
    <div id="screen-content">
      <h1 id="title">TV TYPE JP</h1>

      <div class="info-bar">
        <span id="score-display-container">
          <span id="score-display">SCORE: {String(score).padStart(3, "0")}</span
          >
          {#each scoreBonuses as bonus (bonus.id)}
            <span class="score-bonus {bonus.type}">{bonus.text}</span>
          {/each}
        </span>
        <span id="time-display-container">
          <span
            id="time-display"
            class:low-time={timeLeft < 10}
            style={timeLeft < 10
              ? "color: oklch(100% 0 0); text-shadow: 0 0 10px oklch(65% 0.2 20);"
              : ""}
          >
            TIME: {timeLeft}
          </span>
          {#each timeBonuses as bonus (bonus.id)}
            <span class="time-bonus {bonus.type}">{bonus.text}</span>
          {/each}
        </span>
      </div>

      <div id="score-rule">
        SCORE = (LEN x {CONFIG.BASE_SCORE_PER_CHAR}) x (1 + COMBO x {Math.round(
          CONFIG.COMBO_MULTIPLIER * 100,
        )}%) + [PERFECT: {CONFIG.PERFECT_SCORE_BONUS}]
      </div>

      {#if gameStats}
        <GameReport
          stats={gameStats}
          {userId}
          currentUsername={username}
          isOnline={!isCustomCSV}
          isSubmitting={isSubmittingRanking}
          isSubmitted={isRankingSubmitted}
          on:submit={(e: any) => Game.registerRanking(e.detail.username)}
        />
      {:else}
        <WordDisplay
          {currentWord}
          {tokenIndex}
          {inputBuffer}
          {composingText}
          {inputMode}
          {errorIndex}
        />
      {/if}

      {#if !isPlaying && !gameStats}
        <div class="ranking-preview">
          <div class="ranking-header">TOP 5 RANKING</div>
          <div class="rank-list">
            {#each top5 as entry, i}
              <div class="rank-item">
                <span class="rank-num">#{i + 1}</span>
                <span class="rank-name">{entry.username}</span>
                <span class="rank-score">{entry.score} pts</span>
              </div>
            {/each}
          </div>
          {#if userBest}
            <div class="user-best">
              YOUR BEST: #{userBest.rank} ({userBest.score} pts / {userBest.kpm}
              KPM)
            </div>
          {/if}
          <div class="ranking-actions">
            <button
              class="btn small subtle"
              on:click={() => (showProfileModal = true)}
              >PROFILE & HISTORY</button
            >
            <a href="{base}/rankings" class="btn small subtle"
              >VIEW ALL RANKINGS</a
            >
          </div>
        </div>
      {/if}

      {#if showProfileModal}
        <div
          class="modal-backdrop"
          role="presentation"
          on:click={() => (showProfileModal = false)}
          on:keydown={(e) => e.key === "Escape" && (showProfileModal = false)}
        >
          <div
            class="modal"
            role="dialog"
            aria-modal="true"
            tabindex="-1"
            on:click|stopPropagation
            on:keydown|stopPropagation
          >
            <h2 style="border-bottom: 2px solid white; padding-bottom: 5px;">
              PROFILE & HISTORY
            </h2>
            <div class="modal-body">
              <!-- Name Change Section -->
              <div class="setting-section">
                <div class="box-label">USER NAME:</div>
                <div class="input-group">
                  <input
                    type="text"
                    maxlength="20"
                    bind:value={username}
                    placeholder="guest"
                    on:change={() => {
                      localStorage.setItem("typing_game_username", username);
                      Game.registerRanking(username);
                    }}
                  />
                  <div class="save-hint">AUTO-SAVES TO RANKING</div>
                </div>
              </div>

              <!-- History Section -->
              <div class="history-section">
                <div class="box-label">RECENT HISTORY:</div>
                <div class="history-list">
                  {#if scoreHistory.length === 0}
                    <div class="no-history">NO GAMES PLAYED YET</div>
                  {:else}
                    <table class="history-table">
                      <thead>
                        <tr>
                          <th>DATE</th>
                          <th>SCORE</th>
                          <th>KPM</th>
                          <th>ACC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {#each scoreHistory as entry}
                          <tr>
                            <td>{new Date(entry.date).toLocaleDateString()}</td>
                            <td style="color: oklch(85% 0.2 90)"
                              >{entry.score}</td
                            >
                            <td>{entry.kpm}</td>
                            <td>{entry.accuracy}%</td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  {/if}
                </div>
              </div>

              <hr
                style="border: 0; border-top: 1px dashed oklch(45% 0 250); margin: 20px 0;"
              />

              <!-- Transfer Section (Hidden by default to keep it clean) -->
              <details class="transfer-details">
                <summary
                  >DATA TRANSFER (ID: {userId.substring(0, 8)}...)</summary
                >
                <div class="transfer-box">
                  <div class="box-label">YOUR TRANSFER ID:</div>
                  <div class="id-display">{userId}</div>
                  <button
                    class="btn small"
                    on:click={() => navigator.clipboard.writeText(userId)}
                    >COPY ID</button
                  >
                </div>
                <div class="import-box">
                  <div class="box-label">IMPORT TRANSFER ID:</div>
                  <input
                    type="text"
                    bind:value={transferInput}
                    placeholder="usr_..."
                    style="width: 100%; margin-bottom: 10px;"
                  />
                  <button
                    class="btn small"
                    on:click={() => Game.importTransferId()}
                    >IMPORT & RELOAD</button
                  >
                </div>
              </details>
            </div>
            <div class="modal-actions">
              <button
                class="btn small subtle"
                on:click={() => (showProfileModal = false)}>CLOSE</button
              >
            </div>
          </div>
        </div>
      {/if}

      <div id="message">{message}</div>
      {#if !isPlaying && !gameStats}
        <div
          id="file-status"
          style="color: {isFileError
            ? 'oklch(65% 0.25 20)'
            : 'oklch(80% 0.2 160)'}"
        >
          {fileStatus}
          <span
            style="font-size: 0.7rem; margin-left:10px; opacity: 0.8; color: {isCustomCSV
              ? 'oklch(65% 0.2 40)'
              : 'oklch(80% 0.2 160)'}"
          >
            [{isCustomCSV ? "CUSTOM / OFFLINE" : "OFFICIAL / ONLINE"}]
          </span>
          {#if lastErrors.length > 0}
            <button
              id="show-errors-btn"
              class="btn small subtle"
              on:click={() => (showErrorList = true)}
              style="margin-left:10px;"
              aria-label="Show CSV errors"
            >
              Errors ({lastErrors.length})
            </button>
          {/if}
        </div>
      {/if}

      <div
        id="controls-container"
        style="display: {!isPlaying ? 'block' : 'none'}"
      >
        {#if !gameStats}
          <label for="csv-input" class="btn file-btn">LOAD CSV</label>
          <input
            type="file"
            id="csv-input"
            accept=".csv"
            style="display:none"
            on:change={(e) => Game.handleFile(e)}
          />
        {/if}
        <button
          id="start-btn"
          class="btn"
          disabled={!isStartEnabled || isPreparing}
          class:disabled={!isStartEnabled || isPreparing}
          on:click={() => Game.start()}
        >
          {gameStats ? "RETRY" : isPreparing ? "LOADING..." : "START GAME"}
        </button>
        <button
          class="btn input-mode-toggle"
          on:click={toggleInputMode}
          title="入力モード切替"
        >
          {inputMode === "flick" ? "📱 フリック入力" : "🔤 半角入力"}
        </button>
      </div>

      {#if showErrorList}
        <div
          class="modal-backdrop"
          role="presentation"
          on:click={() => (showErrorList = false)}
          on:keydown={(e) => e.key === "Escape" && (showErrorList = false)}
        >
          <div
            class="modal"
            role="dialog"
            aria-modal="true"
            tabindex="-1"
            on:click|stopPropagation
            on:keydown|stopPropagation
          >
            <h2>CSV Error List</h2>
            <div class="modal-body">
              <ul>
                {#each lastErrors as err}
                  <li>{err}</li>
                {/each}
              </ul>
            </div>
            <div class="modal-actions">
              <button class="btn" on:click={() => (showErrorList = false)}
                >Close</button
              >
            </div>
          </div>
        </div>
      {/if}

      <input
        type="text"
        id="hidden-input"
        inputmode={inputMode === "flick" ? undefined : "text"}
        lang={inputMode === "flick" ? "ja" : "en"}
        autocomplete="off"
        autocorrect="off"
        autocapitalize="none"
        spellcheck="false"
        bind:this={hiddenInputEl}
        on:input={handleHiddenInput}
        on:compositionstart={handleCompositionStart}
        on:compositionupdate={handleCompositionUpdate}
        on:compositionend={handleCompositionEnd}
      />
    </div>
  </div>
</div>

<style>
  /* --- Base & Reset --- */
  * {
    box-sizing: border-box;
    user-select: none;
    -webkit-user-select: none;
  }

  /* --- The TV Set (Container) --- */
  #tv-set {
    position: relative;
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    display: flex;
    justify-content: center;
    align-items: center;
    background: oklch(15% 0.01 250);
  }

  /* --- The Screen (CRT Effect) --- */
  #screen {
    position: relative;
    width: 90%;
    height: 90%;
    max-width: 1000px;
    max-height: 800px;
    background-color: oklch(20% 0.02 250);
    border-radius: 50% / 10%;
    overflow: hidden;
    box-shadow: inset 0 0 100px oklch(0% 0 0 / 0.9);
    border: 20px solid oklch(25% 0.02 250);
    transform: perspective(1000px) rotateX(1deg);
  }
  #screen::before {
    content: " ";
    display: block;
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    right: 0;
    background: linear-gradient(oklch(0% 0 0 / 0) 50%, oklch(0% 0 0 / 0.25) 50%),
      linear-gradient(
        90deg,
        oklch(60% 0.15 20 / 0.06),
        oklch(60% 0.15 140 / 0.02),
        oklch(60% 0.15 260 / 0.06)
      );
    z-index: 10;
    background-size:
      100% 2px,
      3px 100%;
    pointer-events: none;
  }

  /* Screen Glow & Flicker */
  #screen-content {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: radial-gradient(
      circle,
      oklch(90% 0.02 250 / 0.1) 0%,
      oklch(0% 0 0 / 0.8) 90%
    );
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    z-index: 5;
    padding: 20px;
    animation: flicker 0.15s infinite;
    text-shadow:
      0 0 4px oklch(100% 0 0 / 0.6),
      2px 2px 0 oklch(0% 0 0 / 0.5);
  }

  /* --- Typography & Elements --- */
  h1 {
    font-size: 3rem;
    margin: 0 0 10px 0;
    letter-spacing: 5px;
    text-transform: uppercase;
    border-bottom: 4px solid oklch(100% 0 0);
    padding-bottom: 5px;
  }

  .info-bar {
    display: flex;
    justify-content: space-between;
    width: 80%;
    font-size: 1.5rem;
    margin-bottom: 5px;
    border-top: 2px solid oklch(45% 0 250);
    border-bottom: 2px solid oklch(45% 0 250);
    padding: 10px 0;
    position: relative;
  }

  /* スコア計算式表示のスタイル調整 */
  #score-rule {
    font-size: 0.8rem;
    color: oklch(65% 0.01 250);
    margin-bottom: 10px;
    letter-spacing: 1px;
    text-transform: uppercase;
    width: 95%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Animations & Effects */
  .time-bonus,
  .score-bonus {
    position: absolute;
    font-weight: bold;
    font-size: 1.2rem;
    animation: floatUp 1s ease-out forwards;
    pointer-events: none;
    white-space: nowrap;
    z-index: 20;
  }
  .time-bonus {
    right: 0;
    top: -30px;
    color: oklch(80% 0.2 160);
  }
  .time-bonus.perfect {
    color: oklch(80% 0.2 190);
    text-shadow: 0 0 5px oklch(80% 0.2 190);
    font-size: 1.4rem;
  }
  .time-bonus.error {
    color: oklch(65% 0.2 20);
    text-shadow: 0 0 5px oklch(65% 0.2 20 / 0.8);
  }
  .score-bonus {
    left: 0;
    top: -30px;
    color: oklch(85% 0.2 90);
  }

  #message {
    font-size: 1.5rem;
    margin-top: 10px;
    min-height: 2rem;
  }

  .ranking-preview {
    margin-top: 20px;
    width: 60%;
    border: 1px solid oklch(45% 0 250);
    padding: 10px;
    background: oklch(10% 0 0 / 0.5);
  }

  .ranking-header {
    font-size: 0.9rem;
    color: oklch(45% 0 250);
    margin-bottom: 5px;
    border-bottom: 1px solid oklch(45% 0 250);
  }

  .rank-list {
    text-align: left;
    font-size: 1rem;
  }

  .rank-item {
    display: flex;
    justify-content: space-between;
    margin: 2px 0;
  }

  .rank-num {
    color: oklch(75% 0 0);
    width: 30px;
  }

  .rank-name {
    flex: 1;
    color: oklch(100% 0 0);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rank-score {
    color: oklch(85% 0.2 90);
  }

  .user-best {
    margin-top: 10px;
    font-size: 0.8rem;
    color: oklch(80% 0.2 160);
    border-top: 1px dashed oklch(45% 0 250);
    padding-top: 5px;
  }

  .btn {
    background: transparent;
    border: 2px solid oklch(100% 0 0);
    color: oklch(100% 0 0);
    padding: 15px 40px;
    font-size: 1.5rem;
    font-family: inherit;
    cursor: pointer;
    text-transform: uppercase;
    margin-top: 10px;
    box-shadow: 0 0 10px oklch(100% 0 0 / 0.5);
    transition: all 0.2s;
    outline: none;
    display: inline-block;
    text-decoration: none;
  }
  .btn:hover,
  .btn:focus {
    background: oklch(100% 0 0);
    color: oklch(0% 0 0);
    box-shadow: 0 0 20px oklch(100% 0 0 / 0.8);
  }
  .btn[disabled],
  .btn.disabled {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
    filter: grayscale(40%);
  }

  .file-btn {
    font-size: 1.2rem;
    padding: 10px 30px;
    border-style: dashed;
    margin-bottom: 20px;
  }

  #controls-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    width: 100%;
  }

  .input-mode-toggle {
    font-size: 1rem;
    padding: 8px 20px;
    margin-top: 5px;
    border-color: oklch(70% 0.15 200);
    color: oklch(70% 0.15 200);
    box-shadow: 0 0 8px oklch(70% 0.15 200 / 0.4);
  }

  .input-mode-toggle:hover,
  .input-mode-toggle:focus {
    background: oklch(70% 0.15 200);
    color: oklch(0% 0 0);
    box-shadow: 0 0 15px oklch(70% 0.15 200 / 0.7);
  }

  #file-status {
    font-size: 1rem;
    color: oklch(80% 0.2 160);
    min-height: 1.5rem;
    margin-bottom: 10px;
  }
  #hidden-input {
    position: absolute;
    opacity: 0;
    top: -1000px;
  }

  @keyframes floatUp {
    0% {
      opacity: 1;
      transform: translateY(0);
    }
    100% {
      opacity: 0;
      transform: translateY(-20px);
    }
  }
  @keyframes flicker {
    0% {
      opacity: 0.95;
    }
    5% {
      opacity: 0.85;
    }
    10% {
      opacity: 0.95;
    }
    15% {
      opacity: 1;
    }
    50% {
      opacity: 0.95;
    }
    100% {
      opacity: 0.95;
    }
  }
  @keyframes blink-caret {
    0%,
    100% {
      border-bottom: 4px solid transparent;
    }
    50% {
      border-bottom: 4px solid oklch(100% 0 0);
    }
  }
  @keyframes shake {
    0%,
    100% {
      transform: translateX(0);
    }
    25%,
    75% {
      transform: translateX(-5px);
    }
    50% {
      transform: translateX(5px);
    }
  }
  @keyframes turn-on {
    0% {
      transform: scale(1, 0.01);
      filter: brightness(3);
    }
    60% {
      transform: scale(1, 1);
      filter: brightness(1);
    }
    100% {
      transform: scale(1, 1);
      filter: brightness(1);
    }
  }
  .turn-on-anim {
    animation: turn-on 0.4s cubic-bezier(0.23, 1, 0.32, 1) forwards;
  }

  /* Modal for CSV error list */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    z-index: 50;
    padding: 20px;
  }
  .modal {
    background: oklch(20% 0.02 250);
    border: 4px solid oklch(100% 0 0);
    padding: 20px;
    max-width: 600px;
    width: 100%;
    max-height: 70vh;
    overflow: auto;
    text-align: left;
    box-shadow: 0 0 30px rgba(0, 0, 0, 0.6);
  }
  .modal h2 {
    margin-top: 0;
  }
  .modal-body ul {
    padding-left: 1rem;
    margin: 0;
  }
  .modal-body li {
    margin-bottom: 6px;
    font-family: monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .transfer-box,
  .import-box {
    margin-top: 15px;
    padding: 10px;
    border: 1px solid oklch(45% 0 250);
    background: oklch(10% 0 0 / 0.3);
  }

  .box-label {
    font-size: 0.7rem;
    color: oklch(45% 0 250);
    margin-bottom: 5px;
  }

  .id-display {
    font-family: monospace;
    font-size: 0.7rem;
    background: black;
    color: oklch(85% 0.2 90);
    padding: 10px;
    word-break: break-all;
    margin-bottom: 5px;
    border: 1px solid oklch(25% 0 250);
  }

  .modal-actions {
    margin-top: 12px;
    text-align: right;
  }
  .btn.small {
    padding: 6px 10px;
    font-size: 0.9rem;
  }

  /* Subtle variant for less prominent buttons (e.g., CSV errors) */
  .btn.subtle,
  .btn.small.subtle {
    border-color: oklch(55% 0.01 250);
    color: oklch(55% 0.01 250);
    box-shadow: none;
    background: transparent;
    transition:
      background 0.15s,
      color 0.15s,
      box-shadow 0.15s;
  }
  .btn.subtle:hover,
  .btn.small.subtle:hover,
  .btn.subtle:focus,
  .btn.small.subtle:focus {
    background: oklch(55% 0.01 250 / 0.06);
    color: oklch(100% 0 0);
    box-shadow: none;
  }

  /* --- Profile Modal Styles --- */
  .setting-section,
  .history-section {
    margin-bottom: 20px;
    text-align: left;
  }
  .input-group {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .save-hint {
    font-size: 0.6rem;
    color: oklch(50% 0.1 150);
    letter-spacing: 1px;
  }
  .history-list {
    margin-top: 10px;
    background: oklch(10% 0 0 / 0.5);
    border: 1px solid oklch(25% 0 250);
    max-height: 200px;
    overflow-y: auto;
  }
  .history-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }
  .history-table th {
    font-size: 0.6rem;
    padding: 5px;
    text-align: left;
    border-bottom: 1px solid oklch(45% 0 250);
    color: oklch(45% 0 250);
  }
  .history-table td {
    padding: 5px;
    border-bottom: 1px dashed oklch(20% 0 250);
  }
  .no-history {
    padding: 20px;
    font-size: 0.8rem;
    color: oklch(35% 0 250);
    text-align: center;
  }
  .transfer-details {
    font-size: 0.8rem;
    color: oklch(45% 0 250);
  }
  .transfer-details summary {
    cursor: pointer;
    padding: 5px 0;
    transition: color 0.2s;
  }
  .transfer-details summary:hover {
    color: white;
  }
  .ranking-actions {
    margin-top: 10px;
    display: flex;
    gap: 5px;
    justify-content: center;
  }

  @media (max-width: 600px) {
    #tv-set {
      align-items: flex-start;
      padding: 0;
      overflow-y: auto;
      overflow-x: hidden;
    }

    #screen {
      width: 100%;
      height: auto;
      min-height: 100vh;
      min-height: 100dvh;
      max-width: none;
      max-height: none;
      border: none;
      border-radius: 0;
      transform: none;
      box-shadow: none;
    }

    #screen-content {
      padding: 15px;
      min-height: 100vh;
      min-height: 100dvh;
      justify-content: flex-start;
      padding-top: 20px;
      padding-bottom: 60vh; /* キーボード表示時のスペース確保 */
    }

    h1 {
      font-size: 1.8rem;
      letter-spacing: 3px;
      margin-bottom: 15px;
    }

    .info-bar {
      font-size: 1rem;
      width: 100%;
      padding: 8px 0;
      flex-wrap: wrap;
      gap: 5px;
    }

    #score-display-container,
    #time-display-container {
      flex: 1 1 45%;
      min-width: 120px;
    }

    #score-rule {
      font-size: 0.65rem;
      width: 100%;
    }

    .btn {
      padding: 12px 30px;
      font-size: 1.2rem;
      margin-top: 5px;
      margin-bottom: 5px;
      width: auto;
      min-width: 200px;
    }

    .btn.small {
      padding: 8px 15px;
      font-size: 0.85rem;
      min-width: auto;
    }

    .file-btn {
      font-size: 1rem;
      padding: 10px 25px;
      margin-bottom: 5px;
      margin-top: 5px;
      min-width: 200px;
    }

    #controls-container {
      gap: 5px;
      margin-top: 10px;
    }

    #message {
      font-size: 1.2rem;
      margin-top: 8px;
    }

    .ranking-preview {
      width: 95%;
      padding: 8px;
      margin-top: 15px;
    }

    .rank-list {
      font-size: 0.9rem;
    }

    .modal {
      max-width: 95%;
      padding: 15px;
      max-height: 80vh;
    }

    .modal h2 {
      font-size: 1.3rem;
    }

    /* タッチ操作の改善 */
    .btn,
    button,
    label {
      -webkit-tap-highlight-color: rgba(255, 255, 255, 0.1);
    }

    /* スクロール時のパフォーマンス改善 */
    #tv-set {
      -webkit-overflow-scrolling: touch;
    }
  }
</style>
