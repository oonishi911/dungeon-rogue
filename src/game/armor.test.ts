// 防具の種類（docs/ring-spec.md の「防具の種類」）：鎧・法衣・毛皮の外套
import { afterEach, describe, expect, it } from 'vitest';
import { ARMOR_CONFIG, armorMagic, armorSaving, armorTypeOf, hungerLoss, regenInterval, resistsChill } from './armor';
import { buildPlayer } from './combat';
import { ITEMS, STATUS_MASTER } from './data';
import { DEFAULT_DUNGEON_ID, dungeonOf } from './dungeons';
import { startExplore, step } from './explore';
import type { ExploreAction, ExploreState } from './exploreTypes';
import { ARMOR_BASES, itemProblems } from './itemMaster';
import { magicPower, weaponMagic } from './magic';
import { afflict, statusChance } from './status';
import { shelfItems } from './shop';
import type { EnemyDef, ItemId, PlayerStats, Result } from './types';
import itemsJson from './items.json';

const unwrap = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const act = (s: ExploreState, ...actions: ExploreAction[]) => actions.reduce((x, a) => unwrap(step(x, a)), s);
const wearing = (armor: ItemId | null): PlayerStats => ({ hp: 100, maxHp: 100, atk: 6, def: 0, mag: 0, poisonTurns: 0, weapon: null, armor, items: [], enchant: null });
const foe = (extra: Partial<EnemyDef> = {}): EnemyDef => ({ id: 'tester', name: '試し', hp: 10, atk: 5, def: 0, element: 'ice', body: 'normal', behaviors: ['chill', 'hunger'], ...extra });

const MASTER = JSON.parse(JSON.stringify(STATUS_MASTER)) as typeof STATUS_MASTER;
afterEach(() => {
  Object.assign(STATUS_MASTER.chill, MASTER.chill);
  Object.assign(STATUS_MASTER.hunger, MASTER.hunger);
});

describe('防具の種類', () => {
  it('鎧・法衣・毛皮の外套が、それぞれ10段階あり、店の防具の売り場に並ぶ', () => {
    expect([...ARMOR_BASES]).toEqual(['plate', 'robe', 'cloak']);
    for (const base of ARMOR_BASES) {
      expect(armorTypeOf(base)).toBe(base);
      expect(armorTypeOf(`${base}_10` as ItemId)).toBe(base);
    }
    expect(shelfItems([], 'armor')).toEqual(['plate', 'plate_2', 'robe', 'robe_2', 'cloak', 'cloak_2']);
    expect(armorTypeOf(null)).toBeNull();
    expect(armorTypeOf('sword')).toBeNull();
  });

  it('本物の設定でも、法衣は鎧より守りが低く魔力が上がり、外套の守りは鎧と法衣のあいだ（どの段階でも）', () => {
    expect(itemProblems(itemsJson)).toEqual([]);
    const { plate, robe, cloak } = itemsJson.armors;
    for (let i = 0; i < 10; i++) {
      expect(robe[i]!.def).toBeLessThanOrEqual(cloak[i]!.def);
      expect(cloak[i]!.def).toBeLessThanOrEqual(plate[i]!.def);
      expect(robe[i]!.mag).toBeGreaterThan(0);
      expect(plate[i]!.mag + cloak[i]!.mag).toBe(0);
    }
    expect(plate.reduce((a, t) => a + t.def, 0)).toBeGreaterThan(cloak.reduce((a, t) => a + t.def, 0));
  });

  it('守りは、どの防具でも装備すると上がる（段階ごとの設定のまま）', () => {
    for (const id of ['plate_3', 'robe_3', 'cloak_3'] as ItemId[]) {
      const e = ITEMS[id].effect;
      expect(e.kind).toBe('armor');
      if (e.kind === 'armor') expect(buildPlayer([id]).def - buildPlayer([]).def).toBe(e.def);
    }
  });

  it('魔力の欄が段階より低い・範囲の外なら、設定のまちがいとして見つかる', () => {
    const bad = JSON.parse(JSON.stringify(itemsJson));
    bad.armors.robe[3].mag = 0;
    expect(itemProblems(bad).some((p) => p.includes('魔力が3段目より低い'))).toBe(true);
    delete bad.armors.plate[0].mag;
    expect(itemProblems(bad).some((p) => p.includes('鎧の1段目：魔力は'))).toBe(true);
  });
});

