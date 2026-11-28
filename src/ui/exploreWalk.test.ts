// タップ・「階段へ」で歩くときの小さな関数（exploreWalk.ts）
import { describe, expect, it } from 'vitest';
import { startExplore } from '../game/explore';
import type { ExploreState } from '../game/exploreTypes';
import { avoidOnWalk, knownStairs } from './exploreWalk';

const base = (): ExploreState => {
  const s = startExplore(3, { enemyDensity: 0, loadout: ['sword'] });
  return { ...s, enemies: [], chests: [], hits: [] };
};

describe('見つけた階段', () => {
  it('見ていない階段・足元の階段は、向かう先にしない', () => {
    const s = base();
    const st = s.map.stairs!;
    const unseen = { ...s, seen: s.seen.map(() => false) };
    expect(knownStairs(unseen)).toBeNull();
    const seen = { ...s, seen: s.seen.map(() => true) };
    expect(knownStairs(seen)).toEqual(st);
    expect(knownStairs({ ...seen, player: st })).toBeNull();
  });
});

describe('歩くときに避けるマス', () => {
  it('階段は避けるが、行き先の階段は避けない', () => {
    const s = base();
    const st = s.map.stairs!;
    expect(avoidOnWalk(s).has(`${st.x},${st.y}`)).toBe(true);
    expect(avoidOnWalk(s, st).has(`${st.x},${st.y}`)).toBe(false);
  });
});
