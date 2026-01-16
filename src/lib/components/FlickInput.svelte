<script lang="ts">
  import {
    voicedMap,
    semiToVoiced,
    clearToVoicedMap,
    voicedToSemiMap,
    palatalMap,
    atokFlickRowMap,
  } from "../word-utils";

  interface Props {
    isPlaying?: boolean;
    currentWord?: { tokens: string[] } | null;
    tokenIndex?: number;
    composingText?: string;
    oncorrect?: (event: { key: string }) => void;
    onerror?: () => void;
  }

  let {
    isPlaying = false,
    currentWord = null,
    tokenIndex = 0,
    composingText = $bindable(""),
    oncorrect,
    onerror,
  }: Props = $props();

  let hiddenInputEl: HTMLInputElement;
  let compositionText = "";
  let isComposing = false;
  let processingComplete = false; // 判定完了フラグ
  let compositionStartTime = 0; // 中間状態開始時刻（ミリ秒）
  const COMPOSITION_TIMEOUT = 3000; // 中間状態を許容する最大時間（ミリ秒）

  let isLeniencyPeriod = false; // 単語切り替え直後の猶予期間
  const LENIENCY_DURATION = 150; // 猶予期間（ミリ秒）
  let leniencyTimer: ReturnType<typeof setTimeout>;

  // 単語が変更されたら状態をリセットし、猶予期間を開始する
  $effect(() => {
    if (currentWord) {
      // 状態リセット
      isComposing = false;
      compositionText = "";
      composingText = "";
      processingComplete = false;

      // ブラウザの入力をクリア
      if (hiddenInputEl) {
        hiddenInputEl.value = "";
      }

      // 猶予期間開始
      startLeniency();
    }
  });

  function startLeniency() {
    isLeniencyPeriod = true;
    if (leniencyTimer) clearTimeout(leniencyTimer);
    leniencyTimer = setTimeout(() => {
      isLeniencyPeriod = false;
    }, LENIENCY_DURATION);
  }

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
    if (char in voicedMap) return true;
    if (char in palatalMap) return true;
    if (isSmallChar(char)) return true;

    const specialChars =
      /[がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽぁぃぅぇぉっゃゅょゎ]/;
    return specialChars.test(char);
  }

  // 中間状態がタイムアウトしたかチェック
  function isCompositionTimedOut(): boolean {
    const elapsedTime = Date.now() - compositionStartTime;
    return elapsedTime > COMPOSITION_TIMEOUT;
  }

  // 小文字をフルサイズに正規化
  function normalizeSmallChar(c: string): string {
    const mapping: Record<string, string> = {
      ぁ: "あ",
      ぃ: "い",
      ぅ: "う",
      ぇ: "え",
      ぉ: "お",
      ゃ: "や",
      ゅ: "ゆ",
      ょ: "よ",
      ゎ: "わ",
      っ: "つ",
    };
    return mapping[c] || c;
  }

  // 入力文字が目標文字の段階的な中間状態かチェック
  function isIntermidiateStep(inputChar: string, targetChar: string): boolean {
    const normInput = normalizeSmallChar(inputChar);
    if (normInput === targetChar) return true;
    if (clearToVoicedMap[normInput] === targetChar) return true;
    if (voicedToSemiMap[normInput] === targetChar) return true;
    const voicedForm = clearToVoicedMap[normInput];
    if (voicedForm && voicedToSemiMap[voicedForm] === targetChar) return true;
    if (voicedMap[targetChar] === normInput) return true;
    if (clearToVoicedMap[inputChar] === targetChar) return true;
    if (voicedToSemiMap[inputChar] === targetChar) return true;
    if (voicedMap[targetChar] === inputChar) return true;
    return false;
  }

  function handleCompositionStart(e: CompositionEvent) {
    isComposing = true;
    compositionText = "";
    composingText = "";
    processingComplete = false;
    compositionStartTime = Date.now();
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

    composingText = inputText;

    if (inputText === targetToken || inputText.endsWith(targetToken)) {
      oncorrect?.({ key: targetToken });
      processingComplete = true;
      isComposing = false;
      composingText = "";
      compositionText = "";

      const target = e.target as HTMLInputElement;
      if (target) {
        target.value = "";
        try {
          const endEvent = new CompositionEvent("compositionend", {
            data: targetToken,
          });
          target.dispatchEvent(endEvent);
        } catch (err) {}
      }
    } else if (isPalatal) {
      const allowIntermediateStates = !isCompositionTimedOut();
      const baseChar = getPalaitalBaseChar(targetToken);
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
      const isSemiPalatal = baseChar in semiToVoiced;
      const intermediateVoiced = isSemiPalatal
        ? (semiToVoiced as any)[baseChar]
        : null;

      if (inputText.length === 1) {
        const baseRow = atokFlickRowMap[baseChar];
        const normalizedInput = normalizeSmallChar(inputText);
        let okSingle = inputText === baseChar;
        if (!okSingle && allowIntermediateStates) {
          okSingle =
            !!intermediateVoiced && normalizedInput === intermediateVoiced;
          if (!okSingle)
            okSingle = isIntermidiateStep(normalizedInput, baseChar);
          if (!okSingle) {
            okSingle =
              !!baseRow &&
              (baseRow.includes(normalizedInput) ||
                baseRow.includes(getBaseChar(normalizedInput)));
          }
        }
        if (!okSingle) {
          if (isLeniencyPeriod) {
            composingText = "";
            compositionText = "";
            isComposing = false;
            const target = e.target as HTMLInputElement;
            if (target) target.value = "";
            return;
          }
          onerror?.();
          processingComplete = true;
          composingText = "";
          compositionText = "";
          isComposing = false;
          const target = e.target as HTMLInputElement;
          if (target) target.value = "";
        }
      } else if (inputText.length === 2) {
        const firstChar = inputText[0];
        const secondChar = inputText[1];
        const secondIsSmallLike =
          isSmallChar(secondChar) || fullToSmall[secondChar] !== undefined;
        const baseRow = atokFlickRowMap[baseChar];
        let firstMatches = firstChar === baseChar;
        if (!firstMatches && allowIntermediateStates) {
          const normalizedFirst = normalizeSmallChar(firstChar);
          firstMatches =
            !!intermediateVoiced && normalizedFirst === intermediateVoiced;
          if (!firstMatches)
            firstMatches = isIntermidiateStep(normalizedFirst, baseChar);
          if (!firstMatches) {
            firstMatches =
              !!baseRow &&
              (baseRow.includes(normalizedFirst) ||
                baseRow.includes(getBaseChar(normalizedFirst)));
          }
        }
        if (!firstMatches || !secondIsSmallLike) {
          if (isLeniencyPeriod) {
            composingText = "";
            compositionText = "";
            isComposing = false;
            const target = e.target as HTMLInputElement;
            if (target) target.value = "";
            return;
          }
          onerror?.();
          processingComplete = true;
          composingText = "";
          compositionText = "";
          isComposing = false;
          const target = e.target as HTMLInputElement;
          if (target) target.value = "";
        }
      } else if (inputText.length > 2) {
        if (isLeniencyPeriod) {
          composingText = "";
          compositionText = "";
          isComposing = false;
          const target = e.target as HTMLInputElement;
          if (target) target.value = "";
          return;
        }
        onerror?.();
        processingComplete = true;
        composingText = "";
        compositionText = "";
        isComposing = false;
        const target = e.target as HTMLInputElement;
        if (target) target.value = "";
      }
    } else if (isVoiced) {
      const allowIntermediateStates = !isCompositionTimedOut();
      const baseChar = getBaseChar(targetToken);
      const isSemiVoiced = targetToken in semiToVoiced;
      const intermediateDevoiced = isSemiVoiced
        ? semiToVoiced[targetToken]
        : null;

      if (inputText.length > 0) {
        const baseRow = atokFlickRowMap[baseChar];
        let isValid = inputText === baseChar || inputText === targetToken;
        if (!isValid && allowIntermediateStates) {
          const normalizedInput = normalizeSmallChar(inputText);
          isValid =
            !!intermediateDevoiced && normalizedInput === intermediateDevoiced;
          if (!isValid)
            isValid = isIntermidiateStep(normalizedInput, targetToken);
          if (!isValid) {
            isValid =
              !!baseRow &&
              (baseRow.includes(normalizedInput) ||
                baseRow.includes(getBaseChar(normalizedInput)));
          }
        }
        if (!isValid) {
          if (isLeniencyPeriod) {
            composingText = "";
            compositionText = "";
            isComposing = false;
            const target = e.target as HTMLInputElement;
            if (target) target.value = "";
            return;
          }
          onerror?.();
          processingComplete = true;
          composingText = "";
          compositionText = "";
          isComposing = false;
          const target = e.target as HTMLInputElement;
          if (target) target.value = "";
        }
      }
    } else if (isSmall) {
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
          if (isLeniencyPeriod) {
            composingText = "";
            compositionText = "";
            isComposing = false;
            const target = e.target as HTMLInputElement;
            if (target) target.value = "";
            return;
          }
          onerror?.();
          processingComplete = true;
          composingText = "";
          compositionText = "";
          isComposing = false;
          const target = e.target as HTMLInputElement;
          if (target) target.value = "";
        }
      }
    } else {
      const allowIntermediateStates = !isCompositionTimedOut();
      if (inputText === targetToken) {
        // OK
      } else if (inputText.length > 1) {
        if (isLeniencyPeriod) {
          composingText = "";
          compositionText = "";
          isComposing = false;
          const target = e.target as HTMLInputElement;
          if (target) target.value = "";
          return;
        }
        onerror?.();
        processingComplete = true;
        composingText = "";
        compositionText = "";
        isComposing = false;
        const target = e.target as HTMLInputElement;
        if (target) target.value = "";
      } else if (inputText.length === 1 && inputText !== targetToken) {
        const targetFlickRow = atokFlickRowMap[targetToken];
        const normalizedInput = normalizeSmallChar(inputText);
        const inputInFlickRow = !!(
          targetFlickRow && targetFlickRow.includes(normalizedInput)
        );
        const isStepPattern = isIntermidiateStep(normalizedInput, targetToken);
        const isValidIntermediate =
          allowIntermediateStates && (inputInFlickRow || isStepPattern);
        if (!isValidIntermediate) {
          if (isLeniencyPeriod) {
            composingText = "";
            compositionText = "";
            isComposing = false;
            const target = e.target as HTMLInputElement;
            if (target) target.value = "";
            return;
          }
          onerror?.();
          processingComplete = true;
          composingText = "";
          compositionText = "";
          isComposing = false;
          const target = e.target as HTMLInputElement;
          if (target) target.value = "";
        }
      }
    }
  }

  function handleCompositionEnd(e: CompositionEvent) {
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

    const finalText = e.data || compositionText;
    if (finalText && currentWord && tokenIndex < currentWord.tokens.length) {
      const targetToken = currentWord.tokens[tokenIndex];
      if (!isSpecialChar(targetToken) || finalText !== targetToken) {
        if (finalText !== targetToken) {
          onerror?.();
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
  style="position: absolute; opacity: 0; pointer-events: none;"
/>

<style>
</style>
