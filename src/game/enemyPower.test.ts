// 敵の強さ（ダンジョンと階の倍率。enemies.ts の powerAt・enemyDef。docs/dungeon-design.md の「敵の強さ」）
import { afterEach, describe, expect, it } from 'vitest';
import { enemyHitDamage } from './combat';
import { enemyBase } from './data';
import { DEFAULT_DUNGEON } from './dungeons';
import { BOSS_ENEMY, FIELD_ENEMY } from './enemies.fixtures';
import { empower, ENEMY_CONFIG, enemyDef, powerAt, type MapEnemy } from './enemies';
import { startExplore } from './explore';
import { genProblems } from './genMaster';
import type { PlayerStats } from './types';

const saved = { ...DEFAULT_DUNGEON.enemies };
afterEach(() => Object.assign(DEFAULT_DUNGEON.enemies, saved));

const rates = (hpRate: number, atkRate: number, floorHpRate = 0, floorAtkRate = 0) => ({ hpRate, atkRate, floorHpRate, floorAtkRate });
const foe = (extra: Partial<MapEnemy> = {}): MapEnemy => ({ uid: 0, id: FIELD_ENEMY, elite: false, pos: { x: 1, y: 1 }, hp: 1, mode: 'wander', justNoticed: false, lastSeen: null, searchTurns: 0, ...extra });

describe('強さの倍率（powerAt）', () => {
  it('1階目は設定の倍率で、1階深くなるごとに、1階目の倍率に対して決まった割合ずつ増える', () => {
    expect(powerAt(rates(2, 1.5, 0.1, 0.2), 0)).toEqual({ hp: 2, atk: 1.5 });
    expect(powerAt(rates(2, 1.5, 0.1, 0.2), 2)).toEqual({ hp: 2.4, atk: 2.1 });
    expect(powerAt(rates(1, 1), 4)).toEqual({ hp: 1, atk: 1 });
  });
});

describe('倍率を付けた敵の能力（enemyDef）', () => {
  it('HPと攻撃に倍率が掛かり、防御はそのまま。倍率がなければ設定のまま', () => {
    const base = enemyBase(FIELD_ENEMY);
    expect(enemyDef(foe())).toEqual(base);
    const def = enemyDef(foe({ power: { hp: 2, atk: 1.5 } }));
    expect(def.hp).toBe(Math.round(base.hp * 2));
    expect(def.atk).toBe(Math.round(base.atk * 1.5));
    expect(def.def).toBe(base.def);
  });

  it('強敵は、強敵の倍率のあとに、さらに強さの倍率が掛かる', () => {
    const base = enemyBase(FIELD_ENEMY);
    const def = enemyDef(foe({ elite: true, power: { hp: 2, atk: 2 } }));
    expect(def.hp).toBe(Math.round(Math.round(base.hp * ENEMY_CONFIG.eliteHpRate) * 2));
    expect(def.atk).toBe(Math.round(Math.round(base.atk * ENEMY_CONFIG.eliteAtkRate) * 2));
  });

  it('ボスは、HPだけ強くなる（攻撃は段階で上がるので、そのまま）', () => {
    const base = enemyBase(BOSS_ENEMY);
    const def = enemyDef(foe({ id: BOSS_ENEMY, elite: true, power: { hp: 1.5, atk: 3 } }));
    expect(def.hp).toBe(Math.round(base.hp * 1.5));
    expect(def.atk).toBe(base.atk);
  });

  it('empower は、倍率を付けて、HPをその強さの満タンにする', () => {
    const e = empower(foe({ hp: 1 }), { hp: 3, atk: 1 });
    expect(e.power).toEqual({ hp: 3, atk: 1 });
    expect(e.hp).toBe(enemyDef(e).hp);
    expect(e.hp).toBe(Math.round(enemyBase(FIELD_ENEMY).hp * 3));
  });

  it('攻撃が上がると、守りを引いたあとのダメージが残る（守りの高い防具でも1にならない）', () => {
    const player: PlayerStats = { hp: 100, maxHp: 100, atk: 6, def: 6, mag: 0, poisonTurns: 0, weapon: null, armor: null, items: [], enchant: null };
    const weak = { ...enemyBase(FIELD_ENEMY), atk: 7 };
    expect(enemyHitDamage(player, weak)).toBe(1);
    expect(enemyHitDamage(player, { ...weak, atk: Math.round(7 * 2) })).toBe(8);
  });
});

describe('探索で', () => {
  it('階に置かれた敵には、そのダンジョンの1階目の強さが付き、HPは満タン', () => {
    Object.assign(DEFAULT_DUNGEON.enemies, rates(2, 1.5, 0.1, 0.1));
    const s = startExplore(11);
    expect(s.enemies.length).toBeGreaterThan(0);
    for (const e of s.enemies) {
      expect(e.power).toEqual({ hp: 2, atk: 1.5 });
      expect(e.hp).toBe(enemyDef(e).hp);
    }
  });

  it('倍率が1なら、敵の能力は設定のまま', () => {
    Object.assign(DEFAULT_DUNGEON.enemies, rates(1, 1));
    const s = startExplore(11);
    for (const e of s.enemies) expect(enemyDef(e).hp).toBe(enemyDef({ id: e.id, elite: e.elite }).hp);
  });
});

describe('設定の確かめ', () => {
  it('倍率が範囲の外なら、設定のまちがいとして見つかる', () => {
    const file = JSON.parse(JSON.stringify(DEFAULT_DUNGEON));
    expect(genProblems(file)).toEqual([]);
    file.enemies.hpRate = 0;
    file.enemies.floorAtkRate = 2;
    delete file.enemies.atkRate;
    const p = genProblems(file);
    expect(p.some((x) => x.startsWith('敵のHPの倍率'))).toBe(true);
    expect(p.some((x) => x.startsWith('敵の攻撃の倍率'))).toBe(true);
    expect(p.some((x) => x.startsWith('1階ごとに増える敵の攻撃の倍率'))).toBe(true);
  });
});
