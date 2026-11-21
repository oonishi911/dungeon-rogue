// 記憶の動く場面の canvas を描く部品の、共通の形（docs/memory-movie.md）。描き方は場面の型ごと：flamePainter.ts・icePainter.ts。
// MemoryMovie.tsx が、1つの時計で、毎フレーム frame を呼ぶ。

/** 書いては消した言葉の場所（canvas の左上から px） */
export interface WordBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** 1フレームぶんの情報 */
export interface PaintFrame {
  t: number; // 場面の時刻（秒）
  dt: number; // 前のフレームからの秒
  w: number; // canvas の幅（px）
  h: number; // canvas の高さ（px）
  wordBox: () => WordBox | null; // 書いては消した言葉の場所を測る（測るのは重いので、要るときだけ呼ぶ）
}

export interface Painter {
  frame(f: PaintFrame): void;
}

/** やわらかい光の粒の絵（炎・煙・もや）。はじめに1度だけ描いておく（毎フレーム、グラデーションを作らない） */
export function sprite(stops: readonly (readonly [number, string])[], size = 64): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (g) {
    const r = size / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    for (const [k, color] of stops) grad.addColorStop(k, color);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  return c;
}

/** 四方から迫る暗さ（闇）や白さ（霜のもや）：画面の真ん中より少し上を中心に、amount が大きいほど、内側まで迫る */
export function fillEnclose(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, rgb: string, maxAlpha: number) {
  if (amount <= 0.005) return;
  const outer = Math.hypot(w, h) * 0.62 * (1 - 0.62 * amount);
  const grad = ctx.createRadialGradient(w / 2, h * 0.42, outer * 0.28, w / 2, h * 0.42, outer);
  grad.addColorStop(0, `rgba(${rgb}, 0)`);
  grad.addColorStop(1, `rgba(${rgb}, ${Math.min(maxAlpha, amount * 1.35).toFixed(3)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}
