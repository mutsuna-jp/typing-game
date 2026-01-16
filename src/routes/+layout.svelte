<script lang="ts">
  import "../app.css";
  import favicon from "$lib/assets/favicon.png";
  import { isPlaying } from "$lib/stores";
  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<div id="tv-set">
  <div id="screen" class:turn-on-anim={!$isPlaying}>
    <div id="screen-content">
      {@render children()}
    </div>
  </div>
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
      background: oklch(0% 0 0);
      color: oklch(100% 0 0);
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
        oklch(18% 0.01 250),
        oklch(10% 0.01 250)
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
      background-color: oklch(20% 0.02 250);
      border-radius: 50% / 10%; /* Iconic curvature */
      overflow: hidden;
      /* Inner glow only, no outer frame/border */
      box-shadow: inset 0 0 100px oklch(0% 0 0 / 0.9);
      transform: perspective(1000px) rotateX(1deg);
      z-index: 10;
    }

    #screen::before {
      content: " ";
      display: block;
      position: absolute;
      inset: 0;
      background: linear-gradient(
          oklch(0% 0 0 / 0) 50%,
          oklch(0% 0 0 / 0.25) 50%
        ),
        linear-gradient(
          90deg,
          oklch(60% 0.15 20 / 0.06),
          oklch(60% 0.15 140 / 0.02),
          oklch(60% 0.15 260 / 0.06)
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
        oklch(90% 0.02 250 / 0.1) 0%,
        oklch(0% 0 0 / 0.8) 90%
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
        0 0 4px oklch(100% 0 0 / 0.6),
        2px 2px 0 oklch(0% 0 0 / 0.5);
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
        border-bottom: 4px solid oklch(100% 0 0);
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
  }
</style>
