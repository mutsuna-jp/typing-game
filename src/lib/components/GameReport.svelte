<script lang="ts">
  import { onMount, createEventDispatcher } from "svelte";

  export let stats: {
    score: number;
    accuracy: number | string;
    kpm: number;
    maxCombo: number;
    wrong: number;
  };
  export let userId: string = "";
  export let currentUsername: string = "";
  export let isOnline: boolean = true;
  export let isSubmitting: boolean = false;
  export let isSubmitted: boolean = false;

  import { base } from "$app/paths";
  const dispatch = createEventDispatcher();

  let inputName = currentUsername || "";

  const RANKS = {
    S: { score: 1500, label: "S", color: "rank-S" },
    A: { score: 1000, label: "A", color: "rank-A" },
    B: { score: 500, label: "B", color: "rank-B" },
    C: { score: 200, label: "C", color: "rank-C" },
    D: { score: 0, label: "D", color: "rank-D" },
  };

  $: rankData = (() => {
    if (stats.score >= RANKS.S.score) return RANKS.S;
    if (stats.score >= RANKS.A.score) return RANKS.A;
    if (stats.score >= RANKS.B.score) return RANKS.B;
    if (stats.score >= RANKS.C.score) return RANKS.C;
    return RANKS.D;
  })();

  function handleRegister() {
    dispatch("submit", { username: inputName });
  }
</script>

<div class="result-container">
  <div class="report-header">REPORT</div>

  <div class="stat-grid">
    <div class="stat-row">
      <span class="stat-label">SCORE</span>
      <span class="stat-value">{stats.score}</span>
    </div>

    <div class="stat-row">
      <span class="stat-label">ACCURACY</span>
      <span class="stat-value">{stats.accuracy}%</span>
    </div>

    <div class="stat-row">
      <span class="stat-label">SPEED (KPM)</span>
      <span class="stat-value">{stats.kpm}</span>
    </div>

    <div class="stat-row">
      <span class="stat-label">MAX COMBO</span>
      <span class="stat-value">{stats.maxCombo}</span>
    </div>

    <div class="stat-row">
      <span class="stat-label">MISS</span>
      <span class="stat-value miss-value">{stats.wrong}</span>
    </div>
  </div>

  <div class="rank-display {rankData.color}">RANK {rankData.label}</div>

  {#if isOnline}
    <div class="ranking-box">
      <div class="box-title">RANKING REGISTRATION</div>
      {#if isSubmitted}
        <div class="submitted-msg">✓ REGISTERED SUCCESSFULY!</div>
      {:else}
        <div class="input-group">
          <input
            type="text"
            maxlength="20"
            placeholder="guest"
            bind:value={inputName}
            disabled={isSubmitting}
          />
          <button
            class="reg-btn"
            disabled={isSubmitting}
            on:click={handleRegister}
            >{isSubmitting ? "WAIT..." : "REGISTER"}</button
          >
        </div>
      {/if}
      <div class="user-id-small">ID: {userId.substring(0, 10)}...</div>
    </div>
  {/if}

  <div class="nav-links">
    <a href="{base}/" class="nav-link">BACK TO TOP</a>
    <a href="{base}/rankings" class="nav-link">VIEW RANKINGS</a>
  </div>
</div>

<style>
  .nav-links {
    margin-top: 20px;
    display: flex;
    gap: 30px;
  }

  .nav-link {
    color: oklch(75% 0.1 250);
    text-decoration: none;
    font-size: 0.8rem;
    letter-spacing: 0.1rem;
    border-bottom: 1px solid transparent;
    transition: all 0.2s;
  }

  .nav-link:hover {
    color: white;
    border-bottom: 1px solid white;
    text-shadow: 0 0 8px white;
  }

  .result-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    gap: 10px;
  }

  .report-header {
    font-size: 1.5rem;
    border-bottom: 2px solid oklch(100% 0 0);
    width: 50%;
    text-align: center;
  }

  .stat-grid {
    width: 70%;
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    font-size: 1.2rem;
    margin: 2px 0;
    border-bottom: 1px dashed oklch(35% 0 250);
  }

  .stat-label {
    color: oklch(75% 0.01 250);
  }

  .stat-value {
    color: oklch(100% 0 0);
    font-weight: bold;
  }

  .miss-value {
    color: oklch(65% 0.25 20);
  }

  .rank-display {
    font-size: 4rem;
    line-height: 1;
    text-shadow: 0 0 15px currentColor;
  }

  .ranking-box {
    width: 80%;
    border: 2px solid oklch(45% 0 250);
    padding: 10px;
    background: oklch(10% 0 0 / 0.3);
    position: relative;
  }

  .box-title {
    font-size: 0.8rem;
    position: absolute;
    top: -10px;
    left: 10px;
    background: oklch(20% 0.02 250);
    padding: 0 5px;
    color: oklch(45% 0 250);
  }

  .input-group {
    display: flex;
    gap: 5px;
    margin-top: 5px;
  }

  input {
    flex: 1;
    background: black;
    border: 1px solid oklch(100% 0 0);
    color: white;
    padding: 5px 10px;
    font-family: inherit;
    font-size: 1rem;
    outline: none;
  }

  .reg-btn {
    background: transparent;
    border: 1px solid oklch(100% 0 0);
    color: white;
    cursor: pointer;
    padding: 5px 15px;
    font-family: inherit;
    font-size: 1rem;
  }

  .reg-btn:hover {
    background: white;
    color: black;
  }

  .reg-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .submitted-msg {
    color: oklch(80% 0.2 160);
    font-weight: bold;
    padding: 5px;
  }

  .user-id-small {
    font-size: 0.6rem;
    color: oklch(35% 0 250);
    text-align: right;
    margin-top: 5px;
  }

  .rank-S {
    color: oklch(85% 0.2 90);
  }
  .rank-A {
    color: oklch(60% 0.25 10);
  }
  .rank-B {
    color: oklch(80% 0.2 160);
  }
  .rank-C {
    color: oklch(80% 0.2 240);
  }
  .rank-D {
    color: oklch(75% 0 0);
  }
</style>
