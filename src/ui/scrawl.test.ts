import { describe, expect, it } from 'vitest';
import { MEMORIES } from '../game/story';
import { SCRAWL_CONFIG, scrawl, scratches } from './scrawl';

describe('scrawl', () => {
  const m = MEMORIES.flame_beast!;

  it('同じ記憶は、いつも同じ荒れ方になる（シードが違えば変わる）', () => {
    expect(scrawl(m.lines, m.crossed, 'flame_beast')).toEqual(scrawl(m.lines, m.crossed, 'flame_beast'));
    expect(scrawl(m.lines, m.crossed, 'flame_beast')).not.toEqual(scrawl(m.lines, m.crossed, 'ice_colossus'));
  });

  it('文章は、1文字も欠けず、順番も変わらずに並ぶ（荒れていても読める）', () => {
    const items = scrawl(m.lines, m.crossed, 'flame_beast');
    const lines = items.flatMap((i) => (i.kind === 'line' ? [i.glyphs.map((g) => g.ch).join('')] : []));
    expect(lines).toEqual(m.lines);
  });

  it('書いては消した言葉が、1行目のすぐあとに入り、最後は塗りつぶしで終わる', () => {
    const items = scrawl(m.lines, m.crossed, 'flame_beast');
    expect(items[1]!.kind).toBe('crossed');
    expect(items[items.length - 1]!.kind).toBe('black');
  });

  it('文字のずれは、決めた範囲に収まる。上から書き直した文字もある', () => {
    const c = SCRAWL_CONFIG;
    const glyphs = scrawl(m.lines, m.crossed, 'flame_beast').flatMap((i) => (i.kind === 'line' ? i.glyphs : []));
    for (const g of glyphs) {
      expect(Math.abs(g.rot)).toBeLessThanOrEqual(c.rot);
      expect(g.size).toBeGreaterThanOrEqual(c.size[0]);
      expect(g.size).toBeLessThanOrEqual(c.size[1]);
    }
    expect(glyphs.some((g) => g.over.length > 0)).toBe(true);
  });

  it('引っかき傷は、決めた数だけあり、画面の中に収まる。同じシードなら同じ傷', () => {
    const sc = scratches('flame_beast');
    expect(sc).toHaveLength(SCRAWL_CONFIG.scratches);
    expect(scratches('flame_beast')).toEqual(sc);
    for (const s of sc) for (const [, y] of s.points) expect(y >= 0 && y <= 100).toBe(true);
  });
});
