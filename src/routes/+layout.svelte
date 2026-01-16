<script lang="ts">
  import "../app.css";
  import favicon from "$lib/assets/favicon.png";
  import { isPlaying, isShaking } from "$lib/stores";
  import { page } from "$app/stores";
  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<div id="tv-set">
  {#key $page.url.pathname}
    <div
      id="screen"
      class:turn-on-anim={!$isPlaying}
      class:shaking={$isShaking}
    >
      <div id="screen-content">
        {@render children()}
      </div>
    </div>
  {/key}
</div>

<style>
  :global {
    /* --- Base & Reset --- */
    * {
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    }

    body {
      margin: 0;
      padding: 0;
      background: var(--bg);
      color: var(--accent-cta);
      font-family: "Courier New", monospace;
    }

    /* --- Shared TV Aesthetics --- */
    #tv-set {
      width: 100vw;
      height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      background: radial-gradient(
        circle at center,
        var(--modal-bg),
        var(--panel-bg)
      );
      position: relative;
      overflow: hidden;
    }

    #screen {
      position: relative;
      /* Frameless CRT Style */
      width: 90%;
      height: 90%;
      max-width: 1000px;
      max-height: 800px;
      background-color: var(--modal-bg);
      border-radius: 50% / 10%; /* Iconic curvature */
      overflow: hidden;
      /* Inner glow only, no outer frame/border */
      box-shadow: inset 0 0 100px var(--bg-opaque);
      transform: perspective(1000px) rotateX(1deg);
      z-index: 10;
    }

    #screen::before {
      content: " ";
      display: block;
      position: absolute;
      inset: 0;
      background: linear-gradient(transparent 50%, rgba(0, 0, 0, 0.25) 50%),
        linear-gradient(
          90deg,
          var(--scanline-a),
          var(--scanline-b),
          var(--scanline-c)
        );
      z-index: 10;
      /* Scanlines */
      background-size:
        100% 2px,
        3px 100%;
      pointer-events: none;
    }

    #screen-content {
      position: absolute;
      inset: 0;
      background: radial-gradient(
        circle,
        var(--screen-glow) 0%,
        var(--screen-fade) 90%
      );
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      z-index: 5;
      padding: 20px;
      animation: flicker 0.15s infinite;
      text-shadow:
        0 0 4px var(--accent-cta),
        2px 2px 0 rgba(0, 0, 0, 0.5);
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
      15% {
        opacity: 1;
      }
      50% {
        opacity: 0.95;
      }
      100% {
        opacity: 0.95;
      }
    }

    @keyframes floatUp {
      0% {
        opacity: 1;
        transform: translateY(0);
      }
      100% {
        opacity: 0;
        transform: translateY(-20px);
      }
    }

    @keyframes blink-caret {
      0%,
      100% {
        border-bottom: 4px solid transparent;
      }
      50% {
        border-bottom: 4px solid var(--accent-cta);
      }
    }

    @keyframes shake {
      0%,
      100% {
        transform: translateX(0);
      }
      25%,
      75% {
        transform: translateX(-5px);
      }
      50% {
        transform: translateX(5px);
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
    .shaking {
      animation: shake 0.1s ease-in-out 0s 2;
    }
  }
</style>
