import { describe, expect, it } from 'vitest';
import { ENEMY_CONFIG } from './enemies';
import { RANK_CONFIG, rankParams, upgradeCost } from './rank';

describe('rankParams', () => {
  it('ランク1は今までの探索と同じ条件', () => {
    expect(rankParams(1)).toEqual({
      rank: 1,
      mapSize: 40,
      maxSatiety: 1600,
      enemyDensity: ENEMY_CONFIG.density,
      chestGoldRate: 1,
      bossGold: 50,
    });
  });

  it('ランクが上がるほど広く、満腹度の上限と報酬が増え、敵の密度は下がる', () => {
    for (let r = 1; r < RANK_CONFIG.maxRank; r++) {
      const a = rankParams(r);
      const b = rankParams(r + 1);
      expect(b.mapSize).toBe(a.mapSize + RANK_CONFIG.sizeStep);
      expect(b.maxSatiety).toBeGreaterThan(a.maxSatiety);
      expect(b.chestGoldRate).toBeGreaterThan(a.chestGoldRate);
      expect(b.bossGold).toBeGreaterThan(a.bossGold);
      expect(b.enemyDensity).toBeLessThan(a.enemyDensity);
    }
  });

  it('最高ランクで広さは100×100。範囲外のランクは丸める', () => {
    expect(rankParams(RANK_CONFIG.maxRank).mapSize).toBe(100);
    expect(rankParams(99)).toEqual(rankParams(RANK_CONFIG.maxRank));
    expect(rankParams(0)).toEqual(rankParams(1));
  });

  it('強化の費用はランクに比例する', () => {
    expect(upgradeCost(1)).toBe(50);
    expect(upgradeCost(3)).toBe(150);
  });
});
