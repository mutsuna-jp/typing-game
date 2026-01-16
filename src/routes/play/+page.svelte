<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { fade, scale } from "svelte/transition";
  import type { PageData } from "./$types";
  import { browser } from "$app/environment";
  import { get } from "svelte/store";
  import { base } from "$app/paths";
  import { goto } from "$app/navigation";

  import WordDisplay from "$lib/components/WordDisplay.svelte";
  import GameReport from "$lib/components/GameReport.svelte";
  import Button from "$lib/components/Button.svelte";

  import {
    WordManager,
    wordActiveList,
    wordLastErrors,
    isCustomCSVStore,
  } from "$lib/engine/WordManager";
  import {
    Game,
    score,
    timeLeft,
    currentCombo,
    maxCombo,
    currentWord,
    tokenIndex,
    inputBuffer,
    errorIndex,
    gameStats,
    scoreBonuses,
    timeBonuses,
    message,
    countdown,
  } from "$lib/engine/GameEngine";
  import { isPlaying, isShaking } from "$lib/stores";
  import { GAME_CONFIG } from "$lib/word-utils";

  let { data }: { data: PageData & { userId?: string } } = $props();

  // Reactive state using Svelte 5 runes
  let userId = $state("");
  let username = $state("");
  let isMobile = $state(false);
  let inputMode = $state<"flick" | "halfwidth">("flick");
  let isComposing = $state(false);
  let composingText = $state("");
  let hiddenInputEl = $state<HTMLInputElement | null>(null);

  const CONFIG = {
    BASE_SCORE_PER_CHAR: GAME_CONFIG.BASE_SCORE_PER_CHAR,
    COMBO_MULTIPLIER: GAME_CONFIG.COMBO_MULTIPLIER,
    PERFECT_SCORE_BONUS: GAME_CONFIG.PERFECT_SCORE_BONUS,
  };

  async function registerRanking(newName: string) {
    if (!userId) return;
    try {
      const fd = new FormData();
      fd.append("json", JSON.stringify({ userId, username: newName }));
      // Action is on the root page
      const response = await fetch(`${base}/?/registerName`, {
        method: "POST",
        body: fd,
      });
      if (response.ok) {
        username = newName;
        localStorage.setItem("typing_game_username", username);
        message.set("✓ RANKING REGISTERED");
      }
    } catch (e) {
      console.error("Reg error:", e);
    }
  }

  async function submitScore() {
    await Game.submitScore(async (payload) => {
      const fd = new FormData();
      fd.append("json", JSON.stringify({ ...payload, userId, username }));
      const response = await fetch(`${base}/play?/submitScore`, {
        method: "POST",
        body: fd,
      });
      if (!response.ok) throw new Error("Server error");
      const resJson = await response.json();
      const actionData = (resJson as any).data
        ? JSON.parse((resJson as any).data)
        : null;
      return Array.isArray(actionData) ? actionData[0] : actionData;
    });
  }

  // Effect to watch for game end and trigger submission
  $effect(() => {
    if ($gameStats && !$isCustomCSVStore && $message === "VERIFYING SCORE...") {
      submitScore();
    }
  });

  onMount(() => {
    isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      ) || window.matchMedia("(max-width: 768px)").matches;

    username = localStorage.getItem("typing_game_username") || "guest";
    userId = localStorage.getItem("typing_game_user_id") || data.userId || "";

    if (isMobile) {
      const saved = localStorage.getItem("typing_game_input_mode");
      if (saved === "flick" || saved === "halfwidth") inputMode = saved;
    } else {
      inputMode = "halfwidth";
    }

    WordManager.init(data.words);

    // Start the game automatically or wait for interaction?
    // According to original code, it waited for Enter or Start button.
    // We'll keep that behavior but allow the Start button to be clear.

    const clickHandler = () => {
      if ($isPlaying) hiddenInputEl?.focus();
    };
    document.addEventListener("click", clickHandler);

    return () => {
      document.removeEventListener("click", clickHandler);
      Game.resetState();
    };
  });

  // Re-use IME logic from original +page.svelte
  function isSpecialChar(char: string): boolean {
    const specialChars =
      /[がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽぁぃぅぇぉっゃゅょゎ]|[きしちにひみりぎじびぴ][ゃゅょ]/;
    return specialChars.test(char);
  }

  function clearComposingState(target: HTMLInputElement | null) {
    isComposing = false;
    composingText = "";
    if (target) {
      target.value = "";
      const endEvent = new CompositionEvent("compositionend", {
        bubbles: true,
        cancelable: true,
        data: "",
      });
      target.dispatchEvent(endEvent);
    }
  }

  function handleCompositionUpdate(e: CompositionEvent) {
    if (!$isPlaying || inputMode !== "flick") return;
    composingText = e.data || "";
    if (!$currentWord || $tokenIndex >= $currentWord.tokens.length) {
      composingText = "";
      return;
    }
    const targetToken = $currentWord.tokens[$tokenIndex];
    const inputText = e.data || "";
    const target = e.target as HTMLInputElement;

    if (inputText === targetToken) {
      Game.processFlickInput(targetToken);
      clearComposingState(target);
    } else if (!targetToken.startsWith(inputText)) {
      if (inputText.length > 0) {
        Game.inputError();
        clearComposingState(target);
      }
    }
  }

  function handleCompositionEnd(e: CompositionEvent) {
    const target = e.target as HTMLInputElement;
    if (!$isPlaying || inputMode !== "flick") {
      clearComposingState(target);
      return;
    }
    const finalText = e.data || composingText;
    if (finalText && $currentWord && $tokenIndex < $currentWord.tokens.length) {
      const targetToken = $currentWord.tokens[$tokenIndex];
      if (!isSpecialChar(targetToken) || finalText !== targetToken) {
        if (finalText !== targetToken) Game.inputError();
      }
    }
    clearComposingState(target);
  }

  function handleHiddenInput(e: Event) {
    if (!$isPlaying) return;
    const target = e.target as HTMLInputElement;
    const val = target.value;
    if (val.length > 0) {
      if (inputMode === "flick") {
        if (!isComposing) {
          composingText = "";
          target.value = "";
        }
      } else {
        const char = val.slice(-1).toLowerCase();
        if (/^[a-z0-9\-]$/.test(char)) Game.processInput(char);
        target.value = "";
      }
    }
  }

  function toggleInputMode() {
    inputMode = inputMode === "flick" ? "halfwidth" : "flick";
    localStorage.setItem("typing_game_input_mode", inputMode);
    if (hiddenInputEl) {
      if (document.activeElement === hiddenInputEl) {
        hiddenInputEl.blur();
        setTimeout(() => hiddenInputEl?.focus(), 60);
      } else if ($isPlaying) {
        hiddenInputEl.focus();
      }
    }
  }
