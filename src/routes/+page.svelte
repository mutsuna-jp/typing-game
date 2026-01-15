<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  export let data: { words?: Word[]; errors?: string[]; count?: number } = {};

  // Type aliases
  type KanaTable = Record<string, string[]>;
  type Word = { disp: string; kana: string };
  type DOMMap = Record<
    string,
    HTMLElement | HTMLInputElement | HTMLButtonElement | null
  >;
  type GameStats = {
    score: number;
    accuracy: number | string;
    kpm: number;
    maxCombo: number;
    wrong: number;
  };

  // Element refs (bound in template with bind:this)
  let wordDisplay: HTMLElement | null = null;
  let kanjiDisplay: HTMLElement | null = null;
  let romajiDisplay: HTMLElement | null = null;
  let scoreDisplay: HTMLElement | null = null;
  let timeDisplay: HTMLElement | null = null;
  let messageEl: HTMLElement | null = null;
  let startBtnEl: HTMLButtonElement | null = null;
  let hiddenInputEl: HTMLInputElement | null = null;
  let screenEl: HTMLElement | null = null;
  let resultContainerEl: HTMLElement | null = null;
  let wordContainerEl: HTMLElement | null = null;
  let csvInputEl: HTMLInputElement | null = null;
  let fileStatusEl: HTMLElement | null = null;
  let controlsContainerEl: HTMLElement | null = null;
  let scoreDisplayContainerEl: HTMLElement | null = null;
  let timeDisplayContainerEl: HTMLElement | null = null;
  let scoreRuleEl: HTMLElement | null = null;

  /**
   * Configuration Constants
   */
  const CONFIG = {
    DEFAULT_TIME: 60,
    BASE_SCORE_PER_CHAR: 5, // 10 -> 5: 文字数あたりの点数をマイルドに
    COMBO_MULTIPLIER: 0.05, // 0.1 -> 0.05: 倍率の上昇を緩やかに
    PERFECT_SCORE_BONUS: 20, // 50 -> 20: 固定ボーナスを抑制

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
      vol: number
    ) {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type as OscillatorType;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(vol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.01,
        this.ctx.currentTime + duration
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

  import { KanaEngine, parseWords } from "$lib/word-utils";
import { base } from '$app/paths';
  /**
   * Word Manager
   * Handles word list storage, CSV loading, and difficulty scaling logic.
   */
  const WordManager: {
    rawList: Word[];
    activeList: Word[];
    lastErrors: string[];
    init(initialWords?: Word[]): Promise<number>;
    updateActiveList(): void;
    loadCSV(text: string): number;
    getNextWord(elapsedTime: number): Word & { tokens: string[] };
  } = {
    rawList: [],
    activeList: [],
    lastErrors: [],

    async init(initialWords?: Word[]) {
      // If server provided initialWords, use them (SSR preload). Otherwise try fetching static CSV.
      if (initialWords && initialWords.length > 0) {
        this.rawList = initialWords;
        this.updateActiveList();
        return initialWords.length;
      }

      // Try to load words from the static CSV file. If unavailable, fall back to empty list.
      try {
        const res = await fetch(`${base}/words.csv`);
        if (res.ok) {
          const text = await res.text();
          const { words, errors } = parseWords(text);
          this.lastErrors = errors;
          if (words.length > 0) {
            this.rawList = words;
            this.updateActiveList();
            return words.length;
          } else {
            this.updateActiveList();
            return 0;
          }
        } else {
          this.updateActiveList();
          return 0;
        }
      } catch (e) {
        this.updateActiveList();
        return 0;
      }
    },

    // Filter and prepare list (remove incompatible words)
    updateActiveList() {
      this.activeList = this.rawList.filter((w) => !w.kana.includes("ー"));
    },

    // Parse CSV text and update list (delegates to shared parser)
    loadCSV(text: string) {
      const { words, errors } = parseWords(text);
      this.lastErrors = errors;
      if (words.length > 0) {
        this.rawList = words;
        this.updateActiveList();
      }
      return words.length;
    },

    // Select a word based on difficulty (elapsed time)
    getNextWord(elapsedTime: number) {
      let min: number, max: number;
      if (elapsedTime < CONFIG.DIFFICULTY_THRESHOLDS[0]) {
        ({ min, max } = CONFIG.WORD_LENGTHS.LEVEL1);
      } else if (elapsedTime < CONFIG.DIFFICULTY_THRESHOLDS[1]) {
        ({ min, max } = CONFIG.WORD_LENGTHS.LEVEL2);
      } else if (elapsedTime < CONFIG.DIFFICULTY_THRESHOLDS[2]) {
        ({ min, max } = CONFIG.WORD_LENGTHS.LEVEL3);
      } else {
        ({ min, max } = CONFIG.WORD_LENGTHS.LEVEL4);
      }

      let candidates = this.activeList.filter(
        (w) => w.kana.length >= min && w.kana.length <= max
      );
      // Fallbacks
      if (candidates.length === 0) candidates = this.activeList;
      if (candidates.length === 0)
        candidates = [{ disp: "NO DATA", kana: "nodata" }];

      const wordObj = candidates[Math.floor(Math.random() * candidates.length)];
      return {
        ...wordObj,
        tokens: KanaEngine.tokenize(wordObj.kana),
      };
    },
  };
  /**
   * UI Manager
   * Handles all DOM manipulations.
   */
  const UIManager: {
    dom: DOMMap;
    _clickHandler?: () => void;
    setDom(map: DOMMap): void;
    init(): void;
    attachBrowserHandlers(): void;
    destroy(): void;
    setScoreRuleDisplay(): void;
    setStartEnabled(enabled: boolean): void;
    reset(time: number): void;
    updateScore(score: number): void;
    updateTime(time: number): void;
    updateMessage(text: string): void;
    showFileStatus(msg: string, isError: boolean): void;
    renderWord(
      currentWord: Word & { tokens: string[] },
      tokenIndex: number,
      inputBuffer: string
    ): void;
    visualizeError(index: number): void;
    showFloatBonus(containerId: string, text: string, className: string): void;
    showGameOver(stats: GameStats): void;
  } = {
    dom: {},
    setDom(map: DOMMap) {
      this.dom = map;
    },
    init(): void {
      // Set Score Rule Text dynamically
      this.setScoreRuleDisplay();

      // Input focus binding (store handler for cleanup)
      this._clickHandler = () => {
        if (Game.state?.isPlaying) this.dom["hidden-input"]?.focus();
      };
    },

    attachBrowserHandlers(): void {
      if (typeof document !== "undefined" && this._clickHandler) {
        document.addEventListener("click", this._clickHandler);
      }
    },

    destroy(): void {
      if (typeof document !== "undefined" && this._clickHandler)
        document.removeEventListener("click", this._clickHandler);
    },

    setScoreRuleDisplay(): void {
      const base = CONFIG.BASE_SCORE_PER_CHAR;
      const comboPct = Math.round(CONFIG.COMBO_MULTIPLIER * 100);
      const perfect = CONFIG.PERFECT_SCORE_BONUS;
      if (this.dom["score-rule"])
        this.dom["score-rule"].innerText =
          `SCORE = (LEN x ${base}) x (1 + COMBO x ${comboPct}%) + [PERFECT: ${perfect}]`;
    },

    setStartEnabled(enabled: boolean): void {
      const btn = this.dom["start-btn"] as HTMLButtonElement | null;
      if (!btn) return;
      btn.disabled = !enabled;
      if (enabled) {
        btn.classList.remove("disabled");
      } else {
        btn.classList.add("disabled");
      }
    },

    reset(time: number) {
      this.updateScore(0);
      this.updateTime(time);
      this.dom["result-container"]!.style.display = "none";
      this.dom["word-container"]!.style.display = "flex";
      this.dom["controls-container"]!.style.display = "none";
      this.dom["file-status"]!.style.display = "none";
      this.dom["start-btn"]!.style.display = "none";

      this.dom["screen"]!.classList.remove("turn-on-anim");
      void this.dom["screen"]!.offsetWidth; // reflow
      this.dom["screen"]!.classList.add("turn-on-anim");
    },

    updateScore(score: number) {
      if (this.dom["score-display"])
        this.dom["score-display"].innerText =
          `SCORE: ${String(score).padStart(3, "0")}`;
    },

    updateTime(time: number) {
      const el = this.dom["time-display"] as HTMLElement | null;
      if (!el) return;
      el.innerText = `TIME: ${time}`;
      el.style.color = time < 10 ? "#fff" : "";
      el.style.textShadow = time < 10 ? "0 0 10px red" : "";
    },

    updateMessage(text: string) {
      if (this.dom["message"]) this.dom["message"]!.innerText = text;
    },

    showFileStatus(msg: string, isError: boolean) {
      const el = this.dom["file-status"] as HTMLElement | null;
      if (!el) return;
      el.innerText = msg;
      el.style.color = isError ? "#ff5555" : "#00ffaa";
    },

    renderWord(currentWord, tokenIndex, inputBuffer) {
      if (this.dom["kanji-display"])
        this.dom["kanji-display"].innerText = currentWord.disp;
      const wordEl = this.dom["word-display"];
      if (!wordEl) return;
      wordEl.innerHTML = "";

      // Render Tokens
      currentWord.tokens.forEach((token, index) => {
        const span = document.createElement("span");
        span.innerText = token;
        span.className = "char";
        if (index < tokenIndex) span.classList.add("correct");
        else if (index === tokenIndex) span.classList.add("current");
        wordEl.appendChild(span);
      });

      // Render Hint
      const romajiEl = this.dom["romaji-display"];
      if (!romajiEl) return;
      if (tokenIndex < currentWord.tokens.length) {
        const currToken = currentWord.tokens[tokenIndex];
        const nextToken = currentWord.tokens[tokenIndex + 1];
        const patterns = KanaEngine.getValidPatterns(currToken, nextToken);
        const match =
          patterns.find((p) => p.startsWith(inputBuffer)) || patterns[0];

        if (match) {
          const remaining = match.substring(inputBuffer.length);
          romajiEl.innerHTML = `<span style="color:#444">${inputBuffer}</span>${remaining}`;
        } else {
          romajiEl.innerText = "???";
        }
      } else {
        romajiEl.innerText = "";
      }
    },

    visualizeError(index: number) {
      const wordEl = this.dom["word-display"] as HTMLElement | null;
      if (!wordEl) return;
      const el = wordEl.children[index] as HTMLElement | undefined;
      if (el) {
        el.classList.add("wrong");
        setTimeout(() => el.classList.remove("wrong"), 300);
      }
    },

    showFloatBonus(containerId: string, text: string, className: string) {
      const container = this.dom[containerId] as HTMLElement | null;
      if (!container) return;
      const span = document.createElement("span");
      span.innerText = text;
      span.className = className;
      container.appendChild(span);
      setTimeout(() => {
        if (span.parentNode) span.parentNode.removeChild(span);
      }, 1000);
    },

    showGameOver(stats: GameStats) {
      this.dom["word-container"]!.style.display = "none";
      this.dom["message"]!.innerText = "";
      this.dom["result-container"]!.style.display = "flex";
      this.dom["start-btn"]!.innerText = "RETRY";
      this.dom["controls-container"]!.style.display = "block";
      this.dom["file-status"]!.style.display = "block";
      this.dom["start-btn"]!.style.display = "inline-block";

      // Rank logic
      let rankData = CONFIG.RANKS.D;
      if (stats.score >= CONFIG.RANKS.S.score) rankData = CONFIG.RANKS.S;
      else if (stats.score >= CONFIG.RANKS.A.score) rankData = CONFIG.RANKS.A;
      else if (stats.score >= CONFIG.RANKS.B.score) rankData = CONFIG.RANKS.B;
      else if (stats.score >= CONFIG.RANKS.C.score) rankData = CONFIG.RANKS.C;

      this.dom["result-container"]!.innerHTML = `
                <div style="font-size: 2rem; margin-bottom: 10px; border-bottom: 2px solid #fff;">REPORT</div>
                <div class="stat-row"><span class="stat-label">SCORE</span><span class="stat-value">${stats.score}</span></div>
                <div class="stat-row"><span class="stat-label">ACCURACY</span><span class="stat-value">${stats.accuracy}%</span></div>
                <div class="stat-row"><span class="stat-label">SPEED (KPM)</span><span class="stat-value">${stats.kpm}</span></div>
                <div class="stat-row"><span class="stat-label">MAX COMBO</span><span class="stat-value">${stats.maxCombo}</span></div>
                <div class="stat-row"><span class="stat-label">MISS</span><span class="stat-value" style="color:#ff5555">${stats.wrong}</span></div>
                <div class="rank-display ${rankData.color}">RANK ${rankData.label}</div>
            `;
    },
  };

  /**
   * Game Controller
   * Orchestrates the game loop and state.
   */
  const Game: Record<string, any> = {
    state: {
      isPlaying: false,
      score: 0,
      timeLeft: 0,
      startTime: 0,
      correctKeys: 0,
      wrongKeys: 0,
      currentCombo: 0,
      maxCombo: 0,

      // Current Word State
      currentWord: null, // { disp, kana, tokens }
      tokenIndex: 0,
      inputBuffer: "",
      hasErrorInWord: false,
    },
    timerId: null as number | null,

    async init() {
      // Provide DOM refs to UIManager first so UIManager can show file status
      UIManager.setDom({
        "word-display": wordDisplay,
        "kanji-display": kanjiDisplay,
        "romaji-display": romajiDisplay,
        "score-display": scoreDisplay,
        "time-display": timeDisplay,
        message: messageEl,
        "start-btn": startBtnEl,
        "hidden-input": hiddenInputEl,
        screen: screenEl,
        "result-container": resultContainerEl,
        "word-container": wordContainerEl,
        "csv-input": csvInputEl,
        "file-status": fileStatusEl,
        "controls-container": controlsContainerEl,
        "score-display-container": scoreDisplayContainerEl,
        "time-display-container": timeDisplayContainerEl,
        "score-rule": scoreRuleEl,
      });

      UIManager.init();

      // Try to initialize words from server-provided data or static CSV
      const count = await WordManager.init(data?.words);
      const serverErrCount = data?.errors?.length || 0;
      const errCount = WordManager.lastErrors.length || serverErrCount;
      if (count > 0) {
        UIManager.showFileStatus(
          `FILE LOADED: ${count} WORDS${errCount ? ` (${errCount} ERRORS)` : ""}`,
          errCount > 0
        );
        if (WordManager.lastErrors.length > 0)
          UIManager.updateMessage(
            WordManager.lastErrors.slice(0, 3).join("  ")
          );
        else if (serverErrCount > 0)
          UIManager.updateMessage(data!.errors!.slice(0, 3).join("  "));
      } else {
        UIManager.showFileStatus("NO WORDS LOADED", true);
        if (errCount > 0)
          UIManager.updateMessage(
            (WordManager.lastErrors.length > 0
              ? WordManager.lastErrors
              : data?.errors || []
            )
              .slice(0, 3)
              .join("  ")
          );
        else UIManager.updateMessage("LOAD CSV TO START");
      }

      UIManager.setStartEnabled(count > 0);

      // Event bindings are attached in `attachBrowserHandlers` to keep browser-only code within onMount.
    },

    attachBrowserHandlers() {
      if (UIManager.dom["start-btn"]) {
        this._startClickHandler = () => this.start();
        UIManager.dom["start-btn"].addEventListener(
          "click",
          this._startClickHandler
        );
      }
      if (UIManager.dom["csv-input"]) {
        this._fileChangeHandler = (e: Event) => this.handleFile(e);
        UIManager.dom["csv-input"]!.addEventListener(
          "change",
          this._fileChangeHandler as EventListener
        );
      }

      if (typeof document !== "undefined") {
        this._keydownHandler = (e: KeyboardEvent) => {
          if (!this.state.isPlaying) return;
          let char = "";
          if (e.code && e.code.startsWith("Key"))
            char = e.code.slice(3).toLowerCase();
          else if (e.code === "Minus") char = "-";

          if (char) {
            e.preventDefault();
            this.processInput(char);
          }
        };
        document.addEventListener(
          "keydown",
          this._keydownHandler as EventListener
        );
      }

      if (UIManager.dom["hidden-input"]) {
        this._hiddenInputHandler = (e: Event) => {
          if (!this.state.isPlaying) return;
          const target = e.target as HTMLInputElement | null;
          if (!target) return;
          const val = target.value;
          if (val.length > 0) {
            const char = val.slice(-1).toLowerCase();
            if (/^[a-z0-9\-]$/.test(char)) this.processInput(char);
            target.value = "";
          }
        };
        UIManager.dom["hidden-input"]!.addEventListener(
          "input",
          this._hiddenInputHandler as EventListener
        );
      }
    },

    destroy() {
      // Remove event listeners and clear timers
      if (typeof document !== "undefined") {
        document.removeEventListener("keydown", this._keydownHandler);
      }
      if (this._fileChangeHandler && UIManager.dom["csv-input"])
        UIManager.dom["csv-input"].removeEventListener(
          "change",
          this._fileChangeHandler
        );
      if (this._startClickHandler && UIManager.dom["start-btn"])
        UIManager.dom["start-btn"].removeEventListener(
          "click",
          this._startClickHandler
        );
      if (this._hiddenInputHandler && UIManager.dom["hidden-input"])
        UIManager.dom["hidden-input"].removeEventListener(
          "input",
          this._hiddenInputHandler
        );
      UIManager.destroy();
      clearInterval(this.timerId);
    },

    handleFile(e: Event) {
      const input = e.target as HTMLInputElement | null;
      const file = input?.files ? input.files[0] : null;
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev: ProgressEvent<FileReader>) => {
        try {
          const result = ev.target?.result;
          if (typeof result === "string") {
            const count = WordManager.loadCSV(result);
            const errCount = WordManager.lastErrors.length;
            if (count > 0) {
              UIManager.showFileStatus(
                `FILE LOADED: ${count} WORDS${errCount ? ` (${errCount} ERRORS)` : ""}`,
                errCount > 0
              );
              if (errCount > 0)
                UIManager.updateMessage(
                  WordManager.lastErrors.slice(0, 3).join("  ")
                );
            } else {
              UIManager.showFileStatus(
                errCount
                  ? `ERROR: INVALID CSV (${errCount} ERRORS)`
                  : "ERROR: NO DATA",
                true
              );
              UIManager.updateMessage("LOAD VALID CSV");
            }
            UIManager.setStartEnabled(count > 0);
          }
        } catch {
          UIManager.showFileStatus("ERROR PARSING CSV", true);
        }
      };
      reader.readAsText(file);
    },

    start() {
      if (WordManager.activeList.length === 0) {
        UIManager.updateMessage("LOAD CSV TO START");
        UIManager.showFileStatus("NO WORDS LOADED", true);
        return;
      }

      AudioEngine.init();
      UIManager.updateMessage("TUNING IN...");
      UIManager.reset(CONFIG.DEFAULT_TIME);

      setTimeout(() => {
        this.resetState();
        this.nextWord();
        this.state.isPlaying = true;
        this.timerId = setInterval(
          () => this.tick(),
          1000
        ) as unknown as number;
        UIManager.dom["hidden-input"]?.focus();
        UIManager.updateMessage("");
      }, 800);
    },

    resetState() {
      this.state = {
        isPlaying: false,
        score: 0,
        timeLeft: CONFIG.DEFAULT_TIME,
        startTime: Date.now(),
        correctKeys: 0,
        wrongKeys: 0,
        currentCombo: 0,
        maxCombo: 0,
        currentWord: null,
        tokenIndex: 0,
        inputBuffer: "",
        hasErrorInWord: false,
      };
      UIManager.updateScore(this.state.score);
      UIManager.updateTime(this.state.timeLeft);
    },

    tick() {
      this.state.timeLeft--;
      UIManager.updateTime(this.state.timeLeft);
      if (this.state.timeLeft <= 0) this.gameOver();
    },

    nextWord() {
      const elapsed = (Date.now() - this.state.startTime) / 1000;
      this.state.currentWord = WordManager.getNextWord(elapsed);
      this.state.tokenIndex = 0;
      this.state.inputBuffer = "";
      this.state.hasErrorInWord = false;
      UIManager.renderWord(
        this.state.currentWord,
        this.state.tokenIndex,
        this.state.inputBuffer
      );
    },

    processInput(key: string) {
      const { tokens, tokenIndex, inputBuffer } = this.state.currentWord || {};
      if (!tokens) return;

      const currToken = tokens[this.state.tokenIndex];
      const nextToken = tokens[this.state.tokenIndex + 1];
      const patterns = KanaEngine.getValidPatterns(currToken, nextToken);
      const nextBuffer = this.state.inputBuffer + key;

      // Check if input is a valid prefix for any pattern
      if (patterns.some((p) => p.startsWith(nextBuffer))) {
        this.state.inputBuffer = nextBuffer;
        this.state.correctKeys++;
        this.state.currentCombo++;
        if (this.state.currentCombo > this.state.maxCombo)
          this.state.maxCombo = this.state.currentCombo;
        AudioEngine.playType();

        // Check for exact match handling (including 'n' ambiguity)
        const isMatch = patterns.includes(this.state.inputBuffer);
        const isN_Ambiguity =
          currToken === "ん" &&
          this.state.inputBuffer === "n" &&
          nextToken &&
          /^[aiueoyn]/.test(KanaEngine.table[nextToken]?.[0]);

        if (isMatch && !isN_Ambiguity) {
          this.state.tokenIndex++;
          this.state.inputBuffer = "";

          if (this.state.tokenIndex >= tokens.length) {
            this.wordComplete();
          }
        }
        UIManager.renderWord(
          this.state.currentWord,
          this.state.tokenIndex,
          this.state.inputBuffer
        );
      } else {
        this.inputError();
      }
    },

    inputError() {
      this.state.wrongKeys++;
      this.state.currentCombo = 0;
      this.state.hasErrorInWord = true;
      AudioEngine.playError();
      UIManager.visualizeError(this.state.tokenIndex);
    },

    wordComplete() {
      const wordLength = this.state.currentWord.kana.length;

      // 1. Base Score calculation (Length x BaseScore)
      let scoreGain = wordLength * CONFIG.BASE_SCORE_PER_CHAR;

      // 2. Combo Multiplier
      const multiplier = 1 + this.state.currentCombo * CONFIG.COMBO_MULTIPLIER;
      scoreGain = Math.floor(scoreGain * multiplier);

      // 3. Perfect Bonus (Time Recovery + Extra Score)
      if (!this.state.hasErrorInWord) {
        const timeBonus = Math.max(1, Math.floor(wordLength / 2));
        this.state.timeLeft += timeBonus;
        UIManager.showFloatBonus(
          "time-display-container",
          `PERFECT +${timeBonus}`,
          "time-bonus perfect"
        );

        scoreGain += CONFIG.PERFECT_SCORE_BONUS;
        AudioEngine.playBonus();
      }

      // Apply Score
      this.state.score += scoreGain;

      // Show score gain float
      let bonusText = `+${scoreGain}`;
      if (this.state.currentCombo > 1) {
        bonusText += ` (x${multiplier.toFixed(1)})`;
      }
      UIManager.showFloatBonus(
        "score-display-container",
        bonusText,
        "score-bonus"
      );

      UIManager.updateScore(this.state.score);
      UIManager.updateTime(this.state.timeLeft);
      this.nextWord();
    },

    gameOver() {
      this.state.isPlaying = false;
      clearInterval(this.timerId);
      AudioEngine.playGameOver();

      const total = this.state.correctKeys + this.state.wrongKeys;
      const accuracy =
        total === 0 ? 0 : ((this.state.correctKeys / total) * 100).toFixed(1);
      const duration = (Date.now() - this.state.startTime) / 1000;
      const kpm = Math.round((this.state.correctKeys / duration) * 60);

      UIManager.showGameOver({
        score: this.state.score,
        accuracy: accuracy,
        kpm: kpm,
        maxCombo: this.state.maxCombo,
        wrong: this.state.wrongKeys,
      });
    },
  };

  // Initialize / cleanup with Svelte lifecycle
  onMount(async () => {
    await Game.init();
    // Attach browser-only handlers (keep DOM / document access inside onMount)
    UIManager.attachBrowserHandlers();
    Game.attachBrowserHandlers();
  });
  onDestroy(() => {
    Game.destroy();
  });
</script>

<div id="tv-set">
  <div id="screen" class="turn-on-anim" bind:this={screenEl}>
    <div id="screen-content">
      <h1 id="title">TV TYPE JP</h1>

      <div class="info-bar">
        <span
          id="score-display-container"
          style="position:relative;"
          bind:this={scoreDisplayContainerEl}
        >
          <span id="score-display" bind:this={scoreDisplay}>SCORE: 000</span>
        </span>
        <span
          id="time-display-container"
          style="position:relative;"
          bind:this={timeDisplayContainerEl}
        >
          <span id="time-display" bind:this={timeDisplay}>TIME: 60</span>
        </span>
      </div>

      <div id="score-rule" bind:this={scoreRuleEl}></div>
      <!-- JSで動的に設定 -->

      <div id="word-container" bind:this={wordContainerEl}>
        <div id="kanji-display" bind:this={kanjiDisplay}></div>
        <div id="word-display" bind:this={wordDisplay}>READY?</div>
        <div id="romaji-display" bind:this={romajiDisplay}></div>
      </div>

      <div id="result-container" bind:this={resultContainerEl}></div>
      <div id="message" bind:this={messageEl}>PRESS START OR LOAD CSV</div>
      <div id="file-status" bind:this={fileStatusEl}></div>

      <div id="controls-container" bind:this={controlsContainerEl}>
        <label for="csv-input" class="btn file-btn">LOAD CSV</label>
        <input
          type="file"
          id="csv-input"
          accept=".csv"
          style="display:none"
          bind:this={csvInputEl}
        />
        <button id="start-btn" class="btn" bind:this={startBtnEl}
          >START GAME</button
        >
      </div>

      <input
        type="password"
        id="hidden-input"
        autocomplete="off"
        spellcheck="false"
        bind:this={hiddenInputEl}
      />

      <!-- Keep CSS selectors referenced so Svelte's analyzer sees them (hidden) -->
      <div
        style="display:none; width:0; height:0; overflow:hidden; position:absolute; pointer-events:none;"
      >
        <div class="stat-row">
          <span class="stat-label"></span><span class="stat-value"></span>
        </div>
        <div class="rank-display rank-S"></div>
        <div class="rank-display rank-A"></div>
        <div class="rank-display rank-B"></div>
        <div class="rank-display rank-C"></div>
        <div class="rank-display rank-D"></div>
        <span class="time-bonus"></span>
        <span class="time-bonus perfect"></span>
        <span class="score-bonus"></span>
        <span class="combo-bonus"></span>
        <span class="char correct"></span>
        <span class="char current"></span>
        <span class="char wrong"></span>
      </div>
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
    display: flex;
    justify-content: center;
    align-items: center;
    background: #111;
  }

  /* --- The Screen (CRT Effect) --- */
  #screen {
    position: relative;
    width: 90%;
    height: 90%;
    max-width: 1000px;
    max-height: 800px;
    background-color: #1a1a1a;
    border-radius: 50% / 10%;
    overflow: hidden;
    box-shadow: inset 0 0 100px rgba(0, 0, 0, 0.9);
    border: 20px solid #222;
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
    background: linear-gradient(
        rgba(18, 16, 16, 0) 50%,
        rgba(0, 0, 0, 0.25) 50%
      ),
      linear-gradient(
        90deg,
        rgba(255, 0, 0, 0.06),
        rgba(0, 255, 0, 0.02),
        rgba(0, 0, 255, 0.06)
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
      rgba(220, 220, 220, 0.1) 0%,
      rgba(0, 0, 0, 0.8) 90%
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
      0 0 4px rgba(255, 255, 255, 0.6),
      2px 2px 0 rgba(0, 0, 0, 0.5);
  }

  /* --- Typography & Elements --- */
  h1 {
    font-size: 3rem;
    margin: 0 0 10px 0;
    letter-spacing: 5px;
    text-transform: uppercase;
    border-bottom: 4px solid #fff;
    padding-bottom: 5px;
  }

  .info-bar {
    display: flex;
    justify-content: space-between;
    width: 80%;
    font-size: 1.5rem;
    margin-bottom: 5px;
    border-top: 2px solid #555;
    border-bottom: 2px solid #555;
    padding: 10px 0;
    position: relative;
  }

  /* スコア計算式表示のスタイル調整 */
  #score-rule {
    font-size: 0.8rem;
    color: #888;
    margin-bottom: 10px;
    letter-spacing: 1px;
    text-transform: uppercase;
    width: 95%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  #word-container {
    margin: 10px 0;
    min-height: 200px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
  }

  #kanji-display {
    font-size: 2.5rem;
    color: #00ffaa;
    margin-bottom: 5px;
    text-shadow: 0 0 8px #00ffaa;
    min-height: 1.2em;
    letter-spacing: 0.1em;
  }
  #word-display {
    font-size: 3.5rem;
    font-weight: bold;
    word-break: keep-all;
    white-space: nowrap;
    line-height: 1.2;
  }
  #romaji-display {
    font-size: 1.5rem;
    color: #888;
    margin-top: 10px;
    height: 1.5em;
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  /* Result Stats */
  #result-container {
    display: none;
    flex-direction: column;
    align-items: center;
    width: 100%;
  }
  :global(.stat-row) {
    display: flex;
    justify-content: space-between;
    width: 70%;
    font-size: 1.5rem;
    margin: 5px 0;
    border-bottom: 1px dashed #444;
  }
  :global(.stat-label) {
    color: #aaa;
  }
  :global(.stat-value) {
    color: #fff;
    font-weight: bold;
  }
  :global(.rank-display) {
    font-size: 5rem;
    margin: 10px 0;
    text-shadow: 0 0 15px currentColor;
  }
  :global(.rank-S) {
    color: #ffd700;
  }
  :global(.rank-A) {
    color: #ff0055;
  }
  :global(.rank-B) {
    color: #00ffaa;
  }
  :global(.rank-C) {
    color: #00ccff;
  }
  :global(.rank-D) {
    color: #aaaaaa;
  }

  /* Animations & Effects */
  :global(.time-bonus),
  :global(.score-bonus) {
    position: absolute;
    font-weight: bold;
    font-size: 1.2rem;
    animation: floatUp 1s ease-out forwards;
    pointer-events: none;
    white-space: nowrap;
  }
  :global(.time-bonus) {
    right: 0;
    top: -30px;
    color: #00ffaa;
  }
  :global(.time-bonus.perfect) {
    color: #00ffff;
    text-shadow: 0 0 5px #00ffff;
    font-size: 1.4rem;
  }
  :global(.score-bonus) {
    left: 0;
    top: -30px;
    color: #ffd700;
  }
  :global(.combo-bonus) {
    color: #ff0055;
    font-size: 0.8em;
    margin-left: 5px;
  }

  :global(.char) {
    display: inline-block;
    transition: color 0.1s;
  }
  :global(.char.correct) {
    color: #444;
    text-shadow: none;
  }
  :global(.char.current) {
    text-decoration: underline;
    animation: blink-caret 0.5s infinite;
  }
  :global(.char.wrong) {
    color: #fff;
    background: #000;
    animation: shake 0.3s;
  }

  #message {
    font-size: 1.5rem;
    margin-top: 20px;
    min-height: 2rem;
  }

  .btn {
    background: transparent;
    border: 2px solid #fff;
    color: #fff;
    padding: 15px 40px;
    font-size: 1.5rem;
    font-family: inherit;
    cursor: pointer;
    text-transform: uppercase;
    margin-top: 10px;
    box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
    transition: all 0.2s;
    outline: none;
    display: inline-block;
    text-decoration: none;
  }
  .btn:hover,
  .btn:focus {
    background: #fff;
    color: #000;
    box-shadow: 0 0 20px rgba(255, 255, 255, 0.8);
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
  #file-status {
    font-size: 1rem;
    color: #00ffaa;
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
      border-bottom: 4px solid #fff;
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

  @media (max-width: 600px) {
    h1 {
      font-size: 2rem;
    }
    #kanji-display,
    #word-display {
      font-size: 2rem;
    }
    #romaji-display,
    .info-bar {
      font-size: 1rem;
    }
    .info-bar {
      width: 95%;
    }
    #screen {
      width: 100%;
      height: 60vh;
      border: none;
      border-radius: 0;
    }
  }
</style>
