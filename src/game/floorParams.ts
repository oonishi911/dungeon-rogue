// 階の広さ・満腹度など、探索の条件。
// 階の数・広さ・満腹度は、ダンジョンごとの設定（src/game/dungeons/*.json の floors。管理画面 ?view=admin の「階の数・広さ・満腹度」タブ）で決める。
// 満腹度は、広さや階の数からは計算しない（設定した値をそのまま使う）。敵の密度は、広さから決まる。数値は自動プレイで測って決めた（docs/dungeon-design.md の「階の広さと満腹度」を参照）。

import { ENEMY_CONFIG } from './enemies';
import type { FloorSettings } from './genMaster';

export const FLOOR_CONFIG = {
  referenceSize: 40, // 敵の密度の式の基準にした広さ（自動プレイで測った広さ）
} as const;

export interface FloorParams {
  mapSize: number;
  maxSatiety: number;
  enemyDensity: number;
}

/**
 * 探索の条件。floors は、遊ぶダンジョンの設定の、階の数と広さ・満腹度（管理画面の見本は、公開前の値を渡す）。
 * - 満腹度：設定（floors.satiety）の値そのまま。広さや階の数を変えても、自動では変わらない
 * - 敵の数：密度が一定だと面積に比例して増えすぎるので、広さに比例する程度に抑える
 */
export function floorParams(floors: FloorSettings): FloorParams {
  const mapSize = floors.size;
  const ratio = mapSize / FLOOR_CONFIG.referenceSize;
  return {
    mapSize,
    maxSatiety: floors.satiety,
    enemyDensity: ENEMY_CONFIG.density / ratio,
  };
}
