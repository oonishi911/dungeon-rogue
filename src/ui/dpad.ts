// 十字キーの向きの決め方。画面に依存しない計算だけをここに置き、テストできるようにする。

import type { Dir } from '../game/explore';

export const PAD_DEADZONE = 0.22; // 中心からこの割合（パッドの半径に対して）より内側では歩かない

/** パッドの中心からの指の位置（画面の y は下向き）で、向きを決める。中心付近なら null */
export function padDirection(dx: number, dy: number, radius: number): Dir | null {
  if (Math.hypot(dx, dy) < radius * PAD_DEADZONE) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}
