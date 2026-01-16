<script lang="ts">
  import { KanaEngine } from "$lib/word-utils";

  export let currentWord: { disp: string; tokens: string[] } | null = null;
  export let tokenIndex: number = 0;
  export let inputBuffer: string = "";
  export let composingText: string = ""; // フリック入力中の未確定文字
  export let inputMode: "flick" | "halfwidth" = "flick";
  export let errorIndex: number | null = null;

  $: hint = (() => {
    if (!currentWord || tokenIndex >= currentWord.tokens.length) return "";
    const currToken = currentWord.tokens[tokenIndex];
    const nextToken = currentWord.tokens[tokenIndex + 1];
    const patterns = KanaEngine.getValidPatterns(currToken, nextToken);
    const match =
      patterns.find((p) => p.startsWith(inputBuffer)) || patterns[0];
    return match || "";
  })();
</script>

<div class="word-container">
  {#if currentWord}
    <div class="kanji-display">{currentWord.disp}</div>
    <div class="word-display">
      {#each currentWord.tokens as token, i}
        <span
          class="char"
          class:correct={i < tokenIndex}
          class:current={i === tokenIndex}
          class:wrong={i === errorIndex}
        >
          {token}
        </span>
      {/each}
    </div>
    <div class="romaji-display">
      {#if inputMode === "flick"}
        {#if composingText}
          <span class="composing-text">{composingText}</span>
        {:else if currentWord.tokens[tokenIndex]}
          <span class="hint-text">{currentWord.tokens[tokenIndex]}</span>
        {/if}
      {:else if hint}
        <span class="input-buffer">{inputBuffer}</span>{hint.substring(
          inputBuffer.length,
        )}
      {/if}
    </div>
  {:else}
    <div class="word-display">READY?</div>
  {/if}
</div>

<style>
  .word-container {
    margin: 10px 0;
    min-height: 200px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
  }

  .kanji-display {
    font-size: 2.5rem;
    color: oklch(80% 0.2 160);
    margin-bottom: 5px;
    text-shadow: 0 0 8px oklch(80% 0.2 160);
    min-height: 1.2em;
    letter-spacing: 0.1em;
  }

  .word-display {
    font-size: 3.5rem;
    font-weight: bold;
    word-break: keep-all;
    white-space: nowrap;
    line-height: 1.2;
  }

  .romaji-display {
    font-size: 1.5rem;
    color: oklch(60% 0.01 250);
    margin-top: 10px;
    height: 1.5em;
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  .input-buffer {
    color: oklch(35% 0.02 250);
  }

  .composing-text {
    color: oklch(80% 0.15 60);
    font-weight: bold;
    text-shadow: 0 0 5px oklch(80% 0.15 60);
    animation: pulse 0.8s ease-in-out infinite;
  }

  .hint-text {
    color: oklch(50% 0.05 250);
    opacity: 0.6;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.6;
    }
  }

  .char {
    display: inline-block;
    transition: color 0.1s;
  }

  .char.correct {
    color: oklch(35% 0.02 250);
    text-shadow: none;
  }

  .char.current {
    text-decoration: underline;
    animation: blink-caret 0.5s infinite;
  }

  .char.wrong {
    color: var(--error);
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

  @media (max-width: 600px) {
    .word-container {
      min-height: 80px;
      margin: 5px 0;
    }

    .kanji-display {
      font-size: 1.8rem;
      margin-bottom: 3px;
    }

    .word-display {
      font-size: 2.2rem;
    }

    .romaji-display {
      font-size: 1rem;
      margin-top: 5px;
      letter-spacing: 1px;
    }
  }
</style>
