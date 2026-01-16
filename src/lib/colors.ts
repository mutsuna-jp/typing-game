// colors.ts — CSS 変数のラッパー（:root をソース・オブ・トゥルースとして扱います）

/**
 * 使い方（短く）:
 *
 * 1) Svelte コンポーネント内で（推奨）
 *
 *    <script lang="ts">
 *      import { vars } from '$lib/colors';
 *    </script>
 *
 *    <div style="background: {vars.bg}; color: {vars.text}">...</div>
 *
 *
 * 2) JS/TS で CSS 変数を参照する
 *
 *    import { cssVar } from '$lib/colors';
 *    const outline = cssVar('accentOutline'); // -> 'var(--accent-outline)'
 *
 *
 * 3) 実際の CSS 値をランタイムで読みたいとき（ブラウザ）
 *
 *    const v = getComputedStyle(document.documentElement)
 *      .getPropertyValue('--accent-cta').trim();
 *
 *
 * 4) 動的に値を変更する（テーマ切替など）
 *
 *    function setColor(k: ColorKey, value: string) {
 *      document.documentElement.style.setProperty(
 *        `--${k.replace(/([A-Z])/g, '-$1').toLowerCase()}`,
 *        value
 *      );
 *    }
 *
 * 補足:
 * - cssVar('accentCta') -> 'var(--accent-cta)'
 * - 引数は camelCase（例: 'bgAlt'）を受け取り、kebab-case に変換します。
 */
export function cssVar(key: string) {
  return `var(--${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)})`;
}

export const vars = {
  bg: cssVar("bg"),
  bgAlt: cssVar("bgAlt"),
  text: cssVar("text"),
  muted: cssVar("muted"),
  accentCta: cssVar("accentCta"),
  accentOutline: cssVar("accentOutline"),
  accentCrt: cssVar("accentCrt"),
  score: cssVar("score"),
  time: cssVar("time"),
  success: cssVar("success"),
  error: cssVar("error"),
  glass: cssVar("glass"),
} as const;

export type ColorKey = keyof typeof vars;
