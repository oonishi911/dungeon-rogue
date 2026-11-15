import { describe, expect, it } from 'vitest';
import { enemyDef } from './enemies';
import { around9, FIELD_CONFIG, fieldAt, immuneToField, placeField, tickFields } from './fields';
import type { Field } from './exploreTypes';
import { act, arena, foe, mapOf, ROOM, WAIT } from './testArena';
import type { ExploreState } from './exploreTypes';

// テストデータ（src/game/testdata/）で、火の小鬼は炎の敵、氷の小鬼は氷の敵、ゴブリンは無属性の敵

const map = mapOf(ROOM);
const player = { x: 1, y: 3 };
const fire = (x: number, y: number, turns: number = FIELD_CONFIG.fireTurns): Field => ({ pos: { x, y }, kind: 'fire', turns });
const frost = (x: number, y: number, turns: number = FIELD_CONFIG.frostTurns): Field => ({ pos: { x, y }, kind: 'frost', turns });

describe('床の跡の置き方（fields.ts）', () => {
  it('中心と、まわり8マス', () => {
    expect(around9({ x: 5, y: 2 })).toHaveLength(9);
    expect(around9({ x: 5, y: 2 })).toContainEqual({ x: 4, y: 1 });
  });

  it('壁と主人公のいるマスには置かない', () => {
    expect(placeField([], map, { x: 0, y: 0 }, 'fire', player).fields).toEqual([]);
    expect(placeField([], map, player, 'fire', player).fields).toEqual([]);
  });

  it('決まったターン数で置く。同じ床にもう一度置くと、残りターンを延ばす', () => {
    const a = placeField([], map, { x: 4, y: 2 }, 'fire', player).fields;
    expect(a).toEqual([fire(4, 2)]);
    const b = placeField([fire(4, 2, 1)], map, { x: 4, y: 2 }, 'fire', player).fields;
    expect(b).toEqual([fire(4, 2)]);
    expect(placeField([], map, { x: 4, y: 2 }, 'frost', player).fields).toEqual([frost(4, 2)]);
  });

  it('逆の床と同じマス・縦横に隣り合うと、両方消えて水蒸気になる。斜めなら消えない', () => {
    const same = placeField([frost(4, 2)], map, { x: 4, y: 2 }, 'fire', player);
    expect(same.fields).toEqual([]);
    expect(same.steam).toContainEqual({ x: 4, y: 2 });
    const next = placeField([frost(5, 2)], map, { x: 4, y: 2 }, 'fire', player);
    expect(next.fields).toEqual([]);
    expect(next.steam).toHaveLength(2);
    expect(placeField([frost(5, 3)], map, { x: 4, y: 2 }, 'fire', player).fields).toHaveLength(2);
  });

  it('1ターン進めると、残りが減り、0になると消える', () => {
    expect(tickFields([fire(2, 2, 2), frost(3, 2, 1)])).toEqual([fire(2, 2, 1)]);
  });

  it('炎の敵は燃える床に、氷の敵は霜の床に、影響を受けない', () => {
    expect(immuneToField(enemyDef({ id: 'fire_imp', elite: false }), 'fire')).toBe(true);
    expect(immuneToField(enemyDef({ id: 'fire_imp', elite: false }), 'frost')).toBe(false);
    expect(immuneToField(enemyDef({ id: 'ice_imp', elite: false }), 'frost')).toBe(true);
    expect(immuneToField(enemyDef({ id: 'goblin', elite: false }), 'fire')).toBe(false);
  });
});

function withSpell(state: ExploreState, spell: 'fire_bolt' | 'fire_chain' | 'ice_bolt'): ExploreState {
  return { ...state, spells: [spell], mp: 99, stats: { ...state.stats, hp: 999, maxHp: 999 } };
}

