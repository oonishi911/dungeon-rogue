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
}

/** タップで歩くときに、できるだけ通らないマス。階段は踏むと階を移ってしまうので、行き先でなければ避ける */
export function avoidOnWalk(state: ExploreState): Set<string> {
  const up = upStairs(state);
  return new Set([state.map.stairs, up].filter((p): p is Pos => p !== null).map(key));
}

/** 今見えている敵の番号 */
export function visibleEnemyIds(state: ExploreState): Set<number> {
  const visible = visibleTiles(state.map, state.player, state.sightRadius);
  return new Set(state.enemies.filter((e) => visible.has(e.pos.y * state.map.width + e.pos.x)).map((e) => e.uid));
}

/**
 * 歩き続けているとき（方向キーの押しっぱなし・画面のなぞり）に、立ち止まるわけ（2026-11-28）。止まらなければ null。
 * 新しい敵が見えた・まだ開けていない宝箱を初めて見つけた・攻撃を受けた、のどれか
 */
export function walkInterrupt(prev: ExploreState, next: ExploreState): string | null {
  if (next.map !== prev.map) return null; // 階を移ったときは、そのまま
  if (next.hits.some((h) => h.kind === 'taken')) return '攻撃を受けたので、立ち止まった';
  const before = visibleEnemyIds(prev);
  const now = visibleEnemyIds(next);
  for (const id of now) if (!before.has(id)) return '敵が見えたので、立ち止まった';
  const seenChest = (s: ExploreState, c: ExploreState['chests'][number]) => !c.opened && s.seen[c.pos.y * s.map.width + c.pos.x];
  if (next.chests.some((c, i) => seenChest(next, c) && !(prev.chests[i] && seenChest(prev, prev.chests[i]!)))) return '宝箱を見つけたので、立ち止まった';
  return null;
}
