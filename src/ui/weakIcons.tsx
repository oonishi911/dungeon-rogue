// 弱点のアイコン（docs/enemy-weakness.md）：色の丸に、白い絵。敵の頭上の印（explore3d.ts、canvas に描く）と、
// 敵の図鑑（BestiaryScreen.tsx、SVG で描く）で、同じ形を使う。形は 24×24 の枠で決め、丸の中に縮めて置く。
// 武器は灰色の丸、属性はその属性の色、魔法は紫、物理は琥珀色

import type { WeakIconId } from '../game/weakness';

/** 形の1つ。fill は塗り、stroke は線（太さ width）。'bg' は丸の色（白い絵に、丸の色で筋を入れる） */
interface Shape {
  d: string;
  fill?: 'white' | 'bg';
  stroke?: 'white' | 'bg';
  width?: number;
}

export const WEAK_ICON_WHITE = '#fff8ea';

/** 丸の色 */
export const WEAK_ICON_COLORS: Record<WeakIconId, string> = {
  sword: '#6f7c78',
  hammer: '#6f7c78',
  staff: '#6f7c78',
  fire: '#d9653b',
  ice: '#3d8fbf',
  light: '#c9a432',
  dark: '#6a4b9a',
  magic: '#7d5fc0',
  physical: '#b8862f',
};

/** 絵の形（24×24 の枠）。店のアイコン（ItemIcon.tsx）の形を、白1色で読めるように簡単にしたもの */
const SHAPES: Record<WeakIconId, Shape[]> = {
  sword: [
    { d: 'M19.5 3.5 20.5 4.5 10 15 9 14z', fill: 'white' },
    { d: 'M6.5 13.5l4 4', stroke: 'white', width: 2.4 },
    { d: 'M8.5 15.5 4 20', stroke: 'white', width: 2.8 },
  ],
  hammer: [
    { d: 'M15 9 4 20', stroke: 'white', width: 2.8 },
    { d: 'M13.73 2.49 21.51 10.27 17.27 14.51 9.49 6.73z', fill: 'white' },
  ],
  staff: [
    { d: 'M15 9 5 21', stroke: 'white', width: 2.6 },
    { d: 'M20.8 7a3.8 3.8 0 1 1-7.6 0a3.8 3.8 0 1 1 7.6 0z', fill: 'white' },
  ],
  fire: [{ d: 'M12 3c3 4 6 6.2 6 10.4A6 6 0 0 1 6 13.4c0-2.6 1.4-4.4 2.9-5.6.1 2.1 1 3.4 2.3 3.6-.5-3 .1-5.6.8-8.4z', fill: 'white' }],
  ice: [
    { d: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9', stroke: 'white', width: 2 },
    { d: 'M9.6 4.6 12 6.8l2.4-2.2M9.6 19.4 12 17.2l2.4 2.2', stroke: 'white', width: 1.6 },
  ],
  light: [{ d: 'M12 2.5 13.9 10.1 21.5 12l-7.6 1.9L12 21.5l-1.9-7.6L2.5 12l7.6-1.9z', fill: 'white' }],
  dark: [{ d: 'M14.5 3.2A9 9 0 1 0 20.8 15 7.2 7.2 0 0 1 14.5 3.2z', fill: 'white' }],
  magic: [
    { d: 'M20.5 12a8.5 8.5 0 1 1-17 0a8.5 8.5 0 1 1 17 0z', stroke: 'white', width: 1.8 },
    { d: 'M12 5.5l1.9 4.2 4.6.5-3.4 3.1 1 4.5L12 15.5l-4.1 2.3 1-4.5-3.4-3.1 4.6-.5z', fill: 'white' },
  ],
  physical: [
    {
      d: 'M6.5 10.5V8.2a1.6 1.6 0 0 1 3.2 0V7a1.6 1.6 0 0 1 3.2 0v.4a1.6 1.6 0 0 1 3.2 0v1a1.6 1.6 0 0 1 3.2 0V14a6 6 0 0 1-6 6h-1.4A5.4 5.4 0 0 1 5.5 14.6V12a1.5 1.5 0 0 1 1-1.5z',
      fill: 'white',
    },
    { d: 'M9.7 8.2v3M12.9 7.4v3.6M16.1 8.4v3', stroke: 'bg', width: 1.1 },
  ],
};

/** 丸の中に絵を置く縮め方（24×24 の枠の中心に、0.7倍） */
const INNER = { offset: 3.6, scale: 0.7 };

const paint = (id: WeakIconId, c: 'white' | 'bg') => (c === 'white' ? WEAK_ICON_WHITE : WEAK_ICON_COLORS[id]);

/** canvas に、左上 (x, y)・一辺 size の弱点のアイコンを描く（敵の頭上の札） */
export function drawWeakIcon(ctx: CanvasRenderingContext2D, id: WeakIconId, x: number, y: number, size: number): void {
  const k = size / 24;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.fillStyle = WEAK_ICON_COLORS[id];
  ctx.beginPath();
  ctx.arc(12, 12, 11.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(INNER.offset, INNER.offset);
  ctx.scale(INNER.scale, INNER.scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of SHAPES[id]) {
    const path = new Path2D(s.d);
    if (s.fill) {
      ctx.fillStyle = paint(id, s.fill);
      ctx.fill(path);
    }
    if (s.stroke) {
      ctx.strokeStyle = paint(id, s.stroke);
      ctx.lineWidth = s.width ?? 2;
      ctx.stroke(path);
    }
  }
  ctx.restore();
}

/** 弱点のアイコン（SVG。読み上げでは読まない。意味は、となりの文字で伝える） */
export function WeakIcon({ id, className }: { id: WeakIconId; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="11.5" fill={WEAK_ICON_COLORS[id]} />
      <g transform={`translate(${INNER.offset} ${INNER.offset}) scale(${INNER.scale})`} strokeLinecap="round" strokeLinejoin="round">
        {SHAPES[id].map((s, i) => (
          <path key={i} d={s.d} fill={s.fill ? paint(id, s.fill) : 'none'} stroke={s.stroke ? paint(id, s.stroke) : undefined} strokeWidth={s.stroke ? (s.width ?? 2) : undefined} />
        ))}
      </g>
    </svg>
  );
}
