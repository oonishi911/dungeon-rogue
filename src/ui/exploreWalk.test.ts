// 歩き続けているときに立ち止まるわけ（exploreWalk.ts の walkInterrupt）
import { describe, expect, it } from 'vitest';
import { startExplore } from '../game/explore';
import type { ExploreState } from '../game/exploreTypes';
import { avoidOnWalk, knownStairs, sightedEnemyIds, walkInterrupt } from './exploreWalk';

const base = (): ExploreState => {
  const s = startExplore(3, { enemyDensity: 0, loadout: ['sword'] });
  return { ...s, enemies: [], chests: [], hits: [] };
};

describe('歩き続けているときに立ち止まるわけ', () => {
  it('何もなければ止まらない', () => {
    const s = base();
    expect(walkInterrupt(s, s)).toBeNull();
  });

  it('攻撃を受けたら止まる', () => {
    const s = base();
    expect(walkInterrupt(s, { ...s, hits: [{ kind: 'taken', at: s.player, amount: 10 }] })).toContain('攻撃');
  });

  it('敵が見えただけでは止まらない', () => {
    const s = base();
    const foe = { uid: 1, id: 'goblin' as const, elite: false, pos: s.player, hp: 10, mode: 'wander' as const, justNoticed: false, lastSeen: null, searchTurns: 0 };
    expect(walkInterrupt(s, { ...s, enemies: [foe] })).toBeNull();
  });

  it('壁の向こうの敵は、見えている敵に数えない（sightedEnemyIds）', () => {
    const s = base();
    const w = s.map.width;
    // 主人公の右に壁を立て、その向こうに敵を置く
    const tiles = s.map.tiles.slice();
    const wall = { x: s.player.x + 1, y: s.player.y };
    tiles[wall.y * w + wall.x] = 'wall';
    const walled = { ...s, map: { ...s.map, tiles } };
    const foe = { uid: 1, id: 'goblin' as const, elite: false, pos: { x: s.player.x + 2, y: s.player.y }, hp: 10, mode: 'wander' as const, justNoticed: false, lastSeen: null, searchTurns: 0 };
    expect(sightedEnemyIds({ ...walled, enemies: [foe] }).size).toBe(0);
    // 壁がなければ数える
    expect(sightedEnemyIds({ ...s, enemies: [foe] }).size).toBe(1);
  });

  it('まだ開けていない宝箱を初めて見つけたら止まる', () => {
    const s = base();
    const at = s.player;
    const hidden = { ...s, chests: [{ pos: at, opened: false }], seen: s.seen.map(() => false) } as ExploreState;
    const found = { ...hidden, seen: s.seen.map(() => true) } as ExploreState;
    expect(walkInterrupt(hidden, found)).toContain('宝箱');
    expect(walkInterrupt(found, found)).toBeNull();
  });
});

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
