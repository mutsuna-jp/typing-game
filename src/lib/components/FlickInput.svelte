<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let isPlaying: boolean = false;
  export let currentWord: { tokens: string[] } | null = null;
  export let tokenIndex: number = 0;

  const dispatch = createEventDispatcher<{
    correct: { char: string };
    error: void;
  }>();

  let hiddenInputEl: HTMLInputElement;
  let compositionText = "";
  let isComposing = false;

  export let composingText = ""; // UI表示用

  // 特殊文字(濁音、半濁音、拗音、小文字)かどうかを判定
  function isSpecialChar(char: string): boolean {
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
    if (!isPlaying) {
      compositionText = e.data || "";
      composingText = e.data || "";
      return;
    }

    const inputText = e.data || "";
    compositionText = inputText;

    if (!currentWord || tokenIndex >= currentWord.tokens.length) {
      composingText = "";
      return;
    }

    const targetToken = currentWord.tokens[tokenIndex];
    const isSpecial = isSpecialChar(targetToken);

    // 特殊文字の場合のみcomposingTextに表示
    if (isSpecial) {
      composingText = inputText;
    } else {
      composingText = "";
    }

    // 一致判定
    if (inputText === targetToken || inputText.endsWith(targetToken)) {
      // 一致! 即座に処理
      dispatch("correct", { char: targetToken });
      composingText = "";
      compositionText = "";

      const target = e.target as HTMLInputElement;
      if (target) target.value = "";
    } else if (!isSpecial && inputText.length > 0) {
      // 基本文字で不一致の場合、1文字入力された時点でミス判定
      const inputChar = inputText.slice(-1);
      if (inputChar !== targetToken) {
        dispatch("error");
        composingText = "";
        compositionText = "";

        const target = e.target as HTMLInputElement;
        if (target) target.value = "";
      }
    }
  }

  function handleCompositionEnd(e: CompositionEvent) {
    isComposing = false;
    compositionText = "";
    composingText = "";

    if (!isPlaying) {
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
          dispatch("error");
        }
      }
    }

    const target = e.target as HTMLInputElement;
    if (target) target.value = "";
  }

  function handleInput(e: Event) {
    if (!isPlaying) return;

    const target = e.target as HTMLInputElement;
    const val = target.value;

    if (val.length > 0) {
      // フリック入力はcompositionイベントで処理
      // ここでは入力をクリアするのみ
      if (!isComposing) {
        target.value = "";
      }
    }
  }

  export function focus() {
    hiddenInputEl?.focus();
  }
</script>

<input
  type="text"
  bind:this={hiddenInputEl}
  lang="ja"
  autocomplete="off"
  autocorrect="off"
  autocapitalize="none"
  spellcheck="false"
  oninput={handleInput}
  oncompositionstart={handleCompositionStart}
  oncompositionupdate={handleCompositionUpdate}
  oncompositionend={handleCompositionEnd}
/>
