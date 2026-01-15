<script lang="ts">
  import { base } from "$app/paths";
  export let data: { rankings: any[] };
</script>

<div id="tv-set">
  <div id="screen" class="turn-on-anim">
    <div id="screen-content">
      <div class="header">
        <h1>ONLINE RANKINGS</h1>
        <a href="{base}/" class="btn small">BACK TO GAME</a>
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

      <div id="scanline"></div>
    </div>
  </div>
</div>

<style>
  /* --- Shared TV Aesthetics --- */
  #tv-set {
    width: 100vw;
    height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
    background: oklch(15% 0.01 250);
  }

  #screen {
    position: relative;
    width: 90%;
    height: 90%;
    max-width: 1000px;
    max-height: 800px;
    background-color: oklch(20% 0.02 250);
    border-radius: 50% / 10%;
    overflow: hidden;
    box-shadow: inset 0 0 100px oklch(0% 0 0 / 0.9);
    border: 20px solid oklch(25% 0.02 250);
  }

  #screen-content {
    position: absolute;
    inset: 0;
    background: radial-gradient(
      circle,
      oklch(90% 0.02 250 / 0.1) 0%,
      oklch(0% 0 0 / 0.8) 90%
    );
    display: flex;
    flex-direction: column;
    padding: 40px;
    animation: flicker 0.15s infinite;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    border-bottom: 4px solid white;
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
    background: oklch(10% 0 0 / 0.5);
  }
  .ranking-container::-webkit-scrollbar-thumb {
    background: oklch(100% 0 0);
  }

  .ranking-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 1.2rem;
    text-align: left;
  }

  th {
    color: oklch(45% 0 250);
    font-size: 0.9rem;
    padding: 10px;
    border-bottom: 1px solid oklch(45% 0 250);
  }

  td {
    padding: 12px 10px;
    border-bottom: 1px dashed oklch(35% 0 250);
  }

  .col-rank {
    color: oklch(75% 0 0);
    width: 10%;
  }
  .col-name {
    color: white;
    width: 40%;
    font-weight: bold;
  }
  .col-score {
    color: oklch(85% 0.2 90);
    width: 15%;
  }
  .col-kpm {
    color: oklch(80% 0.2 160);
    width: 15%;
  }
  .col-date {
    color: oklch(55% 0.01 250);
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
  }
  .btn.small {
    font-size: 0.8rem;
    padding: 5px 15px;
  }

  @keyframes flicker {
    0% {
      opacity: 0.95;
    }
    5% {
      opacity: 0.85;
    }
    10% {
      opacity: 0.95;
    }
    100% {
      opacity: 0.95;
    }
  }

  @keyframes turn-on {
    0% {
      transform: scale(1, 0.01);
      filter: brightness(3);
    }
    60% {
      transform: scale(1, 1);
      filter: brightness(1);
    }
    100% {
      transform: scale(1, 1);
      filter: brightness(1);
    }
  }
  .turn-on-anim {
    animation: turn-on 0.4s cubic-bezier(0.23, 1, 0.32, 1) forwards;
  }
</style>
