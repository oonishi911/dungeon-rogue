import { CLOAKS, PALETTE, SPRITES, type SpriteId } from './data';

/**
 * 文字列のドット絵を Canvas に描く（マップのように多数のマスを描く画面用）。
 * Sprite.tsx と同じく、横に同じ色が続く部分は1回の fillRect にまとめる。
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  id: SpriteId,
  x: number,
  y: number,
  size: number,
  cloak: keyof typeof CLOAKS = 'none',
) {
  const palette: Record<string, string> = { ...PALETTE, ...CLOAKS[cloak] };
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
