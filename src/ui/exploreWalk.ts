// タップで歩くときの行き先と、歩くときの判断に使う小さな関数。

import { key } from '../game/enemies';
import { upStairs } from '../game/explore';
import type { ExploreState } from '../game/exploreTypes';
import { canSee, visibleTiles } from '../game/exploreSight';
import type { Pos } from '../game/map';

/** タップ・クリックで向かっている先 */
export interface WalkGoal {
  pos: Pos;
  enemy: number | null; // 敵をタップしたときはその敵（動いても追いかける）
  stopOnSight?: boolean; // 歩き続けるときと同じく、敵が見えた・宝箱を見つけた・攻撃を受けたら立ち止まる（「階段へ」で歩くとき）
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

/** 壁にさえぎられずに見えている敵の番号（立ち止まるかどうかに使う。壁の向こうの敵では止まらない） */
export function sightedEnemyIds(state: ExploreState): Set<number> {
  return new Set(state.enemies.filter((e) => canSee(state.map, state.player, e.pos, state.sightRadius)).map((e) => e.uid));
}

/**
 * 歩き続けているとき（画面のなぞり・「階段へ」）に、立ち止まるわけ（2026-11-28）。止まらなければ null。
 * 壁にさえぎられずに新しい敵が見えた・まだ開けていない宝箱を初めて見つけた・攻撃を受けた、のどれか。
 * 方向キーの押しっぱなしでは止めない（自分で離せばすぐ止まるので）
 */
export function walkInterrupt(prev: ExploreState, next: ExploreState): string | null {
  if (next.map !== prev.map) return null; // 階を移ったときは、そのまま
  if (next.hits.some((h) => h.kind === 'taken')) return '攻撃を受けたので、立ち止まった';
  const before = sightedEnemyIds(prev);
  const now = sightedEnemyIds(next);
  for (const id of now) if (!before.has(id)) return '敵が見えたので、立ち止まった';
  const seenChest = (s: ExploreState, c: ExploreState['chests'][number]) => !c.opened && s.seen[c.pos.y * s.map.width + c.pos.x];
  if (next.chests.some((c, i) => seenChest(next, c) && !(prev.chests[i] && seenChest(prev, prev.chests[i]!)))) return '宝箱を見つけたので、立ち止まった';
  return null;
}
