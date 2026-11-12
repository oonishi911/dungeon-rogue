import { describe, expect, it } from 'vitest';
import { ENEMY_CONFIG } from './enemies';
import { GEN_SETTINGS, type FloorSettings } from './genMaster';
import { RANK_CONFIG, rankParams, upgradeCost } from './rank';

// 関数を確かめるための、決まった中身の設定（管理画面で階の数や広さを変えても、こちらは変わらない）
const FLOORS: FloorSettings = { count: 3, sizes: [20, 30, 40, 50, 60, 70, 80, 90, 100] };

describe('rankParams', () => {
  it('20×20・階が3つなら、満腹度の上限は広さ²、敵の密度と回復の速さは基準（40×40）の2倍', () => {
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

  it('基準の広さ（40×40）では、自動プレイで測ったときの条件になる', () => {
    const p = rankParams(3, FLOORS);
    expect(p.mapSize).toBe(RANK_CONFIG.referenceSize);
    expect(p.maxSatiety).toBe(1600);
    expect(p.enemyDensity).toBe(ENEMY_CONFIG.density);
    expect(p.regenInterval).toBe(RANK_CONFIG.regenInterval);
  });

  it('広さは、設定でランクごとに決めた値になる', () => {
    const floors: FloorSettings = { count: 3, sizes: [20, 20, 25, 40, 40, 60, 60, 80, 100] };
    floors.sizes.forEach((size, i) => expect(rankParams(i + 1, floors).mapSize).toBe(size));
    // 同じ広さなら、満腹度の上限も敵の密度も同じ（報酬だけがランクで増える）
    const a = rankParams(1, floors);
    const b = rankParams(2, floors);
    expect(b.maxSatiety).toBe(a.maxSatiety);
    expect(b.enemyDensity).toBe(a.enemyDensity);
    expect(b.chestGoldRate).toBeGreaterThan(a.chestGoldRate);
  });

  it('満腹度の上限は、階の数に比例する（階が3つのときが基準）', () => {
    expect(rankParams(1, { ...FLOORS, count: 6 }).maxSatiety).toBe(800);
    expect(rankParams(1, { ...FLOORS, count: 1 }).maxSatiety).toBe(133);
    // 広さ・敵の密度・報酬は、階の数では変わらない
    expect({ ...rankParams(3, { ...FLOORS, count: 5 }), maxSatiety: 0 }).toEqual({ ...rankParams(3, FLOORS), maxSatiety: 0 });
  });

  it('広くなるほど、満腹度の上限が増え、敵の密度は下がる。ランクが上がるほど、報酬が増える', () => {
    for (let r = 1; r < RANK_CONFIG.maxRank; r++) {
      const a = rankParams(r, FLOORS);
      const b = rankParams(r + 1, FLOORS);
      expect(b.mapSize).toBeGreaterThan(a.mapSize);
      expect(b.maxSatiety).toBeGreaterThan(a.maxSatiety);
      expect(b.chestGoldRate).toBeGreaterThan(a.chestGoldRate);
      expect(b.bossGold).toBeGreaterThan(a.bossGold);
      expect(b.enemyDensity).toBeLessThan(a.enemyDensity);
      expect(b.regenInterval).toBeGreaterThanOrEqual(a.regenInterval);
    }
  });

  it('範囲外のランクは丸める。設定を渡さなければ、ゲームの設定（dungeonGen.json）を使う', () => {
    expect(rankParams(99, FLOORS)).toEqual(rankParams(RANK_CONFIG.maxRank, FLOORS));
    expect(rankParams(0, FLOORS)).toEqual(rankParams(1, FLOORS));
    expect(rankParams(2)).toEqual(rankParams(2, GEN_SETTINGS.floors));
  });

  it('強化の費用はランクに比例する', () => {
    expect(upgradeCost(1)).toBe(50);
    expect(upgradeCost(3)).toBe(150);
  });
});
