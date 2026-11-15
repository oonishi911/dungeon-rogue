import { describe, expect, it } from 'vitest';
import { playerHitDamage } from './combat';
import { ENEMY_CONFIG, enemyDef } from './enemies';
import type { ExploreState } from './exploreTypes';
import { dungeonOfState } from './explore';
import { FIELD_CONFIG } from './fields';
import { magicPower } from './magic';
import { act, arena, foe, ROOM, WAIT } from './testArena';
import { gaugeMax, SKILL_CONFIG, skillOf } from './weaponSkill';
import type { ItemId } from './types';

// テストデータ（src/game/testdata/）の武器：剣・槌・杖が、それぞれ1〜10段。敵はゴブリン（無属性・普通の体質）

const player = { x: 3, y: 2 };
const SKILL = { kind: 'skill', dir: 'right' } as const;

/** 武器を持たせ、技ゲージを満タンにした部屋 */
function armed(weapon: ItemId | null, enemies = [foe('goblin', { x: 4, y: 2 }, { hp: 99 })], full = true): ExploreState {
  const base = arena(ROOM, player, enemies);
  const max = skillOf(weapon)?.max ?? 0;
  return { ...base, stats: { ...base.stats, weapon, hp: 999, maxHp: 999 }, skill: full ? max : 0 };
}

describe('技ゲージ', () => {
  it('満タンまでの回数は、武器の段階で決まる（1〜3段4回、4〜7段3回、8〜10段2回）', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(gaugeMax)).toEqual([4, 4, 4, 3, 3, 3, 3, 2, 2, 2]);
    expect(skillOf('sword')).toMatchObject({ weapon: 'sword', name: '連斬り', max: 4 });
    expect(skillOf('hammer_5')).toMatchObject({ weapon: 'hammer', name: '地響き', max: 3 });
    expect(skillOf('staff_9')).toMatchObject({ weapon: 'staff', name: '魔力弾', max: 2 });
    expect(skillOf(null)).toBeNull();
  });

  it('通常攻撃を当てるたびに1たまり、満タンを超えない', () => {
    let s = armed('sword', [foe('goblin', { x: 4, y: 2 }, { hp: 999 })], false);
    for (let i = 1; i <= 6; i++) {
      s = act(s, { kind: 'move', dir: 'right' });
      expect(s.skill).toBe(Math.min(i, 4));
    }
  });

  it('素手や、攻撃しない行動では、たまらない', () => {
    const bare = act(armed(null, [foe('goblin', { x: 4, y: 2 }, { hp: 999 })], false), { kind: 'move', dir: 'right' });
    expect(bare.skill).toBe(0);
    expect(act(armed('sword', undefined, false), WAIT).skill).toBe(0);
  });

  it('満タンでなければ、技は出せない。武器がなくても出せない', () => {
    expect(() => act(armed('sword', undefined, false), SKILL)).toThrow('技ゲージがたまっていない');
    expect(() => act(armed(null), SKILL)).toThrow('武器を持っていない');
  });
});

describe('剣「連斬り」', () => {
  it('向いた方向の隣の敵に2回、合計で通常の1.6倍。ゲージは0に戻り、1ターンかかる。出血する', () => {
    const s0 = armed('sword');
    const def = enemyDef(s0.enemies[0]!);
    const each = Math.max(1, Math.round((playerHitDamage(s0.stats, def) * SKILL_CONFIG.slashRate) / SKILL_CONFIG.slashHits));
    const s = act(s0, SKILL);
    expect(s.enemies[0]!.hp).toBe(99 - each * 2);
    expect(s.hits.filter((h) => h.kind === 'dealt')).toHaveLength(2);
    expect(s.skill).toBe(0);
    expect(s.turn).toBe(s0.turn + 1);
    expect(s.enemies[0]!.bleed).toEqual({ amount: Math.max(1, Math.round(each * SKILL_CONFIG.bleedRate)), turns: SKILL_CONFIG.bleedTurns });
    expect(s.foes).toContainEqual({ kind: 'skill', weapon: 'sword', from: player, dir: 'right', path: [{ x: 4, y: 2 }] });
  });

  it('出血は、出したターンにはまだダメージを受けず、次のターンから受ける', () => {
    const s1 = act(armed('sword'), SKILL);
    const s2 = act(s1, WAIT);
    expect(s2.enemies[0]!.hp).toBeLessThan(s1.enemies[0]!.hp);
  });

  it('向いた方向に敵がいなければ出せず、ゲージも減らない', () => {
    const s0 = armed('sword');
    expect(() => act(s0, { kind: 'skill', dir: 'left' })).toThrow('向いた方向に敵がいない');
    expect(() => act(s0, { kind: 'skill' })).toThrow('向きを選んでください');
  });

  it('1回目で倒したら、2回目は出さない（倒した数は1つ）', () => {
    const s0 = armed('sword', [foe('goblin', { x: 4, y: 2 }, { hp: 1 })]);
    const s = act(s0, SKILL);
    expect(s.enemies).toHaveLength(0);
    expect(s.hits.filter((h) => h.kind === 'dealt')).toHaveLength(1);
    expect(s.defeated).toBe(s0.defeated + 1);
  });

  it('盾持ちの正面からなら、7割防がれる', () => {
    const s0 = armed('sword', [foe('holy_knight', { x: 4, y: 2 }, { hp: 99, facing: 'left' })]);
    const def = enemyDef(s0.enemies[0]!);
    const each = Math.max(1, Math.round(((playerHitDamage(s0.stats, def) * SKILL_CONFIG.slashRate) / SKILL_CONFIG.slashHits) * (1 - ENEMY_CONFIG.shieldCut)));
    expect(act(s0, SKILL).enemies[0]!.hp).toBe(99 - each * 2);
  });
});

