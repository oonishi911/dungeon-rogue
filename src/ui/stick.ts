// 仮想スティックの向きの決め方。画面に依存しない計算だけをここに置き、テストできるようにする。

import type { Dir } from '../game/explore';

export const STICK = {
  radius: 56, // スティックの土台の半径（px）。つまみはこれより外へは出ない
  deadzone: 0.25, // 中心からこの割合（半径に対して）より内側では歩かない
  dragStart: 12, // 指がこれ（px）より動いたらスティック、動かずに離したらタップとして扱う
} as const;

/** 指を置いた点からのずれ（画面の y は下向き）で、向きを決める。中心付近なら null */
export function stickDirection(dx: number, dy: number, radius: number = STICK.radius): Dir | null {
  if (Math.hypot(dx, dy) < radius * STICK.deadzone) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/** つまみの位置。土台の外へは出さない */
export function knobOffset(dx: number, dy: number, radius: number = STICK.radius): { x: number; y: number } {
  const d = Math.hypot(dx, dy);
  if (d <= radius) return { x: dx, y: dy };
  return { x: (dx / d) * radius, y: (dy / d) * radius };
}
