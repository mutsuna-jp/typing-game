<script lang="ts">
  export let stats: {
    score: number;
    accuracy: number | string;
    kpm: number;
    maxCombo: number;
    wrong: number;
  };

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
</script>

<div class="result-container">
  <div class="report-header">REPORT</div>

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

  <div class="rank-display {rankData.color}">RANK {rankData.label}</div>
</div>

<style>
  .result-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
  }

  .report-header {
    font-size: 2rem;
    margin-bottom: 10px;
    border-bottom: 2px solid oklch(100% 0 0);
    width: 70%;
    text-align: center;
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    width: 70%;
    font-size: 1.5rem;
    margin: 5px 0;
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
    font-size: 5rem;
    margin: 10px 0;
    text-shadow: 0 0 15px currentColor;
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
