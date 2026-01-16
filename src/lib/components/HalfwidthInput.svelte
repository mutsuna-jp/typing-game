<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let isPlaying: boolean = false;

  const dispatch = createEventDispatcher<{
    correct: { key: string };
    error: void;
  }>();

  let hiddenInputEl: HTMLInputElement;

  function handleInput(e: Event) {
    if (!isPlaying) return;

    const target = e.target as HTMLInputElement;
    const val = target.value;

    if (val.length > 0) {
      const char = val.slice(-1).toLowerCase();
      if (/^[a-z0-9\-]$/.test(char)) {
        dispatch("correct", { key: char });
      }
      target.value = "";
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!isPlaying) return;

    let char = "";
    if (e.code && e.code.startsWith("Key")) {
      char = e.code.slice(3).toLowerCase();
    } else if (e.code === "Minus") {
      char = "-";
    }

    if (char) {
      e.preventDefault();
      dispatch("correct", { key: char });
    }
  }

  export function focus() {
    hiddenInputEl?.focus();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<input
  type="text"
  bind:this={hiddenInputEl}
  inputmode="text"
  lang="en"
  autocomplete="off"
  autocorrect="off"
  autocapitalize="none"
  spellcheck="false"
  oninput={handleInput}
  style="position: absolute; opacity: 0; pointer-events: none;"
/>

<style>
</style>
