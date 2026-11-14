// 視界の計算：見えるマス・見通し・向き。マップと位置だけで決まり、探索の状態は使わない。

import { DIR_DELTA, type Dir } from './exploreTypes';
import { tileAt, type FloorMap, type Pos } from './map';

/**
 * 主人公の視界：from から半径 radius 以内のマスの番号。壁にさえぎられず、壁の向こうや曲がり角の先も見える。
 * 敵の視界は canSee で、こちらは今までどおり壁にさえぎられる。
 */
export function visibleTiles(map: FloorMap, from: Pos, radius: number): Set<number> {
  const result = new Set<number>();
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = from.x + dx;
      const y = from.y + dy;
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      // 主人公の視界は壁にさえぎられない（壁の向こう・曲がり角の先も、半径以内ならすべて見える）
      if (dx * dx + dy * dy <= radius * radius) result.add(y * map.width + x);
    }
  }
  return result;
}

/** from から to が見えるか（半径以内で、間に壁がない） */
export function canSee(map: FloorMap, from: Pos, to: Pos, radius: number): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return dx * dx + dy * dy <= radius * radius && lineIsClear(map, from, to);
}

function lineIsClear(map: FloorMap, from: Pos, to: Pos): boolean {
  const dx = Math.abs(to.x - from.x);
  const dy = -Math.abs(to.y - from.y);
  const sx = from.x < to.x ? 1 : -1;
  const sy = from.y < to.y ? 1 : -1;
  let error = dx + dy;
  let x = from.x;
  let y = from.y;
  while (x !== to.x || y !== to.y) {
    // 始点は自分の位置なので調べない。終点は壁でも見える
    if ((x !== from.x || y !== from.y) && tileAt(map, { x, y }) === 'wall') return false;
    const e2 = 2 * error;
    if (e2 >= dy) {
      error += dy;
      x += sx;
    }
    if (e2 <= dx) {
      error += dx;
      y += sy;
    }
  }
  return true;
}

export function samePos(a: Pos, b: Pos): boolean {
  return a.x === b.x && a.y === b.y;
}

/** 隣り合う2マスの向き */
export function dirBetween(from: Pos, to: Pos): Dir {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dir = (Object.keys(DIR_DELTA) as Dir[]).find((d) => DIR_DELTA[d].x === dx && DIR_DELTA[d].y === dy);
  if (!dir) throw new Error('隣り合っていないマスです');
  return dir;
}
