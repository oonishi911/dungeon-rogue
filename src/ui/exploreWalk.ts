// タップで歩くときの行き先と、歩くときの判断に使う小さな関数。

import { key } from '../game/enemies';
import { upStairs } from '../game/explore';
import { EXPLORE_CONFIG, type ExploreState } from '../game/exploreTypes';
import { visibleTiles } from '../game/exploreSight';
import type { Pos } from '../game/map';

/** タップ・クリックで向かっている先 */
export interface WalkGoal {
  pos: Pos;
  enemy: number | null; // 敵をタップしたときはその敵（動いても追いかける）
  seenEnemies: Set<number>; // 前の1歩のときに見えていた敵。新しく敵が見えたら立ち止まる
}

/** タップで歩くときに、できるだけ通らないマス。階段は踏むと階を移ってしまうので、行き先でなければ避ける */
export function avoidOnWalk(state: ExploreState): Set<string> {
  const up = upStairs(state);
  return new Set([state.map.stairs, up].filter((p): p is Pos => p !== null).map(key));
}

/** 今見えている敵の番号 */
export function visibleEnemyIds(state: ExploreState): Set<number> {
  const visible = visibleTiles(state.map, state.player, EXPLORE_CONFIG.sightRadius);
  return new Set(state.enemies.filter((e) => visible.has(e.pos.y * state.map.width + e.pos.x)).map((e) => e.uid));
}
