// 敵への状態異常（燃焼・凍結）とコンボ。docs/combat-fun-spec.md の①
// テストデータ（src/game/testdata/）で、火の小鬼は炎の敵、氷の小鬼は氷の敵、ゴブリンは無属性の敵
import { afterEach, describe, expect, it } from 'vitest';
import { STATUS_MASTER } from './data';
import { BOSS_ENEMY } from './enemies.fixtures';
import { enemyDef } from './enemies';
import { foeImmune, foeTurns, scaled } from './foeStatus';
import type { ExploreState } from './exploreTypes';
import { act, arena, foe, ROOM, WAIT } from './testArena';
import type { ItemId, SpellId } from './types';

const player = { x: 2, y: 3 };
const at = { x: 3, y: 3 };
const far = { x: 5, y: 3 };

/** 武器を持ち替え、呪文を持ち、HPを多くした状態 */
function armed(foes: Parameters<typeof arena>[2], weapon: ItemId | null, spell?: SpellId, enchant?: 'fire' | 'ice'): ExploreState {
  const s = arena(ROOM, player, foes);
  return {
    ...s,
    spells: spell ? [spell] : [],
    mp: 99,
    maxMp: 99,
    stats: { ...s.stats, hp: 999, maxHp: 999, atk: 6, weapon, enchant: enchant ? { element: enchant, hits: 5 } : null },
  };
}
const enemyOf = (s: ExploreState, uid = 0) => s.enemies.find((e) => e.uid === uid);

const saved = JSON.stringify(STATUS_MASTER.foe);
afterEach(() => {
  Object.assign(STATUS_MASTER.foe, JSON.parse(saved));
  STATUS_MASTER.foe.burn = JSON.parse(saved).burn;
  STATUS_MASTER.foe.freeze = JSON.parse(saved).freeze;
});

describe('かかる・かからない', () => {
  it('炎の矢は必ず燃やす。ターンは設定のとおり（毎ターンのダメージも入る）', () => {
    const s = act(armed([foe('goblin', at, { hp: 99 })], 'sword', 'fire_bolt'), { kind: 'cast', spell: 'fire_bolt', dir: 'right' });
    const g = enemyOf(s)!;
    const { turns, damage } = STATUS_MASTER.foe.burn;
    expect(g.burn).toEqual({ turns, amount: damage }); // 燃やしたターンは、まだダメージを受けない
    expect(s.log.some((l) => l.includes('燃え上がった'))).toBe(true);
    expect(s.log.some((l) => l.includes('燃焼で'))).toBe(false);
    const after = act(s, WAIT); // 次のターンから、毎ターンのダメージ
    expect(enemyOf(after)!.hp).toBeLessThanOrEqual(g.hp - damage); // （炎の矢が残した燃える床のダメージも入る）
    expect(enemyOf(after)!.burn).toEqual({ turns: turns - 1, amount: damage });
    expect(after.log.some((l) => l.includes('燃焼で'))).toBe(true);
  });

  it('氷の矢は必ず凍らせる（動けない）。切れると動き出す', () => {
    let s = act(armed([foe('goblin', at, { hp: 99 })], 'sword', 'ice_bolt'), { kind: 'cast', spell: 'ice_bolt', dir: 'right' });
    expect(enemyOf(s)!.frozen).toBe(true);
    const turns = STATUS_MASTER.foe.freeze.turns;
    // 1ターン目は、かけたそのターンに1つ減っている
    for (let i = 0; i < turns - 1; i++) s = act(s, WAIT);
    expect(enemyOf(s)!.frozen).toBeUndefined();
    expect(enemyOf(s)!.stun).toBeUndefined();
  });

  it('凍っている敵は、隣にいても殴ってこない', () => {
    const s = act(armed([foe('goblin', at, { hp: 99 })], 'sword', 'ice_bolt'), { kind: 'cast', spell: 'ice_bolt', dir: 'right' });
    expect(s.stats.hp).toBe(999);
  });

  it('炎の敵は燃えない、氷の敵は凍らない（ログに出る）。ボスも凍らない', () => {
    const a = act(armed([foe('fire_imp', at, { hp: 99 })], 'sword', 'fire_bolt'), { kind: 'cast', spell: 'fire_bolt', dir: 'right' });
    expect(enemyOf(a)!.burn).toBeUndefined();
    expect(a.log.some((l) => l.includes('燃えない'))).toBe(true);
    const b = act(armed([foe('ice_imp', at, { hp: 99 })], 'sword', 'ice_bolt'), { kind: 'cast', spell: 'ice_bolt', dir: 'right' });
    expect(enemyOf(b)!.frozen).toBeUndefined();
    expect(foeImmune({ id: BOSS_ENEMY, elite: false }, 'freeze')).toBe(true);
    expect(foeImmune({ id: BOSS_ENEMY, elite: false }, 'burn')).toBe(enemyDef({ id: BOSS_ENEMY, elite: false }).element === 'fire'); // ボスも、炎の敵なら燃えない
    expect(foeImmune({ id: 'goblin', elite: false }, 'freeze')).toBe(false);
  });

  it('弱点の属性（炎→氷の敵、氷→炎の敵）はターンが延びる', () => {
    expect(foeTurns({ id: 'ice_imp', elite: false }, 'fire', 'burn')).toBe(STATUS_MASTER.foe.burn.turns + STATUS_MASTER.foe.weakBonus);
    expect(foeTurns({ id: 'goblin', elite: false }, 'fire', 'burn')).toBe(STATUS_MASTER.foe.burn.turns);
    expect(foeTurns({ id: 'fire_imp', elite: false }, 'ice', 'freeze')).toBe(STATUS_MASTER.foe.freeze.turns + STATUS_MASTER.foe.weakBonus);
  });

  it('燃えている敵に氷、凍っている敵に炎は、蒸気になって、どちらも消える', () => {
    const burning = foe('goblin', at, { hp: 99, burn: { turns: 3, amount: 2 } });
    const a = act(armed([burning], 'sword', 'ice_bolt'), { kind: 'cast', spell: 'ice_bolt', dir: 'right' });
    expect(enemyOf(a)!.burn).toBeUndefined();
    expect(enemyOf(a)!.frozen).toBeUndefined();
    expect(a.foes.some((f) => f.kind === 'steam')).toBe(true);
    const frozen = foe('goblin', at, { hp: 99, frozen: true, stun: 3 });
    const b = act(armed([frozen], 'sword', 'fire_bolt'), { kind: 'cast', spell: 'fire_bolt', dir: 'right' });
    expect(enemyOf(b)!.frozen).toBeUndefined();
    expect(enemyOf(b)!.burn).toBeUndefined();
    expect(b.log.some((l) => l.includes('蒸気'))).toBe(true);
  });

  it('毎ターン燃焼のダメージが入り、倒れたら敵が消える', () => {
    let s = armed([foe('goblin', far, { hp: 3, burn: { turns: 3, amount: 2 }, mode: 'wander' })], 'sword');
    s = act(s, WAIT);
    expect(enemyOf(s)!.hp).toBe(1);
    s = act(s, WAIT);
    expect(enemyOf(s)).toBeUndefined();
    expect(s.defeated).toBe(1);
  });
});

