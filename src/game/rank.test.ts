import { describe, expect, it } from 'vitest';
import { ENEMY_CONFIG } from './enemies';
import type { FloorSettings } from './genMaster';
import { RANK_CONFIG, rankParams, upgradeCost } from './rank';

// 関数を確かめるための、決まった中身の設定（管理画面で階の数・広さ・満腹度を変えても、こちらは変わらない）
const FLOORS: FloorSettings = {
  count: 3,
  sizes: [20, 30, 40, 50, 60, 70, 80, 90, 100],
  satiety: [400, 900, 1600, 2673, 4066, 5796, 7879, 10331, 13164],
};

describe('rankParams', () => {
  it('20×20なら、敵の密度と回復の速さは基準（40×40）の2倍。満腹度は、設定したランクの値そのまま', () => {
    expect(rankParams(1, FLOORS)).toEqual({
      rank: 1,
      mapSize: 20,
      maxSatiety: 400,
      enemyDensity: ENEMY_CONFIG.density * 2,
      chestGoldRate: 1,
      bossGold: 50,
      regenInterval: 10,
    });
  });

  it('基準の広さ（40×40）では、敵の密度と回復の速さが、自動プレイで測ったときの条件になる', () => {
    const p = rankParams(3, FLOORS);
    expect(p.mapSize).toBe(RANK_CONFIG.referenceSize);
    expect(p.maxSatiety).toBe(1600);
    expect(p.enemyDensity).toBe(ENEMY_CONFIG.density);
    expect(p.regenInterval).toBe(RANK_CONFIG.regenInterval);
  });

  it('広さと満腹度は、設定でランクごとに決めた値になる', () => {
    const floors: FloorSettings = { count: 3, sizes: [20, 20, 25, 40, 40, 60, 60, 80, 100], satiety: [500, 700, 700, 900, 3000, 1000, 8000, 8000, 50000] };
    floors.sizes.forEach((size, i) => expect(rankParams(i + 1, floors).mapSize).toBe(size));
    floors.satiety.forEach((satiety, i) => expect(rankParams(i + 1, floors).maxSatiety).toBe(satiety));
    // 同じ広さなら、敵の密度は同じ（満腹度は、同じ広さでもランクごとに別の値にできる。報酬はランクで増える）
    const a = rankParams(1, floors);
    const b = rankParams(2, floors);
    expect(b.enemyDensity).toBe(a.enemyDensity);
    expect(b.maxSatiety).not.toBe(a.maxSatiety);
    expect(b.chestGoldRate).toBeGreaterThan(a.chestGoldRate);
  });

  it('満腹度は、広さや階の数を変えても、自動では変わらない', () => {
    const base = rankParams(3, FLOORS);
    expect(rankParams(3, { ...FLOORS, count: 6 }).maxSatiety).toBe(base.maxSatiety);
    expect(rankParams(3, { ...FLOORS, count: 1 }).maxSatiety).toBe(base.maxSatiety);
    expect(rankParams(3, { ...FLOORS, sizes: FLOORS.sizes.map((s) => s + 10) }).maxSatiety).toBe(base.maxSatiety);
    // 広さ・敵の密度・報酬は、階の数では変わらない
    expect({ ...rankParams(3, { ...FLOORS, count: 5 }) }).toEqual(base);
  });

  it('広くなるほど、敵の密度は下がる。ランクが上がるほど、報酬が増える', () => {
    for (let r = 1; r < RANK_CONFIG.maxRank; r++) {
      const a = rankParams(r, FLOORS);
      const b = rankParams(r + 1, FLOORS);
      expect(b.mapSize).toBeGreaterThan(a.mapSize);
      expect(b.chestGoldRate).toBeGreaterThan(a.chestGoldRate);
      expect(b.bossGold).toBeGreaterThan(a.bossGold);
      expect(b.enemyDensity).toBeLessThan(a.enemyDensity);
      expect(b.regenInterval).toBeGreaterThanOrEqual(a.regenInterval);
    }
  });

  it('範囲外のランクは丸める', () => {
    expect(rankParams(99, FLOORS)).toEqual(rankParams(RANK_CONFIG.maxRank, FLOORS));
    expect(rankParams(0, FLOORS)).toEqual(rankParams(1, FLOORS));
  });

  it('強化の費用はランクに比例する', () => {
    expect(upgradeCost(1)).toBe(50);
    expect(upgradeCost(3)).toBe(150);
  });
});