describe('法衣', () => {
  const M = dungeonOf(DEFAULT_DUNGEON_ID).magic;

  it('魔法の強さに、法衣の魔力が足される（杖の倍率は、足したあとに掛かる）', () => {
    const robe = 'robe_5' as ItemId;
    const e = ITEMS[robe].effect;
    expect(armorMagic(robe)).toBe(e.kind === 'armor' ? e.mag : -1);
    expect(armorMagic(robe)).toBeGreaterThan(0);
    expect(magicPower(wearing(robe), M)).toBe(magicPower(wearing(null), M) + armorMagic(robe));
    expect(magicPower({ ...wearing(robe), weapon: 'staff' }, M)).toBeCloseTo((M.power + armorMagic(robe) + weaponMagic('staff')) * M.staffPower, 5);
    expect(armorMagic('plate_5')).toBe(0);
  });

  it('魔力が1回復するまでの行動数が短くなる（1行動より短くはならない）。ほかの防具では変わらない', () => {
    expect(regenInterval(10, 'robe')).toBe(Math.round(10 * ARMOR_CONFIG.robe.regenRate));
    expect(regenInterval(10, 'robe')).toBeLessThan(10);
    expect(regenInterval(1, 'robe')).toBe(1);
    expect(regenInterval(10, 'plate')).toBe(10);
    expect(regenInterval(10, 'cloak')).toBe(10);
    expect(regenInterval(10, null)).toBe(10);
  });

  it('探索で、法衣のほうが魔力が早く回復する', () => {
    const recovered = (armor: ItemId) => {
      let s = startExplore(3, { loadout: ['book_heal', armor] });
      s = { ...s, mp: 0, enemies: [] };
      s = act(s, ...Array.from({ length: 30 }, () => ({ kind: 'wait' }) as ExploreAction));
      return s.mp;
    };
    expect(recovered('robe')).toBeGreaterThan(recovered('plate'));
  });
});

describe('毛皮の外套', () => {
  it('鈍足にはかからない（確率が0）。ほかの状態異常の確率は変わらない', () => {
    STATUS_MASTER.chill.chance = 100;
    expect(statusChance(wearing('cloak'), foe(), 'chill')).toBe(0);
    expect(statusChance(wearing('plate'), foe(), 'chill')).toBe(1);
    expect(statusChance(wearing('cloak'), foe(), 'hunger')).toBe(statusChance(wearing('plate'), foe(), 'hunger'));
    expect(resistsChill('cloak_4')).toBe(true);
    expect(resistsChill('robe')).toBe(false);
  });

  it('空腹の攻撃で減る満腹度が少ない', () => {
    STATUS_MASTER.chill.chance = 100;
    STATUS_MASTER.hunger.chance = 100;
    STATUS_MASTER.hunger.amount = 10;
    const plain = afflict({ stats: wearing('plate'), satiety: 100, rngState: 1 }, foe());
    const warm = afflict({ stats: wearing('cloak'), satiety: 100, rngState: 1 }, foe());
    expect(plain.satiety).toBe(90);
    expect(warm.satiety).toBe(100 - hungerLoss(10, 'cloak'));
    expect(hungerLoss(10, 'cloak')).toBe(Math.round(10 * ARMOR_CONFIG.cloak.hungerRate));
    expect(hungerLoss(1, 'cloak')).toBe(1);
    expect(plain.stats.chillSteps).toBeGreaterThan(0);
    expect(warm.stats.chillSteps ?? 0).toBe(0);
  });

  it('探索で、満腹度の減りが遅い（行動のうち決まった割合は減らない）', () => {
    expect(armorSaving('cloak')).toBe(ARMOR_CONFIG.cloak.saving);
    expect(armorSaving('plate')).toBe(0);
    const spent = (armor: ItemId) => {
      let s = startExplore(3, { loadout: [armor] });
      s = { ...s, enemies: [] };
      const before = s.satiety;
      s = act(s, ...Array.from({ length: 40 }, () => ({ kind: 'wait' }) as ExploreAction));
      return before - s.satiety;
    };
    expect(spent('cloak')).toBeLessThan(spent('plate'));
    expect(spent('cloak')).toBeCloseTo(spent('plate') * (1 - ARMOR_CONFIG.cloak.saving / 100), 0);
  });

  it('霜の床から歩き出しても、足が重くならない（1歩が1ターン）', () => {
    const walk = (armor: ItemId) => {
      let s = startExplore(3, { loadout: [armor] });
      s = { ...s, enemies: [], fields: [{ kind: 'frost', pos: s.player, turns: 9 }] };
      const dirs = ['up', 'down', 'left', 'right'] as const;
      for (const dir of dirs) {
        const r = step(s, { kind: 'move', dir });
        if (r.ok && (r.value.player.x !== s.player.x || r.value.player.y !== s.player.y)) return r.value.turn - s.turn;
      }
      throw new Error('歩ける向きがない');
    };
    expect(walk('plate')).toBe(2);
    expect(walk('cloak')).toBe(1);
  });
});

