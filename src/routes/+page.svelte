<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  export let data: { words?: Word[]; errors?: string[]; count?: number } = {};

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
  let hasErrorInWord = false;
  let errorIndex: number | null = null;
  let gameStats: GameStats | null = null;

  // Logging for Anti-cheat
  let keyLog: KeyLog[] = [];
  let playedWords: PlayedWord[] = [];

  let currentGameId: string | null = null;
  let isCustomCSV = false;

  let message = "PRESS START OR LOAD CSV";
  let fileStatus = "";
  let isFileError = false;
  let isStartEnabled = false;

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

    setSeed(seed: number) {
      this.gamePRNG = createPRNG(seed);
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
  let timerId: number | null = null;
  let clickHandler: () => void;
  let keydownHandler: (e: KeyboardEvent) => void;

  const Game = {
    async init() {
      const count = await WordManager.init(data?.words);
      const serverErrCount = data?.errors?.length || 0;
      const errCount = WordManager.lastErrors.length || serverErrCount;

      if (count > 0) {
        fileStatus = `FILE LOADED: ${count} WORDS${errCount ? ` (${errCount} ERRORS)` : ""}`;
        isFileError = errCount > 0;
        if (WordManager.lastErrors.length > 0)
          message = WordManager.lastErrors.slice(0, 3).join("  ");
        else if (serverErrCount > 0)
          message = data!.errors!.slice(0, 3).join("  ");
      } else {
        fileStatus = "NO WORDS LOADED";
        isFileError = true;
        if (errCount > 0)
          message = (
            WordManager.lastErrors.length > 0
              ? WordManager.lastErrors
              : data?.errors || []
          )
            .slice(0, 3)
            .join("  ");
        else message = "LOAD CSV TO START";
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
            fileStatus = `FILE LOADED: ${count} WORDS${errCount ? ` (${errCount} ERRORS)` : ""}`;
            isFileError = errCount > 0;
            if (errCount > 0)
              message = WordManager.lastErrors.slice(0, 3).join("  ");
          } else {
            fileStatus = errCount
              ? `ERROR: INVALID CSV (${errCount} ERRORS)`
              : "ERROR: NO DATA";
            isFileError = true;
            message = "LOAD VALID CSV";
          }
        }
      };
      reader.readAsText(file);
    },

    async start() {
      if (WordManager.activeList.length === 0) {
        message = "LOAD CSV TO START";
        fileStatus = "NO WORDS LOADED";
        isFileError = true;
        return;
      }

      AudioEngine.init();
      message = "PREPARING SESSION...";
      this.resetState();

      try {
        const res = await fetch("?/getGameToken", { method: "POST" });
        const result = (await res.json()) as any;
        const data = JSON.parse(result.data);
        currentGameId = data[1].gameId;
        WordManager.setSeed(data[1].seed);
      } catch (e) {
        console.error("Session error:", e);
        message = "SESSION ERROR. TRY AGAIN.";
        return;
      }

      setTimeout(() => {
        this.nextWord();
        isPlaying = true;
        timerId = setInterval(() => this.tick(), 1000) as unknown as number;
        hiddenInputEl?.focus();
        message = "";
      }, 800);
    },

    resetState() {
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
        timeLeft += timeBonus;
        showBonus(timeBonuses, `PERFECT +${timeBonus}`, "perfect");
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
      if (timerId) clearInterval(timerId);
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

      // Log for verification (Development)
      console.log("Game Session Data:", {
        stats: gameStats,
        playedWordsCount: playedWords.length,
        keyLogCount: keyLog.length,
        playedWords,
        keyLog,
      });
    },

    async submitToServer(currentScore: number) {
      if (!currentGameId) return;

      try {
        const response = await fetch("?/submitScore", {
          method: "POST",
          body: JSON.stringify({
            score: currentScore,
            keyLog,
            playedWords,
            gameId: currentGameId,
          }),
          headers: {
            "Content-Type": "application/json",
          },
        });

        currentGameId = null;

        const result = (await response.json()) as any;
        // SvelteKit action response format is usually nested in 'data'
        const data = JSON.parse(result.data);

        if (response.ok && data[1]?.success) {
          console.log("Server verification success:", data[1]);
          message = "✓ SCORE VERIFIED";
        } else {
          console.error("Server verification failed:", data);
          message = "⚠ VERIFICATION FAILED";
          if (data[1]?.message) {
            message += `: ${data[1].message}`;
          }
        }
      } catch (e) {
        console.error("Submission error:", e);
        message = "COMMUNICATION ERROR";
      }
    },
  };

  onMount(async () => {
    await Game.init();
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
  });

  onDestroy(() => {
    if (timerId) clearInterval(timerId);
    if (typeof document !== "undefined") {
      document.removeEventListener("click", clickHandler);
      document.removeEventListener("keydown", keydownHandler);
    }
  });

  function handleHiddenInput(e: Event) {
    if (!isPlaying) return;
    const target = e.target as HTMLInputElement;
    const val = target.value;
    if (val.length > 0) {
      const char = val.slice(-1).toLowerCase();
      if (/^[a-z0-9\-]$/.test(char)) Game.processInput(char);
      target.value = "";
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
        <GameReport stats={gameStats} />
      {:else}
        <WordDisplay {currentWord} {tokenIndex} {inputBuffer} {errorIndex} />
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
        </div>
      {/if}

      <div
        id="controls-container"
        style="display: {!isPlaying ? 'block' : 'none'}"
      >
        <label for="csv-input" class="btn file-btn">LOAD CSV</label>
        <input
          type="file"
          id="csv-input"
          accept=".csv"
          style="display:none"
          on:change={(e) => Game.handleFile(e)}
        />
        <button
          id="start-btn"
          class="btn"
          disabled={!isStartEnabled}
          class:disabled={!isStartEnabled}
          on:click={() => Game.start()}
        >
          {gameStats ? "RETRY" : "START GAME"}
        </button>
      </div>

      <input
        type="password"
        id="hidden-input"
        autocomplete="off"
        spellcheck="false"
        bind:this={hiddenInputEl}
        on:input={handleHiddenInput}
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
  .score-bonus {
    left: 0;
    top: -30px;
    color: oklch(85% 0.2 90);
  }

  #message {
    font-size: 1.5rem;
    margin-top: 20px;
    min-height: 2rem;
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

  @media (max-width: 600px) {
    h1 {
      font-size: 2rem;
    }
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
