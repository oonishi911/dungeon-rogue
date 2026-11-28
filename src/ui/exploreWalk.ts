// タップで歩くときの行き先と、歩くときの判断に使う小さな関数。

import { key } from '../game/enemies';
import { upStairs } from '../game/explore';
import type { ExploreState } from '../game/exploreTypes';
import { visibleTiles } from '../game/exploreSight';
import type { Pos } from '../game/map';

/** タップ・クリックで向かっている先 */
export interface WalkGoal {
  pos: Pos;
  enemy: number | null; // 敵をタップしたときはその敵（動いても追いかける）
  stairs?: boolean; // 「階段へ」で歩いているとき（ボタンを「止める」にする）
}

/** 見つけた下り階段の場所（まだ見ていない・足元にあるときは null）。「階段へ」で向かう先 */
export function knownStairs(state: ExploreState): Pos | null {
  const st = state.map.stairs;
  if (!st || !state.seen[st.y * state.map.width + st.x]) return null;
  if (st.x === state.player.x && st.y === state.player.y) return null;
  return st;
}

/** タップで歩くときに、できるだけ通らないマス。階段は踏むと階を移ってしまうので、行き先でなければ避ける（goal を渡すと、そのマスは避けない） */
export function avoidOnWalk(state: ExploreState, goal?: Pos): Set<string> {
  const up = upStairs(state);
  const avoid = new Set([state.map.stairs, up].filter((p): p is Pos => p !== null).map(key));
  if (goal) avoid.delete(key(goal));
  return avoid;
}

/** 今見えている敵の番号 */
export function visibleEnemyIds(state: ExploreState): Set<number> {
  const visible = visibleTiles(state.map, state.player, state.sightRadius);
  return new Set(state.enemies.filter((e) => visible.has(e.pos.y * state.map.width + e.pos.x)).map((e) => e.uid));
}

