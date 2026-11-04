import { PALETTE, SPRITES, type SpriteId } from './data';

/**
 * 文字列のドット絵を Canvas に描く（マップのように多数のマスを描く画面用）。
 * Sprite.tsx と同じく、横に同じ色が続く部分は1回の fillRect にまとめる。
 * colors で PALETTE の色を差し替えられる（マントの色、敵の色違い）。
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  id: SpriteId,
  x: number,
  y: number,
  size: number,
  colors: Record<string, string> = {},
) {
  const palette: Record<string, string> = { ...PALETTE, ...colors };
  const rows = SPRITES[id];
  const dot = size / rows.length;
  rows.forEach((row, py) => {
    let px = 0;
    while (px < row.length) {
      const ch = row[px]!;
      let end = px + 1;
      while (end < row.length && row[end] === ch) end++;
      const fill = palette[ch];
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(x + px * dot, y + py * dot, (end - px) * dot, dot);
      }
      px = end;
    }
  });
}
