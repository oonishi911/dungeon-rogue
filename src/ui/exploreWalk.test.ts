// 歩き続けているときに立ち止まるわけ（exploreWalk.ts の walkInterrupt）
import { describe, expect, it } from 'vitest';
import { startExplore } from '../game/explore';
import type { ExploreState } from '../game/exploreTypes';
import { walkInterrupt } from './exploreWalk';

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

  it('新しく敵が見えたら止まる（前から見えていた敵では止まらない）', () => {
    const s = base();
    const foe = { uid: 1, id: 'goblin' as const, elite: false, pos: s.player, hp: 10, mode: 'wander' as const, justNoticed: false, lastSeen: null, searchTurns: 0 };
    const seen = { ...s, enemies: [foe] };
    expect(walkInterrupt(s, seen)).toContain('敵');
    expect(walkInterrupt(seen, seen)).toBeNull();
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
