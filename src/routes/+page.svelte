<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { fade, scale } from "svelte/transition";
  import type { PageData } from "./$types";
  import { browser } from "$app/environment";
  import { base } from "$app/paths";
  import { goto } from "$app/navigation";

  import Button from "$lib/components/Button.svelte";
  import { WordManager, isCustomCSVStore } from "$lib/engine/WordManager"; // Removed wordLastErrors as it's not used in the provided snippet
  import { message } from "$lib/engine/GameEngine";

  let { data }: { data: PageData & { userId?: string } } = $props();

  // Reactive state using Svelte 5 runes
  let userId = $state("");
  let username = $state("");
  let showProfileModal = $state(false);
  let scoreHistory = $state<any[]>([]);
  let transferInput = $state("");

  let fileStatus = $state("");
  let isFileError = $state(false);
  let isMobile = $state(false);
  let topInputMode = $state<"flick" | "halfwidth">("flick");

  function toggleTopInputMode() {
    const next = topInputMode === "flick" ? "halfwidth" : "flick";
    topInputMode = next;
    localStorage.setItem("typing_game_input_mode", next);
    message.set(`MODE: ${next === "flick" ? "FLICK" : "HALFWIDTH"}`);
  }

  // Derived values from props
  let top5 = $derived(data.top5);
  let userBest = $derived(data.userBest);

  let profileDialog = $state<HTMLDialogElement | null>(null);

  // Effect to manage dialog visibility
  $effect(() => {
    if (showProfileModal) {
      profileDialog?.showModal();
    } else {
      profileDialog?.close();
    }
  });

  async function registerRanking(newName: string) {
    if (!userId) return;
    try {
      const fd = new FormData();
      fd.append("json", JSON.stringify({ userId, username: newName }));
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

  function handleFile(e: Event) {
    const input = e.target as HTMLInputElement | null;
    const file = input?.files ? input.files[0] : null;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result === "string") {
        const count = WordManager.loadCSV(result);
        if (count > 0) {
          fileStatus = `FILE LOADED: ${count} WORDS`;
          isFileError = false;
        } else {
          fileStatus = "ERROR: INVALID CSV";
          isFileError = true;
        }
      }
    };
    reader.readAsText(file);
  }

  function importTransferId() {
    if (
      !transferInput ||
      !transferInput.startsWith("usr_") ||
      transferInput.length !== 64
    ) {
      alert("Invalid Transfer ID.");
      return;
    }
    if (
      confirm(
        "Importing this ID will overwrite your current progress. Continue?"
      )
    ) {
      localStorage.setItem("typing_game_user_id", transferInput);
      location.reload();
    }
  }

  onMount(() => {
    isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      ) || window.matchMedia("(max-width: 768px)").matches;

    username = localStorage.getItem("typing_game_username") || "guest";
    userId = localStorage.getItem("typing_game_user_id") || data.userId || "";

    // Initialize input mode preference (used by /play). Show mobile default as 'flick'.
    const savedMode = localStorage.getItem("typing_game_input_mode");
    if (isMobile) {
      if (savedMode === "flick" || savedMode === "halfwidth")
        topInputMode = savedMode;
    } else {
      topInputMode = "halfwidth";
    }

    if (!userId) {
      const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      let rand = "";
      for (let i = 0; i < 60; i++)
        rand += chars.charAt(Math.floor(Math.random() * chars.length));
      userId = "usr_" + rand;
      localStorage.setItem("typing_game_user_id", userId);
    }

    const savedHistory = localStorage.getItem("typing_game_history");
    if (savedHistory) {
      try {
        scoreHistory = JSON.parse(savedHistory);
      } catch (e) {}
    }

    WordManager.init(data.words);
    fileStatus = data.words?.length
      ? `READY: ${data.words.length} WORDS`
      : "NO WORDS LOADED";

    const keydownHandler = (e: KeyboardEvent) => {
      if (showProfileModal) return;
      if (e.code === "Enter" && !(e.target instanceof HTMLInputElement)) {
        goto(`${base}/play`);
      }
    };
    window.addEventListener("keydown", keydownHandler);
    return () => window.removeEventListener("keydown", keydownHandler);
  });
</script>

<h1 id="title">TYPEING</h1>

