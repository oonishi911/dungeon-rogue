import { describe, expect, it } from 'vitest';
import { worldToTile } from './explore3d';

describe('worldToTile', () => {
  it('マスの中心は整数の座標にあり、そのマスになる', () => {
    expect(worldToTile(3, 5)).toEqual({ x: 3, y: 5 });
  });

  it('中心から半マス未満ずれた点は同じマスになる', () => {
    expect(worldToTile(3.49, 4.51)).toEqual({ x: 3, y: 5 });
    expect(worldToTile(2.51, 5.49)).toEqual({ x: 3, y: 5 });
  });

  it('奥行き（z）がマップの y になる', () => {
    expect(worldToTile(0.2, 7.8)).toEqual({ x: 0, y: 8 });
  });
});
