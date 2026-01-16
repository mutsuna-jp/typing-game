<script lang="ts">
  import { base } from "$app/paths";
  import { goto } from "$app/navigation";
  export let data: { rankings: any[] };

  function handleBackClick() {
    goto(`${base}/`);
  }
</script>

<svelte:head>
  <title>ランキング - TYPEING</title>
  <meta
    name="description"
    content="TYPEINGのオンラインランキング。トッププレイヤーのスコアとKPMをチェックしよう。"
  />

  <!-- Open Graph Protocol -->
  <meta property="og:title" content="ランキング - TYPEING" />
  <meta
    property="og:description"
    content="TYPEINGのオンラインランキング。トッププレイヤーのスコアをチェック。"
  />
  <meta
    property="og:url"
    content="https://lab.mutsuna.jp/typing-game/rankings"
  />

  <!-- Twitter Card -->
  <meta name="twitter:title" content="ランキング - TYPEING" />
  <meta
    name="twitter:description"
    content="TYPEINGのオンラインランキング。トッププレイヤーのスコアをチェック。"
  />
</svelte:head>

<div class="rankings-root">
  <div class="header">
    <h1>ONLINE RANKINGS</h1>
    <button class="btn small" onclick={handleBackClick}>BACK TO GAME</button>
  </div>

  <div class="ranking-container">
    <table class="ranking-table">
      <thead>
        <tr>
          <th class="col-rank">RANK</th>
          <th class="col-name">NAME</th>
          <th class="col-score">SCORE</th>
          <th class="col-kpm">KPM</th>
          <th class="col-date">DATE</th>
        </tr>
      </thead>
      <tbody>
        {#each data.rankings as entry, i}
          <tr>
            <td class="col-rank">#{i + 1}</td>
            <td class="col-name">{entry.username}</td>
            <td class="col-score">{entry.score}</td>
            <td class="col-kpm">{entry.kpm}</td>
            <td class="col-date">
              {new Date(entry.played_at).toLocaleDateString()}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  /* Page root wrapper — relies on layout CRT */
  .rankings-root {
    display: flex;
    flex-direction: column;
    padding: 20px 40px;
  }

  @media (max-width: 767px) {
    .header h1 {
      font-size: 1.5rem;
    }
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    border-bottom: 4px solid white;
    flex-shrink: 0;
  }

  h1 {
    font-size: 2.5rem;
    margin: 0;
    letter-spacing: 5px;
  }

  .ranking-container {
    flex: 1;
    overflow-y: auto;
    margin-top: 10px;
    padding-right: 10px;
  }

  /* Custom Scrollbar for CRT look */
  .ranking-container::-webkit-scrollbar {
    width: 8px;
  }
  .ranking-container::-webkit-scrollbar-track {
    background: var(--panel-bg-strong);
  }
  .ranking-container::-webkit-scrollbar-thumb {
    background: var(--accent-cta);
  }

  .ranking-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 1.2rem;
    text-align: left;
  }

  th {
    color: var(--accent-crt);
    font-size: 0.9rem;
    padding: 10px;
    border-bottom: 1px solid var(--accent-crt);
  }

  td {
    padding: 12px 10px;
    border-bottom: 1px dashed var(--muted-outline);
  }

  .col-rank {
    color: var(--accent-cta);
    width: 10%;
  }
  .col-name {
    color: white;
    width: 40%;
    font-weight: bold;
  }
  .col-score {
    color: var(--score);
    width: 15%;
  }
  .col-kpm {
    color: var(--time);
    width: 15%;
  }
  .col-date {
    color: var(--muted);
    width: 20%;
    font-size: 0.8rem;
  }

  .btn {
    background: transparent;
    border: 2px solid white;
    color: white;
    padding: 10px 20px;
    text-decoration: none;
    text-transform: uppercase;
    transition: all 0.2s;
  }
  .btn:hover {
    background: white;
    color: black;
    font-weight: bold;
  }
  .btn.small {
    font-size: 0.8rem;
    padding: 5px 15px;
  }
</style>
