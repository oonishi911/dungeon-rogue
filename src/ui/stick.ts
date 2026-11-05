// 仮想スティックの向きの決め方。画面に依存しない計算だけをここに置き、テストできるようにする。

import type { Dir } from '../game/explore';

export const STICK = {
  radius: 56, // スティックの土台の半径（px）。つまみはこれより外へは出ない
  deadzone: 0.25, // 中心からこの割合（半径に対して）より内側では歩かない
  dragStart: 12, // 指がこれ（px）より動いたらスティック、動かずに離したらタップとして扱う
  // 斜めとみなす範囲。小さいほうのずれが大きいほうのこの割合以上なら斜め（上下左右から30度より外れたら斜め）
  diagonal: Math.tan(Math.PI / 6),
} as const;

/**
 * 指を置いた点からのずれ（画面の y は下向き）で、進みたい向きの候補を決める。中心付近なら null。
 * まっすぐなら候補は1つ。斜めなら上下と左右の2つで、上下を先にする（両方進めるときは上下を優先する）
 */
export function stickDirections(dx: number, dy: number, radius: number = STICK.radius): Dir[] | null {
  if (Math.hypot(dx, dy) < radius * STICK.deadzone) return null;
  const vertical: Dir = dy > 0 ? 'down' : 'up';
  const horizontal: Dir = dx > 0 ? 'right' : 'left';
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.min(ax, ay) >= Math.max(ax, ay) * STICK.diagonal) return [vertical, horizontal];
  return [ax > ay ? horizontal : vertical];
}

/** 候補のうち、進めるいちばん最初の向き。どれも進めなければ最初の候補（壁なら「進めない」と知らせるため） */
export function chooseDirection(candidates: readonly Dir[], canMove: (dir: Dir) => boolean): Dir {
  return candidates.find(canMove) ?? candidates[0]!;
}

/** つまみの位置。土台の外へは出さない */
export function knobOffset(dx: number, dy: number, radius: number = STICK.radius): { x: number; y: number } {
  const d = Math.hypot(dx, dy);
  if (d <= radius) return { x: dx, y: dy };
  return { x: (dx / d) * radius, y: (dy / d) * radius };
}