describe('呪文・砥石で床が残る', () => {
  it('炎の矢：当たった敵の足元に燃える床。まわりには残らない', () => {
    const s0 = withSpell(arena(ROOM, player, [foe('goblin', { x: 4, y: 3 }, { hp: 99 })]), 'fire_bolt');
    const s = act(s0, { kind: 'cast', spell: 'fire_bolt', dir: 'right' });
    expect(s.fields.map((f) => f.kind)).toEqual(['fire']);
    expect(s.fields[0]!.pos).toEqual({ x: 4, y: 3 });
  });

  it('炎の連矢：当たった敵のまわり8マスにも残る（主人公のいるマスと壁には残らない）', () => {
    const s0 = withSpell(arena(ROOM, { x: 2, y: 2 }, [foe('goblin', { x: 4, y: 2 }, { hp: 99 })]), 'fire_chain');
    const s = act(s0, { kind: 'cast', spell: 'fire_chain', dir: 'right' });
    expect(s.fields.length).toBe(9);
    expect(s.fields.some((f) => f.pos.x === 2 && f.pos.y === 2)).toBe(false);
  });

  it('氷の矢：霜の床が残る', () => {
    const s0 = withSpell(arena(ROOM, player, [foe('goblin', { x: 4, y: 3 }, { hp: 99 })]), 'ice_bolt');
    const s = act(s0, { kind: 'cast', spell: 'ice_bolt', dir: 'right' });
    expect(s.fields).toEqual([{ pos: { x: 4, y: 3 }, kind: 'frost', turns: FIELD_CONFIG.frostTurns - 1 }]);
  });

  it('何にも当たらなければ、床は残らない', () => {
    const s = act(withSpell(arena(ROOM, player, []), 'fire_bolt'), { kind: 'cast', spell: 'fire_bolt', dir: 'right' });
    expect(s.fields).toEqual([]);
  });

  it('炎の砥石で敵を殴ると、敵の足元に燃える床。氷の砥石なら霜の床', () => {
    const base = arena(ROOM, player, [foe('goblin', { x: 2, y: 3 }, { hp: 99 })]);
    const fireHit = act({ ...base, stats: { ...base.stats, enchant: { element: 'fire', hits: 5 } } }, { kind: 'move', dir: 'right' });
    expect(fireHit.fields.map((f) => f.kind)).toEqual(['fire']);
    const iceHit = act({ ...base, stats: { ...base.stats, enchant: { element: 'ice', hits: 5 } } }, { kind: 'move', dir: 'right' });
    expect(iceHit.fields.map((f) => f.kind)).toEqual(['frost']);
    expect(act(base, { kind: 'move', dir: 'right' }).fields).toEqual([]);
  });

  it('燃える床と霜の床が隣り合うと、水蒸気になって両方消える', () => {
    const base = withSpell(arena(ROOM, player, [foe('goblin', { x: 4, y: 3 }, { hp: 99 }), foe('goblin', { x: 5, y: 3 }, { hp: 99 })]), 'ice_bolt');
    const s = act({ ...base, fields: [fire(5, 3)] }, { kind: 'cast', spell: 'ice_bolt', dir: 'right' });
    expect(s.fields).toEqual([]);
    expect(s.foes.filter((f) => f.kind === 'steam').length).toBeGreaterThan(0);
  });
});