describe('砥石で殴ったとき（確率）', () => {
  it('確率100%なら、必ずかかる。0%ならかからない', () => {
    STATUS_MASTER.foe.burn.chance = 100;
    const a = act(armed([foe('goblin', at, { hp: 99 })], 'sword', undefined, 'fire'), { kind: 'move', dir: 'right' });
    expect(enemyOf(a)!.burn).toBeDefined();
    STATUS_MASTER.foe.burn.chance = 0;
    const b = act(armed([foe('goblin', at, { hp: 99 })], 'sword', undefined, 'fire'), { kind: 'move', dir: 'right' });
    expect(enemyOf(b)!.burn).toBeUndefined();
  });

  it('氷の砥石で凍る（確率100%）', () => {
    STATUS_MASTER.foe.freeze.chance = 100;
    const s = act(armed([foe('goblin', at, { hp: 99 })], 'hammer', undefined, 'ice'), { kind: 'move', dir: 'right' });
    expect(enemyOf(s)!.frozen).toBe(true);
  });
});

describe('コンボ', () => {
  it('ハンマー × 凍結 ＝ 砕く：ダメージが設定の倍率になり、凍結が解ける', () => {
    const plain = act(armed([foe('goblin', at, { hp: 99 })], 'hammer'), { kind: 'move', dir: 'right' });
    const normal = 99 - enemyOf(plain)!.hp;
    const s = act(armed([foe('goblin', at, { hp: 99, frozen: true, stun: 2 })], 'hammer'), { kind: 'move', dir: 'right' });
    const smashed = 99 - enemyOf(s)!.hp;
    expect(smashed).toBe(scaled(normal, STATUS_MASTER.foe.smashPercent));
    expect(smashed).toBeGreaterThan(normal);
    expect(enemyOf(s)!.frozen).toBeUndefined();
    expect(s.hits.some((h) => h.combo === 'smash')).toBe(true);
    expect(s.log.some((l) => l.includes('砕いた'))).toBe(true);
  });

  it('剣 × 凍結は、砕けない（ハンマーだけ）', () => {
    const s = act(armed([foe('goblin', at, { hp: 99, frozen: true, stun: 3 })], 'sword'), { kind: 'move', dir: 'right' });
    expect(s.hits.some((h) => h.combo)).toBe(false);
    expect(enemyOf(s)!.frozen).toBe(true);
  });

  it('剣 × 燃焼 ＝ 焼き斬り：残りの燃焼ダメージを一度に与え、火が消える', () => {
    const plain = act(armed([foe('goblin', at, { hp: 99 })], 'sword'), { kind: 'move', dir: 'right' });
    const normal = 99 - enemyOf(plain)!.hp;
    const s = act(armed([foe('goblin', at, { hp: 99, burn: { turns: 3, amount: 2 } })], 'sword'), { kind: 'move', dir: 'right' });
    expect(99 - enemyOf(s)!.hp).toBe(normal + 6);
    expect(enemyOf(s)!.burn).toBeUndefined();
    expect(s.hits.some((h) => h.combo === 'sear')).toBe(true);
  });

  it('杖の呪文 × 燃焼・凍結：ダメージが設定の倍率になる（剣では増えない）', () => {
    const cast = (weapon: ItemId, extra: object) => {
      const s = act(armed([foe('goblin', at, { hp: 99, ...extra })], weapon, 'shockwave'), { kind: 'cast', spell: 'shockwave' });
      return { s, dmg: 99 - (enemyOf(s)?.hp ?? 0) };
    };
    const base = cast('staff', {});
    const boosted = cast('staff', { frozen: true, stun: 3 });
    expect(boosted.dmg).toBe(scaled(base.dmg, STATUS_MASTER.foe.spellPercent));
    expect(boosted.s.hits.some((h) => h.combo === 'arcane')).toBe(true);
    const sword = cast('sword', { frozen: true, stun: 3 });
    expect(sword.s.hits.some((h) => h.combo)).toBe(false);
  });
});
