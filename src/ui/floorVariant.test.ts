import { describe, expect, it } from 'vitest';
import { FLOOR_PATTERNS, floorVariant } from './floorVariant';

describe('floorVariant', () => {
  it('同じ場所はいつも同じ模様で、どの種類もまんべんなく使われる', () => {
    expect(floorVariant(5, 7)).toBe(floorVariant(5, 7));
    const counts = new Array<number>(FLOOR_PATTERNS).fill(0);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) counts[floorVariant(x, y)]!++;
    for (const c of counts) expect(c).toBeGreaterThan(1600 / FLOOR_PATTERNS / 2);
  });
});