describe('槌「地響き」', () => {
  const ring = [foe('goblin', { x: 4, y: 2 }, { hp: 99 }), foe('goblin', { x: 2, y: 1 }, { hp: 99 }), foe('goblin', { x: 4, y: 3 }, { hp: 99 }), foe('goblin', { x: 6, y: 2 }, { hp: 99 })];

  it('まわり8マスの敵すべてに通常のダメージと、1ターンの気絶。離れた敵は巻き込まない', () => {
    const s0 = armed('hammer', ring);
    const each = playerHitDamage(s0.stats, enemyDef(s0.enemies[0]!));
    const s = act(s0, { kind: 'skill' });
    expect(s.enemies.map((e) => e.hp)).toEqual([99 - each, 99 - each, 99 - each, 99]);
    expect(s.skill).toBe(0);
    expect(s.foes.filter((f) => f.kind === 'skill')).toHaveLength(1);
  });

  it('気絶した敵は、次のターンに動けない（攻撃してこない）', () => {
    const s = act(armed('hammer', [foe('goblin', { x: 4, y: 2 }, { hp: 99 })]), { kind: 'skill' });
    expect(s.stats.hp).toBe(999); // 気絶中なので、同じターンに殴り返されない
  });

  it('まわりに敵がいなければ出せない', () => {
    expect(() => act(armed('hammer', [foe('goblin', { x: 6, y: 2 }, { hp: 99 })]), { kind: 'skill' })).toThrow('まわりに敵がいない');
  });

  it('炎の砥石の武器なら、当たった敵すべての足元に燃える床が残り、砥石は1回だけ減る', () => {
    const s0 = armed('hammer', ring);
    const s = act({ ...s0, stats: { ...s0.stats, enchant: { element: 'fire', hits: 5 } } }, { kind: 'skill' });
    expect(s.fields.filter((f) => f.kind === 'fire')).toHaveLength(3);
    expect(s.stats.enchant!.hits).toBe(4);
    expect(FIELD_CONFIG.fireTurns).toBeGreaterThan(1);
  });
});

describe('杖「魔力弾」', () => {
  it('向いた方向の最初の敵に、魔法の強さの1.5倍。敵の防御は無視する', () => {
    const s0 = armed('staff', [foe('goblin', { x: 6, y: 2 }, { hp: 99 }), foe('goblin', { x: 8, y: 2 }, { hp: 99 })]);
    const def = enemyDef(s0.enemies[0]!);
    const dmg = Math.max(1, Math.round(magicPower(s0.stats, dungeonOfState(s0).magic) * SKILL_CONFIG.boltRate * (def.magic ?? 1)));
    const s = act(s0, SKILL);
    expect(s.enemies.map((e) => e.hp)).toEqual([99 - dmg, 99]);
    expect(s.skill).toBe(0);
    expect(s.foes).toContainEqual({ kind: 'skill', weapon: 'staff', from: player, dir: 'right', path: [4, 5, 6].map((x) => ({ x, y: 2 })) });
  });

  it('届くマス数を超えた敵と、壁の向こうの敵には当たらない', () => {
    expect(() => act(armed('staff', [foe('goblin', { x: 3 + SKILL_CONFIG.boltRange + 1, y: 2 }, { hp: 99 })]), SKILL)).toThrow('向いた方向に敵がいない');
    expect(() => act(armed('staff', [foe('goblin', { x: 4, y: 2 }, { hp: 99 })]), { kind: 'skill', dir: 'up' })).toThrow('向いた方向に敵がいない');
  });
});
