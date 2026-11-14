import { describe, expect, it } from 'vitest';
import { ENEMY_CONFIG } from './enemies';
import { FLOOR_CONFIG, floorParams, regenIntervalFor } from './floorParams';
import type { FloorSettings } from './genMaster';

// 関数を確かめるための、決まった中身の設定（管理画面で階の数・広さ・満腹度を変えても、こちらは変わらない）
const FLOORS: FloorSettings = { count: 3, size: 40, satiety: 1600 };

describe('floorParams', () => {
  it('20×20なら、敵の密度と回復の速さは基準（40×40）の2倍。満腹度は、設定の値そのまま', () => {
    expect(floorParams({ count: 3, size: 20, satiety: 400 })).toEqual({
      mapSize: 20,
      maxSatiety: 400,
      enemyDensity: ENEMY_CONFIG.density * 2,
      regenInterval: 10,
    });
  });

  it('基準の広さ（40×40）では、敵の密度と回復の速さが、自動プレイで測ったときの条件になる', () => {
    const p = floorParams(FLOORS);
    expect(p.mapSize).toBe(FLOOR_CONFIG.referenceSize);
    expect(p.maxSatiety).toBe(1600);
    expect(p.enemyDensity).toBe(ENEMY_CONFIG.density);
    expect(p.regenInterval).toBe(FLOOR_CONFIG.regenInterval);
  });

  it('満腹度は、広さや階の数を変えても、自動では変わらない', () => {
    const base = floorParams(FLOORS);
    expect(floorParams({ ...FLOORS, count: 6 }).maxSatiety).toBe(base.maxSatiety);
    expect(floorParams({ ...FLOORS, count: 1 }).maxSatiety).toBe(base.maxSatiety);
    expect(floorParams({ ...FLOORS, size: 50 }).maxSatiety).toBe(base.maxSatiety);
    // 広さ・敵の密度・回復の速さは、階の数では変わらない
    expect(floorParams({ ...FLOORS, count: 5 })).toEqual(base);
  });

  it('広くなるほど、敵の密度は下がる。回復の速さは基準の広さまで遅くなる', () => {
    let prev = floorParams({ ...FLOORS, size: 20 });
    for (const size of [30, 40, 60, 100]) {
      const p = floorParams({ ...FLOORS, size });
      expect(p.enemyDensity).toBeLessThan(prev.enemyDensity);
      expect(p.regenInterval).toBeGreaterThanOrEqual(prev.regenInterval);
      prev = p;
    }
  });
});

describe('regenIntervalFor', () => {
  it('広さに比例して遅くなり、基準の広さより広くても基準のまま', () => {
    expect(regenIntervalFor(20)).toBe(10);
    expect(regenIntervalFor(40)).toBe(20);
    expect(regenIntervalFor(100)).toBe(20);
  });
});
