<script lang="ts">
  /**
   * Button Component
   * Replaces the usages of .btn in the application
   */
  interface Props {
    children?: import("svelte").Snippet;
    onclick?: (e: MouseEvent) => void;
    disabled?: boolean;
    class?: string;
    tag?: "button" | "label" | "a";
    href?: string;
    for?: string;
    title?: string;
    [key: string]: any;
  }

  let {
    children,
    onclick,
    disabled = false,
    class: className = "",
    tag = "button",
    href,
    for: forId,
    title,
    ...rest
  }: Props = $props();

  function handleClick(e: MouseEvent) {
    if (disabled) {
      e.preventDefault();
      return;
    }
    if (onclick) {
      onclick(e);
    }
  }
</script>

<svelte:element
  this={tag}
  class="btn {className}"
  role={tag === "button" ? "button" : undefined}
  {href}
  for={forId}
  {title}
  disabled={tag === "button" ? disabled : undefined}
  aria-disabled={disabled}
  onclick={handleClick}
  class:disabled
  {...rest}
>
  {@render children?.()}
</svelte:element>

<style>
  .btn {
    background: transparent;
    border: 2px solid var(--accent-cta);
    color: var(--accent-cta);
    padding: 15px 40px;
    font-size: 1.5rem;
    font-family: inherit;
    cursor: pointer;
    text-transform: uppercase;
    margin-top: 10px;
    box-shadow: 0 0 10px rgba(255, 0, 0, 0.12);
    transition: all 0.2s;
    outline: none;
    display: inline-block;
    text-decoration: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: rgba(255, 255, 255, 0.1);
  }

  .btn:hover,
  .btn:focus {
    background: var(--accent-cta);
    color: var(--bg);
    box-shadow: 0 0 20px var(--accent-cta);
  }

  .btn:disabled,
  .btn.disabled {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
    filter: grayscale(40%);
  }

  /* Variants */
  .btn.small {
    padding: 6px 10px;
    font-size: 0.9rem;
  }

  .btn.file-btn {
    font-size: 1.2rem;
    padding: 10px 30px;
    border-style: dashed;
    margin-bottom: 20px;
  }

  .btn.input-mode-toggle {
    font-size: 1rem;
    padding: 8px 20px;
    margin-top: 5px;
  }
  .btn.input-mode-toggle:hover,
  .btn.input-mode-toggle:focus {
    background: var(--accent-cta);
    color: var(--bg);
    box-shadow: 0 0 20px var(--accent-cta);
  }

  /* Mobile adjustments corresponding to +page.svelte media queries */
  @media (max-width: 600px) {
    .btn {
      padding: 12px 30px;
      font-size: 1.2rem;
      margin-top: 5px;
      margin-bottom: 5px;
      width: auto;
      min-width: 200px;
    }

    .btn.small {
      padding: 8px 15px;
      font-size: 0.85rem;
      min-width: auto;
    }

    .btn.file-btn {
      font-size: 1rem;
      padding: 10px 25px;
      margin-bottom: 5px;
      margin-top: 5px;
      min-width: 200px;
    }
  }
</style>
