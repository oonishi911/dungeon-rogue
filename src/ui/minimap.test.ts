// 小地図の範囲（exploreRender.ts の miniWindow）：主人公のまわりだけを、主人公を真ん中にして描く
import { describe, expect, it } from 'vitest';
import { MINI_LOCAL_RADIUS, miniWindow } from './exploreRender';

describe('小地図の範囲', () => {
  it('主人公を真ん中にした、半径ぶんの正方形', () => {
    const r = MINI_LOCAL_RADIUS;
    expect(miniWindow({ x: 10, y: 12 })).toEqual({ x: 10 - r, y: 12 - r, w: r * 2 + 1, h: r * 2 + 1 });
  });

  it('マップの端でもずらさない（主人公はいつも真ん中）', () => {
    const w = miniWindow({ x: 0, y: 1 }, 3);
    expect(w).toEqual({ x: -3, y: -2, w: 7, h: 7 });
    expect(w.x + 3).toBe(0);
  });
});
