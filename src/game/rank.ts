// ランク（強化）。踏破した経験と金貨を払って上げる。
// ランクが上がると、ダンジョンが広くなり、報酬も良くなる。
// ランクごとの階の広さ・満腹度と、階の数は、ダンジョンごとの設定（src/game/dungeons/*.json の floors。管理画面 ?view=admin の「階の数・広さ・満腹度」タブ）で決める。
// 満腹度は、広さや階の数からは計算しない（設定した値をそのまま使う）。敵の密度と回復の速さは、広さから決まる。数値は自動プレイで測って決めた（docs/dungeon-design.md の「ランク」を参照）。

import { ENEMY_CONFIG } from './enemies';
import { TREASURE_CONFIG } from './data';
import { RANK_COUNT, type FloorSettings } from './genMaster';

export const RANK_CONFIG = {
  maxRank: RANK_COUNT, // 最高のランク
  referenceSize: 40, // 敵の密度と回復の速さの式の基準にした広さ（自動プレイで測った広さ）
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
 * ランクごとの探索の条件。floors は、遊ぶダンジョンの設定の、階の数とランクごとの広さ・満腹度（管理画面の見本は、公開前の値を渡す）。
 * - 満腹度：設定（floors.satiety）のランクの値そのまま。広さや階の数を変えても、自動では変わらない
 * - 敵の数：密度が一定だと面積に比例して増えすぎるので、広さに比例する程度に抑える
 * - HPの回復：狭いマップは探索が短く回復する時間が足りないので、広さに合わせて速くする（regenIntervalFor）
 */
export function rankParams(rank: number, floors: FloorSettings): RankParams {
  const r = Math.min(RANK_CONFIG.maxRank, Math.max(1, Math.floor(rank)));
  const mapSize = floors.sizes[r - 1]!;
  const ratio = mapSize / RANK_CONFIG.referenceSize;
  return {
    rank: r,
    mapSize,
    maxSatiety: floors.satiety[r - 1]!,
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
