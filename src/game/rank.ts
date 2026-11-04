// ランク（強化）。踏破した経験と金貨を払って上げる。
// ランクが上がると満腹度の上限が増えるかわりに、ダンジョンも広くなり、報酬も良くなる。
// 数値は自動プレイで測って決めた（docs/dungeon-design.md の「ランク」を参照）。

import { ENEMY_CONFIG } from './enemies';
import { TREASURE_CONFIG } from './data';

export const RANK_CONFIG = {
  maxRank: 9, // 広さが上限の100×100になるランク
  baseSize: 20, // ランク1の広さ
  sizeStep: 10, // 1ランクごとに広くなるマス数
  referenceSize: 40, // 満腹度と敵の密度の式の基準にした広さ（自動プレイで測った広さ）
  regenInterval: 20, // 基準の広さでの、HPが1回復するまでのターン数
  costPerRank: 50, // 強化の費用＝これ×今のランク（G）
  expPerUpgrade: 1, // 強化に使う踏破経験
  goldBonusPerRank: 0.25, // 宝箱の金貨は、1ランクごとにこの割合ずつ増える
} as const;

export interface RankParams {
  rank: number;
  mapSize: number;
  maxSatiety: number;
  enemyDensity: number;
  chestGoldRate: number; // 宝箱の金貨の倍率
  bossGold: number;
  regenInterval: number; // 満腹度が残っていれば、このターン数ごとにHPが1回復する
}

/**
 * ランクごとの探索の条件。
 * - 満腹度：霧の中で踏破までに歩く距離はほぼ面積に比例する。40×40より広いと少し余分にかかるので、
 *   広さ²×max(1, 広さ/40)^0.3（40×40までは広さ²）
 * - 敵の数：密度が一定だと面積に比例して増えすぎるので、広さに比例する程度に抑える
 * - HPの回復：狭いマップは探索が短く回復する時間が足りないので、広さに合わせて速くする（regenIntervalFor）
 */
export function rankParams(rank: number): RankParams {
  const r = Math.min(RANK_CONFIG.maxRank, Math.max(1, Math.floor(rank)));
  const mapSize = RANK_CONFIG.baseSize + RANK_CONFIG.sizeStep * (r - 1);
  const ratio = mapSize / RANK_CONFIG.referenceSize;
  return {
    rank: r,
    mapSize,
    maxSatiety: Math.round(mapSize * mapSize * Math.pow(Math.max(1, ratio), 0.3)),
    enemyDensity: ENEMY_CONFIG.density / ratio,
    chestGoldRate: 1 + RANK_CONFIG.goldBonusPerRank * (r - 1),
    bossGold: TREASURE_CONFIG.bossGold * r,
    regenInterval: regenIntervalFor(mapSize),
  };
}

/** HPが1回復するまでのターン数。広さ÷2（基準の広さより広ければ基準のまま） */
export function regenIntervalFor(mapSize: number): number {
  return Math.min(RANK_CONFIG.regenInterval, Math.round((RANK_CONFIG.regenInterval * mapSize) / RANK_CONFIG.referenceSize));
}

/** 今のランクから1つ上げる費用 */
export function upgradeCost(rank: number): number {
  return RANK_CONFIG.costPerRank * rank;
}