<div class="landing-container" transition:fade>
  <div class="main-actions">
    <Button class="large primary" onclick={() => goto(`${base}/play`)}
      >START GAME (ENTER)</Button
    >

    <div class="secondary-actions">
      <Button tag="label" for="csv-input" class="file-btn subtle"
        >LOAD CUSTOM CSV</Button
      >
      <input
        type="file"
        id="csv-input"
        accept=".csv"
        style="display:none"
        onchange={handleFile}
      />

      {#if isMobile}
        <Button class="small subtle" onclick={toggleTopInputMode}>
          MODE: {topInputMode === "flick" ? "FLICK" : "HALFWIDTH"}
        </Button>
      {/if}
    </div>

    <div
      id="file-status"
      style="color: {isFileError ? 'var(--error)' : 'var(--time)'}"
    >
      {fileStatus}
      {#if $isCustomCSVStore}
        <span
          style="font-size: 0.7rem; margin-left:10px; opacity: 0.8; color: var(--error)"
        >
          [CUSTOM / OFFLINE]
        </span>
      {/if}
    </div>
  </div>

  <div class="ranking-preview">
    <div class="ranking-header">TOP 5 RANKING</div>
    <div class="rank-list">
      {#each top5 as entry, i}
        <div class="rank-item" transition:fade={{ delay: i * 50 }}>
          <span class="rank-num">#{i + 1}</span>
          <span class="rank-name">{entry.username}</span>
          <span class="rank-score">{entry.score} pts</span>
        </div>
      {/each}
    </div>
    {#if userBest}
      <div class="user-best">
        YOUR BEST: #{userBest.rank} ({userBest.score} pts / {userBest.kpm} KPM)
      </div>
    {/if}
    <div class="ranking-actions">
      <Button class="small subtle" onclick={() => (showProfileModal = true)}
        >PROFILE & HISTORY</Button
      >
      <Button class="small subtle" onclick={() => goto(`${base}/rankings`)}
        >VIEW ALL RANKINGS</Button
      >
    </div>
  </div>
</div>

<dialog
  bind:this={profileDialog}
  class="modal"
  onclose={() => (showProfileModal = false)}
  onclick={(e) => {
    if (profileDialog && e.target === profileDialog) profileDialog.close();
  }}
>
  <div class="modal-content">
    <h2>PROFILE & HISTORY</h2>
    <div class="modal-body">
      <div class="setting-section">
        <div class="box-label">USER NAME:</div>
        <div class="input-group">
          <input
            type="text"
            maxlength="20"
            bind:value={username}
            onchange={() => registerRanking(username)}
          />
          <div class="save-hint">AUTO-SAVES TO RANKING</div>
        </div>
      </div>

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
                    <td style="color: var(--score)">{entry.score}</td>
                    <td>{entry.kpm}</td>
                    <td>{entry.accuracy}%</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </div>
      </div>

      <details class="transfer-details">
        <summary>DATA TRANSFER (ID: {userId.substring(0, 8)}...)</summary>
        <div class="transfer-box">
          <div class="id-display">{userId}</div>
          <Button
            class="small"
            onclick={() => navigator.clipboard.writeText(userId)}
            >COPY ID</Button
          >
        </div>
        <div class="import-box">
          <input type="text" bind:value={transferInput} placeholder="usr_..." />
          <Button class="small" onclick={importTransferId}
            >IMPORT & RELOAD</Button
          >
        </div>
      </details>
    </div>
    <div class="modal-actions">
      <Button class="small subtle" onclick={() => profileDialog?.close()}
        >CLOSE</Button
      >
    </div>
  </div>
</dialog>

<style>
  .landing-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3rem;
    width: 100%;
    max-width: 800px;
    margin: 0 auto;
  }

  .main-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
  }

  .secondary-actions {
    display: flex;
    gap: 1rem;
  }

  .ranking-preview {
    width: 100%;
    background: rgba(255, 255, 255, 0.05);
    padding: 2rem;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  #file-status {
    font-family: var(--font-mono);
    font-size: 0.9rem;
  }

  /* Modal Styles */
  .modal {
    background: var(--modal-bg);
    border: 2px solid var(--accent-outline);
    border-radius: 12px;
    padding: 0;
    max-width: 90%;
    width: 500px;
    box-shadow: 0 0 40px rgba(0, 0, 0, 0.8);
    color: var(--accent-cta);
  }

  .modal::backdrop {
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(4px);
  }

  .modal-content {
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .modal h2 {
    margin: 0;
    border-bottom: 2px solid var(--accent-outline);
    padding-bottom: 0.5rem;
    font-size: 1.5rem;
  }

  .modal-body {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .setting-section,
  .history-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    text-align: left;
  }

  .box-label {
    font-size: 0.8rem;
    color: var(--muted);
    font-family: var(--font-mono);
  }

  .input-group input {
    width: 100%;
    background: var(--bg-alt);
    border: 1px solid var(--accent-outline);
    color: var(--accent-cta);
    padding: 0.8rem;
    font-size: 1.1rem;
    border-radius: 6px;
    outline: none;
    transition: all 0.2s;
  }

  .input-group input:focus {
    border-color: var(--accent-cta);
    box-shadow: 0 0 10px rgba(255, 255, 255, 0.1);
  }

  .save-hint {
    font-size: 0.7rem;
    color: var(--save-hint);
    margin-top: 5px;
  }

  .history-list {
    max-height: 200px;
    overflow-y: auto;
    background: var(--bg-alt);
    border-radius: 6px;
    border: 1px solid var(--accent-outline);
  }

  .history-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  .history-table th,
  .history-table td {
    padding: 8px;
    border-bottom: 1px solid var(--accent-outline);
    text-align: center;
  }

  .history-table th {
    background: var(--panel-bg);
    color: var(--muted);
    position: sticky;
    top: 0;
  }

  .transfer-details {
    border: 1px solid var(--accent-outline);
    border-radius: 6px;
    padding: 0.5rem;
    background: var(--panel-bg);
  }

  .transfer-details summary {
    cursor: pointer;
    font-size: 0.8rem;
    color: var(--muted);
  }

  .transfer-box,
  .import-box {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .id-display {
    background: var(--bg);
    padding: 5px;
    font-size: 0.7rem;
    word-break: break-all;
    border-radius: 4px;
    border: 1px solid var(--muted-outline);
  }

  .import-box input {
    background: var(--bg);
    border: 1px solid var(--muted-outline);
    color: var(--accent-cta);
    padding: 5px;
    font-size: 0.8rem;
    border-radius: 4px;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    border-top: 1px solid var(--accent-outline);
    padding-top: 1rem;
  }
</style>
