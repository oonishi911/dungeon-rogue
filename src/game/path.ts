// 一度見た通路を通る道探し。自動プレイAIと、タップ・クリックで目的地まで歩く操作で共通に使う。
// 霧に覆われた場所は通らないので、プレイヤーが知らない近道を使うことはない。

import { key } from './enemies';
import { type ExploreAction, type ExploreState } from './exploreTypes';
import { dirBetween, samePos } from './exploreSight';
import { DIRS, type Pos } from './map';

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
  // マスは番号（y × 幅 + x）で扱う。文字列の鍵で調べるより、広い階でずっと速い
  const { width, height, tiles } = map;
  const start = player.y * width + player.x;
  const parent = new Int32Array(width * height).fill(-1); // そのマスへ来る前のマス。-1 はまだ来ていない
  parent[start] = start;
  const queue = new Int32Array(width * height);
  queue[0] = start;
  let tail = 1;
  const hasAvoid = avoid.size > 0;
  for (let head = 0; head < tail; head++) {
    const at = queue[head]!;
    const x = at % width;
    const y = (at - x) / width;
    if (head > 0 && isGoal({ x, y })) {
      const path: Pos[] = [];
      for (let cur = at; cur !== start; cur = parent[cur]!) path.push({ x: cur % width, y: Math.floor(cur / width) });
      return path.reverse();
    }
    for (const d of DIRS) {
      const nx = x + d.x;
      const ny = y + d.y;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (parent[n] !== -1 || tiles[n] === 'wall' || !seen[n] || (hasAvoid && avoid.has(`${nx},${ny}`))) continue;
      parent[n] = at;
      queue[tail++] = n;
    }
  }
  return null;
}

/** target までの道。avoid のマスはできるだけ通らず、通らないと届かないときだけ通る。届かなければ null */
export function walkPath(state: ExploreState, target: Pos, avoid: ReadonlySet<string> = new Set()): Pos[] | null {
  const goal = (p: Pos) => samePos(p, target);
  const rest = new Set([...avoid].filter((k) => k !== key(target)));
  return (rest.size > 0 ? findPath(state, goal, rest) : null) ?? findPath(state, goal);
}

/**
 * タップ・クリックした場所へ向かう次の1歩。着いた・届かない・道の途中に敵がいるときは null（止まる）。
 * 勝手に攻撃しないよう、敵に向かって進むのは、その敵自身を目的地に選んだときだけ。
 * avoid のマスはできるだけ通らない（通らないと届かないときだけ通る）。
 */
export function walkToward(state: ExploreState, target: Pos, avoid: ReadonlySet<string> = new Set()): ExploreAction | null {
  if (state.outcome !== 'ongoing' || samePos(state.player, target)) return null;
  const path = walkPath(state, target, avoid);
  const next = path?.[0];
  if (!next) return null;
  const blocked = state.enemies.some((e) => samePos(e.pos, next)) && !samePos(next, target);
  if (blocked) return null;
  return { kind: 'move', dir: dirBetween(state.player, next) };
}
