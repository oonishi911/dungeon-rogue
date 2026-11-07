import { memo, type ReactElement } from 'react';
import { CLOAKS, PALETTE, SPRITES, type SpriteId } from './data';

export type CloakColor = keyof typeof CLOAKS;

interface SpriteProps {
  id: SpriteId;
  /** 1ドットを何pxで描くか */
  scale?: number;
  /** 主人公のマントの色 */
  cloak?: CloakColor;
  /** 色の差し替え（ドット絵の文字ごとの色。敵の見た目に使う） */
  recolor?: Record<string, string>;
  label: string;
  className?: string;
}

/**
 * 文字列のドット絵をSVGで描く。
 * 横に同じ色が続く部分は1つの rect にまとめ、要素数を減らしている。
 */
export const Sprite = memo(function Sprite({ id, scale = 4, cloak = 'none', recolor, label, className }: SpriteProps) {
  const palette: Record<string, string> = { ...PALETTE, ...CLOAKS[cloak], ...recolor };
  const rows = SPRITES[id];
  const rects: ReactElement[] = [];

  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x]!;
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      const fill = palette[ch];
      if (fill) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={end - x} height={1} fill={fill} />);
      x = end;
    }
  });

  const size = rows.length * scale;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${rows.length} ${rows.length}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
    >
      {rects}
    </svg>
  );
});
