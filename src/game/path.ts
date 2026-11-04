// 一度見た通路を通る道探し。自動プレイAIと、タップ・クリックで目的地まで歩く操作で共通に使う。
// 霧に覆われた場所は通らないので、プレイヤーが知らない近道を使うことはない。

import { key } from './enemies';
import { dirBetween, samePos, type ExploreAction, type ExploreState } from './explore';
import { tileAt, type Pos } from './map';

export const DIRS: readonly Pos[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/**
 * 一度見た通路だけを通って、isGoal を満たす最も近いマスへ向かう最短路。
 * 返す道は今いるマスを含まず、目的のマスを含む。届かなければ null。
 * avoid のマスは通らない。敵のいるマスは通れる扱い（ぶつかれば攻撃になる）。
 */
export function findPath(
  state: ExploreState,
  isGoal: (p: Pos) => boolean,
  avoid: ReadonlySet<string> = new Set(),
): Pos[] | null {
  const { map, player, seen } = state;
  const start = key(player);
  const parent = new Map<string, string>([[start, '']]);
  const queue: Pos[] = [player];
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head]!;
    if (head > 0 && isGoal(p)) {
      const path: Pos[] = [];
      for (let cur = key(p); cur !== start; cur = parent.get(cur)!) {
        const [x, y] = cur.split(',').map(Number);
        path.push({ x: x!, y: y! });
      }
      return path.reverse();
    }
    for (const d of DIRS) {
      const n = { x: p.x + d.x, y: p.y + d.y };
      const k = key(n);
      if (parent.has(k) || avoid.has(k) || tileAt(map, n) === 'wall' || !seen[n.y * map.width + n.x]) continue;
      parent.set(k, key(p));
      queue.push(n);
    }
  }
  return null;
}

/**
 * タップ・クリックした場所へ向かう次の1歩。着いた・届かない・道の途中に敵がいるときは null（止まる）。
 * 勝手に攻撃しないよう、敵に向かって進むのは、その敵自身を目的地に選んだときだけ。
 */
export function walkToward(state: ExploreState, target: Pos): ExploreAction | null {
  if (state.outcome !== 'ongoing' || samePos(state.player, target)) return null;
  const path = findPath(state, (p) => samePos(p, target));
  const next = path?.[0];
  if (!next) return null;
  const blocked = state.enemies.some((e) => samePos(e.pos, next)) && !samePos(next, target);
  if (blocked) return null;
  return { kind: 'move', dir: dirBetween(state.player, next) };
}
