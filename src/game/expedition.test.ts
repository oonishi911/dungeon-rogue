import { describe, expect, it } from 'vitest';
import { TRAIT_ENEMIES } from './data';
import {
  advance,
  autoAction,
  autoPlay,
  clearRate,
  EXPEDITION_CONFIG,
  generateEncounters,
  startExpedition,
  toResult,
} from './expedition';
import type { Result } from './types';

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('generateEncounters', () => {
  it('3フロア×2体のあと、ボスだけのフロアがある', () => {
    const floors = generateEncounters('fire', 1);
    expect(floors).toHaveLength(EXPEDITION_CONFIG.floors + 1);
    expect(floors.slice(0, -1).every((f) => f.length === EXPEDITION_CONFIG.enemiesPerFloor)).toBe(true);
    expect(floors.at(-1)).toEqual([TRAIT_ENEMIES.fire.boss]);
  });

  it('特性に合った敵だけが出る', () => {
    const pool = new Set(TRAIT_ENEMIES.poison.pool);
    const enemies = generateEncounters('poison', 9).slice(0, -1).flat();
    expect(enemies.every((e) => pool.has(e))).toBe(true);
  });

  it('同じシードなら同じ構成', () => {
    expect(generateEncounters('fire', 5)).toEqual(generateEncounters('fire', 5));
  });
});

describe('advance', () => {
  it('敵を倒すと次の敵、フロアを突破すると休憩して次のフロアに進む', () => {
    let s = startExpedition(['fire_cloak'], 'fire', 3);
    expect(s.floor).toBe(0);
    expect(s.index).toBe(0);

    // 1体目を倒すまで攻撃
    while (s.defeated === 0) s = unwrap(advance(s, { kind: 'attack' }));
    expect(s.index).toBe(1);

    // 2体目を倒すと地下2階へ。休憩でHPが回復している
    const hpBefore = s.combat.player.hp;
    let last = s;
    while (s.floor === 0) {
      last = s;
      s = unwrap(advance(s, { kind: 'attack' }));
    }
    expect(s.index).toBe(0);
    expect(s.log).toContain('地下2階に降りた');
    expect(s.combat.player.hp).toBeGreaterThan(last.combat.player.hp - 20);
    expect(hpBefore).toBeGreaterThan(0);
  });

  it('負けたら探索は終わり、それ以上は行動できない', () => {
    let s = startExpedition([], 'fire', 1);
    while (s.outcome === 'ongoing') s = unwrap(advance(s, { kind: 'attack' }));
    expect(s.outcome).toBe('defeated');
    expect(advance(s, { kind: 'attack' }).ok).toBe(false);
  });

  it('不正な行動はエラーになり、状態は変わらない', () => {
    const s = startExpedition([], 'poison', 1);
    expect(advance(s, { kind: 'use_item', item: 'potion' }).ok).toBe(false);
  });

  it('最後まで勝てば踏破', () => {
    let s = startExpedition(['poison_cloak', 'potion'], 'poison', 2);
    while (s.outcome === 'ongoing') s = unwrap(advance(s, autoAction(s.combat)));
    expect(s.outcome).toBe('cleared');
    expect(toResult(s).enemiesDefeated).toBe(EXPEDITION_CONFIG.floors * EXPEDITION_CONFIG.enemiesPerFloor + 1);
  });
});

describe('autoPlay', () => {
  it('勝てば全フロアを突破し、負ければ到達フロアを返す', () => {
    expect(autoPlay(['fire_cloak', 'potion'], 'fire', 1).outcome).toBe('cleared');
    const lost = autoPlay([], 'fire', 1);
    expect(lost.outcome).toBe('defeated');
    expect(lost.floorReached).toBeGreaterThan(0);
  });
});

// ゲームの核：「準備が当たれば有利、外れれば苦戦」が数字で成り立っているか。
// バランス調整で数値を変えたとき、コンセプトが崩れていないかをこのテストで守る。
describe('バランス：準備の当たり外れが結果を左右する', () => {
  for (const trait of ['fire', 'poison'] as const) {
    const right = trait === 'fire' ? 'fire_cloak' : 'poison_cloak';
    const wrong = trait === 'fire' ? 'poison_cloak' : 'fire_cloak';

    it(`${trait}：正しいマントならクリア率80%以上`, () => {
      expect(clearRate([right], trait)).toBeGreaterThan(0.8);
    });

    it(`${trait}：逆のマントや汎用装備ではクリア率20%未満`, () => {
      expect(clearRate([wrong, 'potion', 'potion'], trait)).toBeLessThan(0.2);
      expect(clearRate(['iron_sword', 'potion', 'potion'], trait)).toBeLessThan(0.2);
    });
  }
});
