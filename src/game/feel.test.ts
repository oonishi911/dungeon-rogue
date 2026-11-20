// 手応え（⑥）のうち、ゲームの側：ダメージの出来事に付く、相性（弱点・効きにくい）と、倒した印。docs/combat-fun-spec.md
import { describe, expect, it } from 'vitest';
import { hitAffinity } from './combat';
import { enemyDef } from './enemies';
import type { ExploreState } from './exploreTypes';
import { act, arena, foe, ROOM } from './testArena';
import type { ItemId } from './types';

// テストデータで、火の小鬼は炎の敵、氷の小鬼は氷の敵、ゴブリンは無属性の敵
const player = { x: 2, y: 3 };
const at = { x: 3, y: 3 };

function armed(enemyId: string, hp: number, enchant: 'fire' | 'ice' | null, weapon: ItemId | null = 'sword'): ExploreState {
  const s = arena(ROOM, player, [foe(enemyId, at, { hp, mode: 'wander' })]);
  return { ...s, stats: { ...s.stats, hp: 999, maxHp: 999, atk: 6, weapon, enchant: enchant ? { element: enchant, hits: 5 } : null } };
}

describe('相性の印（hitAffinity）', () => {
  const stats = (enchant: 'fire' | 'ice' | null) => armed('goblin', 9, enchant).stats;
  it('氷の力で炎の敵を殴ると弱点、炎の力で炎の敵を殴ると効きにくい。力がなく、相性がふつうなら印なし', () => {
    expect(hitAffinity(stats('ice'), enemyDef({ id: 'fire_imp', elite: false }))).toBe('weak');
    expect(hitAffinity(stats('fire'), enemyDef({ id: 'fire_imp', elite: false }))).toBe('resist');
    expect(hitAffinity(stats(null), enemyDef({ id: 'goblin', elite: false }))).toBeNull();
  });
});

describe('ダメージの出来事に付く印', () => {
  it('通常攻撃：弱点を突いたら affinity が weak、効きにくければ resist、ふつうなら付かない', () => {
    const weak = act(armed('fire_imp', 99, 'ice'), { kind: 'move', dir: 'right' });
    expect(weak.hits[0]).toMatchObject({ kind: 'dealt', affinity: 'weak' });
    const resist = act(armed('fire_imp', 99, 'fire'), { kind: 'move', dir: 'right' });
    expect(resist.hits[0]).toMatchObject({ kind: 'dealt', affinity: 'resist' });
    const plain = act(armed('goblin', 99, null), { kind: 'move', dir: 'right' });
    expect(plain.hits[0]!.affinity).toBeUndefined();
  });

  it('倒した一撃には killed が付く。倒れなかった一撃には付かない', () => {
    const killed = act(armed('goblin', 1, null), { kind: 'move', dir: 'right' });
    expect(killed.hits[0]).toMatchObject({ kind: 'dealt', killed: true });
    expect(killed.enemies).toHaveLength(0);
    const alive = act(armed('goblin', 99, null), { kind: 'move', dir: 'right' });
    expect(alive.hits[0]!.killed).toBeUndefined();
  });

  it('燃焼のダメージで倒したときも、killed が付く（slip のダメージ）', () => {
    const s0 = arena(ROOM, player, [foe('goblin', { x: 6, y: 3 }, { hp: 1, mode: 'wander', burn: { turns: 3, amount: 2 } })]);
    const s = act({ ...s0, stats: { ...s0.stats, hp: 999, maxHp: 999 } }, { kind: 'wait' });
    expect(s.hits.find((h) => h.kind === 'dealt')).toMatchObject({ slip: true, killed: true });
  });

  it('炎の矢：弱点の敵なら affinity が weak（呪文の相性）', () => {
    const s0 = arena(ROOM, player, [foe('ice_imp', at, { hp: 99 })]);
    const s = act({ ...s0, spells: ['fire_bolt'], mp: 99, maxMp: 99, stats: { ...s0.stats, hp: 999, maxHp: 999 } }, { kind: 'cast', spell: 'fire_bolt', dir: 'right' });
    expect(s.hits.find((h) => h.kind === 'dealt')).toMatchObject({ affinity: 'weak' });
  });
});
