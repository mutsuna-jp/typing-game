<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let isPlaying: boolean = false;
  export let currentWord: { tokens: string[] } | null = null;
  export let tokenIndex: number = 0;

  const dispatch = createEventDispatcher<{
    correct: { key: string };
    error: void;
  }>();

  let hiddenInputEl: HTMLInputElement;
  let compositionText = "";
  let isComposing = false;
  let processingComplete = false; // 判定完了フラグ

  export let composingText = ""; // UI表示用

  // 濁音・半濁音から基本文字へのマッピング
  const voicedMap: Record<string, string> = {
    が: "か",
    ぎ: "き",
    ぐ: "く",
    げ: "け",
    ご: "こ",
    ぱ: "は",
    ぴ: "ひ",
    ぷ: "ふ",
    ぺ: "へ",
    ぽ: "ほ",
    ざ: "さ",
    じ: "し",
    ず: "す",
    ぜ: "せ",
    ぞ: "そ",
    だ: "た",
    ぢ: "ち",
    づ: "つ",
    で: "て",
    ど: "と",
    ば: "は",
    び: "ひ",
    ぶ: "ふ",
    べ: "へ",
    ぼ: "ほ",
  };

  // 半濁音から対応する濁音へのマッピング（フリック変換の中間状態）
  const semiToVoiced: Record<string, string> = {
    ぱ: "ば",
    ぴ: "び",
    ぷ: "ぶ",
    ぺ: "べ",
    ぽ: "ぼ",
  };

  // 拗音から基本文字へのマッピング（濁音・半濁音版含む）
  const palatalMap: Record<string, string> = {
    きゃ: "き",
    きゅ: "き",
    きょ: "き",
    しゃ: "し",
    しゅ: "し",
    しょ: "し",
    ちゃ: "ち",
    ちゅ: "ち",
    ちょ: "ち",
    にゃ: "に",
    にゅ: "に",
    にょ: "に",
    ひゃ: "ひ",
    ひゅ: "ひ",
    ひょ: "ひ",
    みゃ: "み",
    みゅ: "み",
    みょ: "み",
    りゃ: "り",
    りゅ: "り",
    りょ: "り",
    ぎゃ: "ぎ",
    ぎゅ: "ぎ",
    ぎょ: "ぎ",
    じゃ: "じ",
    じゅ: "じ",
    じょ: "じ",
    びゃ: "び",
    びゅ: "び",
    びょ: "び",
    ぴゃ: "ぴ",
    ぴゅ: "ぴ",
    ぴょ: "ぴ",
    てゃ: "て",
    てゅ: "て",
    てょ: "て",
    でゃ: "で",
    でゅ: "で",
    でょ: "で",
  };

  // 濁音・半濁音かどうかを判定
  function isVoicedCharacter(char: string): boolean {
    return char in voicedMap;
  }

  // 濁音・半濁音から基本文字を取得
  function getBaseChar(char: string): string {
    return voicedMap[char] || char;
  }

  // 拗音かどうかを判定
  function isPalatalized(char: string): boolean {
    return char in palatalMap;
  }

  // 拗音から基本文字を取得
  function getPalaitalBaseChar(char: string): string {
    return palatalMap[char] || char;
  }

  // 小さい文字のセット
  const smallChars = new Set([
    "ぁ",
    "ぃ",
    "ぅ",
    "ぇ",
    "ぉ",
    "ゃ",
    "ゅ",
    "ょ",
    "ゎ",
    "っ",
  ]);

  // 小さい文字かどうかを判定
  function isSmallChar(char: string): boolean {
    return smallChars.has(char);
  }

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
    processingComplete = false;
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
    const isVoiced = isVoicedCharacter(targetToken);
    const isPalatal = isPalatalized(targetToken);
    const isSmall = isSmallChar(targetToken);

    // 常に入力を表示（`+page.svelte` と合わせる）
    composingText = inputText;

    // 一致判定
    if (inputText === targetToken || inputText.endsWith(targetToken)) {
      // 一致! 即座に処理
      dispatch("correct", { key: targetToken });
      processingComplete = true; // 判定完了フラグを設定
      // finalize composing state so IME doesn't remain in composition
      isComposing = false;
      composingText = "";
      compositionText = "";

      const target = e.target as HTMLInputElement;
      if (target) {
        target.value = "";
        // Try to notify the IME that composition ended (helps some mobile IMEs)
        try {
          const endEvent = new CompositionEvent("compositionend", {
            data: targetToken,
          });
          target.dispatchEvent(endEvent);
        } catch (err) {
          // ignore if not supported
        }
      }
    } else if (isPalatal) {
      // 目標が拗音の場合：対応する基本文字 + 小さい文字のみ許容
      // ただし IME によっては中間状態で小文字のフルサイズ（例: 'よ'）や濁音の中間状態（例: 'び'）が入るため、それも許容する
      const baseChar = getPalaitalBaseChar(targetToken);
      const expectedSmall = targetToken[1];
      const fullToSmall: Record<string, string> = {
        や: "ゃ",
        ゆ: "ゅ",
        よ: "ょ",
        つ: "っ",
        わ: "ゎ",
        あ: "ぁ",
        い: "ぃ",
        う: "ぅ",
        え: "ぇ",
        お: "ぉ",
      };

      // 半濁音（ぴゃ等）の場合、濁音の中間状態（び / びゃ）を許容
      const isSemiPalatal = baseChar in semiToVoiced;
      const intermediateVoiced = isSemiPalatal
        ? (semiToVoiced as any)[baseChar]
        : null;

      if (inputText.length === 1) {
        // 基本文字だけ入力された場合は OK（小さい文字待ち）
        const okSingle =
          inputText === baseChar ||
          (intermediateVoiced && inputText === intermediateVoiced);
        if (!okSingle) {
          dispatch("error");
          processingComplete = true;
          composingText = "";
          compositionText = "";
          isComposing = false;

          const target = e.target as HTMLInputElement;
          if (target) {
            target.value = "";
            try {
              const endEvent = new CompositionEvent("compositionend", {
                data: inputText,
              });
              target.dispatchEvent(endEvent);
            } catch (err) {
              // ignore if not supported
            }
          }
        }
      } else if (inputText.length === 2) {
        // 2文字入力された場合：基本文字/中間濁音 + 小さい文字（またはそのフルサイズ）をチェック
        const firstChar = inputText[0];
        const secondChar = inputText[1];
        const secondMatches =
          secondChar === expectedSmall ||
          fullToSmall[secondChar] === expectedSmall;
        const firstMatches =
          firstChar === baseChar ||
          (intermediateVoiced && firstChar === intermediateVoiced);
        if (!firstMatches || !secondMatches) {
          dispatch("error");
          processingComplete = true;
          composingText = "";
          compositionText = "";
          isComposing = false;

          const target = e.target as HTMLInputElement;
          if (target) {
            target.value = "";
            try {
              const endEvent = new CompositionEvent("compositionend", {
                data: inputText,
              });
              target.dispatchEvent(endEvent);
            } catch (err) {
              // ignore if not supported
            }
          }
        }
      } else if (inputText.length > 2) {
        // 3文字以上はミス
        dispatch("error");
        processingComplete = true;
        composingText = "";
        compositionText = "";
        isComposing = false;

        const target = e.target as HTMLInputElement;
        if (target) {
          target.value = "";
          try {
            const endEvent = new CompositionEvent("compositionend", {
              data: inputText,
            });
            target.dispatchEvent(endEvent);
          } catch (err) {
            // ignore if not supported
          }
        }
      }
    } else if (isVoiced) {
      // 目標が濁音・半濁音の場合
      const baseChar = getBaseChar(targetToken);
      const isSemiVoiced = targetToken in semiToVoiced;
      const intermediateDevoiced = isSemiVoiced
        ? semiToVoiced[targetToken]
        : null;

      if (inputText.length > 0) {
        // 許容される入力：基本文字、（半濁音なら対応する濁音、目標文字）
        const isValid =
          inputText === baseChar ||
          inputText === targetToken ||
          (intermediateDevoiced && inputText === intermediateDevoiced);

        if (!isValid) {
          // 許容外の入力 = ミス
          dispatch("error");
          processingComplete = true;
          composingText = "";
          compositionText = "";
          isComposing = false;

          const target = e.target as HTMLInputElement;
          if (target) {
            target.value = "";
            // 変換を確定して IME の状態をリセット
            try {
              const endEvent = new CompositionEvent("compositionend", {
                data: inputText,
              });
              target.dispatchEvent(endEvent);
            } catch (err) {
              // ignore if not supported
            }
          }
        }
      }
    } else if (isSmall) {
      // 目標が小さい文字の場合：小さい文字またはそのフルサイズを許容
      // （フリック入力では フルサイズ→小さい文字 に変換される）
      const fullToSmall: Record<string, string> = {
        や: "ゃ",
        ゆ: "ゅ",
        よ: "ょ",
        つ: "っ",
        わ: "ゎ",
        あ: "ぁ",
        い: "ぃ",
        う: "ぅ",
        え: "ぇ",
        お: "ぉ",
      };

      if (inputText.length > 0) {
        const isValid =
          isSmallChar(inputText) || fullToSmall[inputText] === targetToken;
        if (!isValid) {
          // 小さい文字以外が入力されたのでミス
          dispatch("error");
          processingComplete = true;
          composingText = "";
          compositionText = "";
          isComposing = false;

          const target = e.target as HTMLInputElement;
          if (target) {
            target.value = "";
            // 変換を確定して IME の状態をリセット
            try {
              const endEvent = new CompositionEvent("compositionend", {
                data: inputText,
              });
              target.dispatchEvent(endEvent);
            } catch (err) {
              // ignore if not supported
            }
          }
        }
      }
    } else {
      // 目標が基本文字の場合
      if (inputText === targetToken) {
        // 基本文字のみ、OK（濁点待ち）
      } else if (inputText.length > 1) {
        // 2文字以上で不一致 = 濁点なしで追加入力 = ミス
        dispatch("error");
        processingComplete = true;
        composingText = "";
        compositionText = "";
        isComposing = false;

        const target = e.target as HTMLInputElement;
        if (target) {
          target.value = "";
          // 変換を確定して IME の状態をリセット
          try {
            const endEvent = new CompositionEvent("compositionend", {
              data: inputText,
            });
            target.dispatchEvent(endEvent);
          } catch (err) {
            // ignore if not supported
          }
        }
      } else if (inputText.length === 1 && inputText !== targetToken) {
        // 1文字で不一致 = ミス
        dispatch("error");
        processingComplete = true;
        composingText = "";
        compositionText = "";
        isComposing = false;

        const target = e.target as HTMLInputElement;
        if (target) {
          target.value = "";
          // 変換を確定して IME の状態をリセット
          try {
            const endEvent = new CompositionEvent("compositionend", {
              data: inputText,
            });
            target.dispatchEvent(endEvent);
          } catch (err) {
            // ignore if not supported
          }
        }
      }
    }
  }

  function handleCompositionEnd(e: CompositionEvent) {
    // 既に判定済みの場合はスキップ
    if (processingComplete) {
      isComposing = false;
      compositionText = "";
      composingText = "";
      const target = e.target as HTMLInputElement;
      if (target) target.value = "";
      return;
    }

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
  on:input={handleInput}
  on:compositionstart={handleCompositionStart}
  on:compositionupdate={handleCompositionUpdate}
  on:compositionend={handleCompositionEnd}
  style="position: absolute; opacity: 0; pointer-events: none;"
/>

<style>
</style>
