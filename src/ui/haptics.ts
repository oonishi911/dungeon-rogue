// 戦いの手応えを、スマホの振動で伝える。
// 振動の仕組み（navigator.vibrate）があるブラウザだけで震える：Android の Chrome などは震え、iPhone の Safari には仕組みがないので何も起きない。
// 震えなくても遊びには影響しない（画面の揺れ・数字・音で伝えている）

/** 振動の長さ（ミリ秒）。配列は「震える・止まる・震える…」の順 */
export const HAPTICS = {
  attack: 18, // 敵に攻撃を当てた（呪文の矢は、当たった瞬間）
  hurt: 45, // 敵から攻撃を受けた
  cleared: [40, 50, 40, 50, 120], // ボスを倒して踏破した
  defeated: [90, 60, 220], // 力尽きた
} as const;

/** 震わせる。振動の仕組みがない・許されていないときは、何もしない */
export function vibrate(pattern: number | readonly number[]) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern as number | number[]);
  } catch {
    // 震えなくても困らないので、何もしない
  }
}
