// スマホ表示のレイアウトの決まり（src/styles.css）。3D画面の幅が、描く解像度で決まって左に寄る不具合の再発を防ぐ
import { describe, expect, it } from 'vitest';
import css from '../styles.css?raw';

/** スマホ用（max-width: 48rem）の中の、`.explore {` の指定 */
function mobileExploreRule(): string {
  const re = /@media \(max-width: 48rem\) \{[\s\S]*?\n {2}\.explore \{([\s\S]*?)\n {2}\}/g;
  for (const m of css.matchAll(re)) if (m[1]!.includes('flex-direction: column')) return m[1]!;
  throw new Error('スマホ用の .explore の指定が見つからない');
}

describe('スマホの探索画面のレイアウト', () => {
  it('3D画面の入れ物は、PC用の align-items: start を引き継がず、横いっぱいに広げる（stretch）', () => {
    expect(/align-items:\s*stretch;/.test(mobileExploreRule())).toBe(true);
  });

  it('3D画面（canvas）は、入れ物の幅におさまる', () => {
    const view = /\.explore__view \{([\s\S]*?)\}/.exec(css)![1]!;
    expect(/width:\s*100%;/.test(view)).toBe(true);
    expect(/max-width:\s*100%;/.test(view)).toBe(true);
  });
});