describe('燃える床', () => {
  it('乗っている敵は毎ターンダメージを受け、決まったターンで消える', () => {
    const s0 = { ...arena(ROOM, player, [foe('goblin', { x: 8, y: 1 }, { hp: 99, stun: 9 })]), fields: [fire(8, 1)] };
    let s = s0;
    for (let i = 0; i < FIELD_CONFIG.fireTurns; i++) s = act(s, WAIT);
    expect(s.enemies[0]!.hp).toBe(99 - FIELD_CONFIG.fireDamage * FIELD_CONFIG.fireTurns);
    expect(s.fields).toEqual([]);
    expect(act(s, WAIT).enemies[0]!.hp).toBe(s.enemies[0]!.hp);
  });

  it('炎の敵は影響を受けない', () => {
    const s = act({ ...arena(ROOM, player, [foe('fire_imp', { x: 8, y: 1 }, { hp: 50, stun: 9 })]), fields: [fire(8, 1)] }, WAIT);
    expect(s.enemies[0]!.hp).toBe(50);
  });

  it('燃える床で倒れた敵は、ふつうに倒したときと同じ報酬になる', () => {
    const base = arena(ROOM, player, [foe('goblin', { x: 8, y: 1 }, { hp: 1, stun: 9 })]);
    const s = act({ ...base, fields: [fire(8, 1)] }, WAIT);
    expect(s.enemies).toHaveLength(0);
    expect(s.defeated).toBe(base.defeated + 1);
  });

  it('主人公も、乗っていればダメージを受ける', () => {
    const base = arena(ROOM, { x: 2, y: 2 }, []);
    const s = act({ ...base, fields: [fire(2, 2)] }, WAIT);
    expect(s.stats.hp).toBe(base.stats.hp - FIELD_CONFIG.fireDamage);
    expect(s.hits.find((h) => h.kind === 'taken')).toMatchObject({ amount: FIELD_CONFIG.fireDamage });
  });
});

describe('霜の床', () => {
  it('乗っている敵は、次の1歩に2ターンかかる（霜の敵は普通に歩く）', () => {
    const slow = { ...arena(ROOM, { x: 4, y: 1 }, [foe('goblin', { x: 8, y: 1 }, { hp: 99 })]), fields: [frost(8, 1)] };
    const a = act(slow, WAIT);
    expect(a.enemies[0]!.pos).toEqual({ x: 8, y: 1 }); // 1ターン目は動けない
    const b = act(a, WAIT);
    expect(b.enemies[0]!.pos).toEqual({ x: 7, y: 1 });
    const free = { ...arena(ROOM, { x: 4, y: 1 }, [foe('ice_imp', { x: 8, y: 1 }, { hp: 99 })]), fields: [frost(8, 1)] };
    expect(act(free, WAIT).enemies[0]!.pos).toEqual({ x: 7, y: 1 });
  });

  it('隣り合っていれば、霜の床の上でも殴ってくる', () => {
    const s0 = { ...arena(ROOM, { x: 7, y: 1 }, [foe('goblin', { x: 8, y: 1 }, { hp: 99 })]), fields: [frost(8, 1)] };
    expect(act(s0, WAIT).stats.hp).toBeLessThan(s0.stats.hp);
  });

  it('主人公は、霜の床から歩き出すと、その1歩に2ターンかかる', () => {
    const base = arena(ROOM, { x: 2, y: 2 }, []);
    const walked = act({ ...base, fields: [frost(2, 2)] }, { kind: 'move', dir: 'right' });
    expect(walked.player).toEqual({ x: 3, y: 2 });
    expect(walked.turn).toBe(base.turn + 2);
    expect(act(base, { kind: 'move', dir: 'right' }).turn).toBe(base.turn + 1);
  });

  it('霜の床の上で敵を殴るのは、1ターンのまま', () => {
    const base = arena(ROOM, { x: 2, y: 2 }, [foe('goblin', { x: 3, y: 2 }, { hp: 99 })]);
    expect(act({ ...base, fields: [frost(2, 2)] }, { kind: 'move', dir: 'right' }).turn).toBe(base.turn + 1);
  });
});

describe('階を移ると', () => {
  it('床の跡は消える', () => {
    const base = arena(ROOM, { x: 1, y: 1 }, []);
    const s = { ...base, fields: [fire(3, 1)], map: { ...base.map, stairs: { x: 1, y: 1 } } };
    expect(act(s, { kind: 'descend' }).fields).toEqual([]);
    expect(fieldAt([fire(3, 1)], { x: 3, y: 1 })).toBeDefined();
  });
});