</script>

<div class="game-container" class:shaking={$isShaking}>
  <div class="header-actions">
    <Button class="small subtle" onclick={() => goto(base)}
      >← BACK TO TOP</Button
    >
  </div>

  <h1 id="title">TYPEING</h1>

  {#if $isPlaying || $gameStats}
    <div class="info-bar">
      <div id="score-display-container">
        <span id="score-display">
          <span class="label">SCORE</span><span class="sep">:</span>
          <span class="value">{String($score).padStart(3, "0")}</span>
        </span>
        {#each $scoreBonuses as bonus (bonus.id)}
          <span class="score-bonus {bonus.type}">{bonus.text}</span>
        {/each}
      </div>

      <div id="combo-display" class:visible={$currentCombo > 0}>
        <span class="combo-num">{$currentCombo}</span>
        <span class="combo-label">COMBO</span>
      </div>

      <div id="time-display-container">
        <span id="time-display" class:low-time={$timeLeft < 10}>
          <span class="label">TIME</span><span class="sep">:</span>
          <span class="value">{$timeLeft}</span>
        </span>
        {#each $timeBonuses as bonus (bonus.id)}
          <span class="time-bonus {bonus.type}">{bonus.text}</span>
        {/each}
      </div>
    </div>
  {/if}

  {#if !$isPlaying}
    <div id="score-rule">
      SCORE = (LEN x {CONFIG.BASE_SCORE_PER_CHAR}) x (1 + COMBO x {Math.round(
        CONFIG.COMBO_MULTIPLIER * 100
      )}%) + [PERFECT: {CONFIG.PERFECT_SCORE_BONUS}]
    </div>
  {/if}

  {#if $gameStats}
    <div transition:fade={{ duration: 300 }}>
      <GameReport
        stats={$gameStats}
        {userId}
        currentUsername={username}
        isOnline={!$isCustomCSVStore}
        isSubmitting={$message === "VERIFYING SCORE..."}
        isSubmitted={$message === "✓ SCORE VERIFIED" ||
          $message === "✓ FINISHED (CUSTOM LIST - OFFLINE)"}
        onsubmit={(e: any) => registerRanking(e.detail.username)}
      />
      <div class="retry-actions">
        <Button
          class="small subtle"
          onclick={() => Game.start(fetch, data, hiddenInputEl, `${base}/play`)}
          >RETRY (R)</Button
        >
        <Button class="subtle" onclick={() => goto(base)}>TOP PAGE</Button>
      </div>
    </div>
  {:else}
    <div transition:fade={{ duration: 300 }}>
      <WordDisplay
        currentWord={$currentWord}
        tokenIndex={$tokenIndex}
        inputBuffer={$inputBuffer}
        {composingText}
        {inputMode}
        errorIndex={$errorIndex}
      />
    </div>

    {#if !$isPlaying && $countdown === null}
      <div class="start-prompt">
        <Button
          class="large"
          onclick={() => Game.start(fetch, data, hiddenInputEl, `${base}/play`)}
          >START GAME (ENTER)</Button
        >
        {#if isMobile}
          <Button class="small subtle" onclick={toggleInputMode}>
            MODE: {inputMode === "flick" ? "FLICK" : "HALFWIDTH"}
          </Button>
        {/if}
      </div>
    {/if}
  {/if}

  {#if $countdown !== null}
    <div
      class="countdown-overlay"
      transition:scale={{ duration: 200, start: 2 }}
    >
      {$countdown}
    </div>
  {/if}

  <div id="message">{$message}</div>

  <!-- Hidden Input for mobile/IME support -->
  <input
    type={inputMode === "halfwidth" ? "password" : "text"}
    id="hidden-input"
    bind:this={hiddenInputEl}
    oninput={handleHiddenInput}
    oncompositionstart={() => (isComposing = true)}
    oncompositionupdate={handleCompositionUpdate}
    oncompositionend={handleCompositionEnd}
    autocomplete="off"
    autocorrect="off"
    autocapitalize="none"
    spellcheck="false"
    style="position: absolute; opacity: 0; pointer-events: none; z-index: -1;"
  />
</div>

<style>
  .game-container {
    width: 100%;
    max-width: 800px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    min-height: 400px;
  }

  .header-actions {
    width: 100%;
    display: flex;
    justify-content: flex-start;
    margin-bottom: 1rem;
  }

  .start-prompt {
    margin-top: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    align-items: center;
  }

  .retry-actions {
    margin-top: 2rem;
    display: flex;
    gap: 1rem;
    justify-content: center;
  }

  .shaking {
    animation: shake 0.2s ease-in-out infinite;
  }

  .info-bar {
    width: 100%;
    max-width: 800px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem 1rem;
    margin-bottom: 1.5rem;
    background: var(--panel-bg-strong);
    border: 2px solid var(--accent-outline);
    border-radius: 8px;
    position: relative;
    box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.5);
  }

  #score-display-container,
  #time-display-container {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 150px;
  }

  #score-display {
    font-size: 2rem;
    color: var(--score);
    font-weight: bold;
    text-shadow: 0 0 10px var(--score);
    font-family: var(--font-mono);
  }

  #combo-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    opacity: 0;
    transform: scale(0.5);
    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }

  #combo-display.visible {
    opacity: 1;
    transform: scale(1);
  }

  .combo-num {
    font-size: 2.5rem;
    color: var(--accent-cta);
    font-weight: bold;
    line-height: 1;
    text-shadow: 0 0 15px var(--accent-cta);
  }

  .combo-label {
    font-size: 0.8rem;
    color: var(--muted);
    letter-spacing: 2px;
  }

  #time-display {
    font-size: 2rem;
    color: var(--time);
    font-weight: bold;
    text-shadow: 0 0 10px var(--time);
    font-family: var(--font-mono);
    transition: all 0.2s;
  }

  #time-display.low-time {
    color: var(--error);
    text-shadow: 0 0 15px var(--error);
    animation: pulse 0.5s infinite alternate;
  }

  @keyframes pulse {
    from {
      transform: scale(1);
    }
    to {
      transform: scale(1.1);
    }
  }

  .score-bonus,
  .time-bonus {
    position: absolute;
    top: -30px;
    font-size: 1.2rem;
    font-weight: bold;
    animation: floatUp 1s forwards;
    pointer-events: none;
    white-space: nowrap;
    z-index: 20;
  }

  .score-bonus {
    color: var(--score);
    text-shadow: 0 0 8px var(--score);
  }

  .time-bonus {
    color: var(--time);
    text-shadow: 0 0 8px var(--time);
  }

  @media (max-width: 600px) {
    .info-bar {
      padding: 0.8rem 0.5rem;
      gap: 0.75rem;
      justify-content: center;
      flex-wrap: nowrap;
    }

    #score-display,
    #time-display {
      font-size: 1.1rem;
    }

    .combo-num {
      font-size: 1.6rem;
    }

    .combo-label {
      font-size: 0.6rem;
    }

    /* Keep each block compact and allow three blocks to sit horizontally */
    #score-display-container,
    #time-display-container,
    #combo-display {
      min-width: 70px;
      width: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    /* On mobile hide colon/separator and show label above value */
    #score-display,
    #time-display {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      gap: 0.15rem;
    }

    #score-display .sep,
    #time-display .sep {
      display: none;
    }

    #score-display .label,
    #time-display .label {
      font-size: 0.8rem;
      color: var(--muted);
      letter-spacing: 2px;
    }

    #score-display .value,
    #time-display .value {
      font-size: 1.2rem;
      font-family: var(--font-mono);
    }
  }

  @keyframes shake {
    0% {
      transform: translate(0, 0);
    }
    25% {
      transform: translate(-5px, 5px);
    }
    50% {
      transform: translate(5px, -5px);
    }
    75% {
      transform: translate(-5px, -5px);
    }
    100% {
      transform: translate(0, 0);
    }
  }
</style>
