// 壁のオートタイル。1マスを16×16pxの4分の1マス4つに分け、それぞれ隣のマスのつながり方に合った部品を
// ひな形（64×96px）から選んで組み立てる。描く絵は少なくても、47通りのつながり方をすべて表せる。
//
// ひな形の配置（32pxのマス2×3個分）
//   (0,0) 見本：単独の壁。組み立てには使わない（素材を描く人の確認用）
//   (1,0) 内角：上下左右は壁で、斜めだけが床のときの角
//   (0,1)〜(1,2) 64×64pxのかたまり：外角・辺・中央。16pxの部品が4×4個並んでいるとみなす

export const QUARTER = 16;

/** 4分の1マスの位置。sx・sy は 0 が左・上、1 が右・下 */
export interface Quarter {
  sx: 0 | 1;
  sy: 0 | 1;
}

export type PieceKind = 'outer' | 'horizontal' | 'vertical' | 'inner' | 'fill';

/**
 * 4分の1マスに使う部品の種類。
 * 横の隣（左か右）・縦の隣（上か下）・斜めの隣が、それぞれ壁かどうかで決まる。
 *   - 横も縦も壁でない → 外角
 *   - 横だけ壁 → 上か下の辺（横に続く壁の縁）
 *   - 縦だけ壁 → 左か右の辺（縦に続く壁の縁）
 *   - 横も縦も壁で、斜めが壁でない → 内角
 *   - すべて壁 → 中央
 */
export function pieceKind(horizontal: boolean, vertical: boolean, diagonal: boolean): PieceKind {
  if (!horizontal && !vertical) return 'outer';
  if (horizontal && !vertical) return 'horizontal';
  if (!horizontal && vertical) return 'vertical';
  return diagonal ? 'fill' : 'inner';
}

/** 部品をひな形のどこから切り出すか（ひな形の左上からのピクセル位置） */
export function pieceSource(kind: PieceKind, q: Quarter): { x: number; y: number } {
  // 64×64pxのかたまりの中の、4×4個の部品の位置（列・行）
  const block = (col: number, row: number) => ({ x: col * QUARTER, y: 32 + row * QUARTER });
  // 左半分の部品はかたまりの左側から、右半分の部品は右側から取ると、模様の向きがそろう
  const edgeCol = q.sx === 0 ? 2 : 1;
  const edgeRow = q.sy === 0 ? 2 : 1;
  switch (kind) {
    case 'outer':
      return block(q.sx * 3, q.sy * 3);
    case 'horizontal':
      return block(edgeCol, q.sy * 3);
    case 'vertical':
      return block(q.sx * 3, edgeRow);
    case 'fill':
      return block(edgeCol, edgeRow);
    case 'inner':
      return { x: 32 + q.sx * QUARTER, y: q.sy * QUARTER };
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

/**
 * 1マスの壁を組み立てる4つの部品の切り出し位置。
 * isWall(dx, dy) は、隣のマスを壁として扱うか（マップの外や、まだ見ていないマスも壁として扱う）。
 */
export function wallPieces(isWall: (dx: number, dy: number) => boolean): { q: Quarter; src: { x: number; y: number } }[] {
  const quarters: Quarter[] = [
    { sx: 0, sy: 0 },
    { sx: 1, sy: 0 },
    { sx: 0, sy: 1 },
    { sx: 1, sy: 1 },
  ];
  return quarters.map((q) => {
    const dx = q.sx === 0 ? -1 : 1;
    const dy = q.sy === 0 ? -1 : 1;
    const kind = pieceKind(isWall(dx, 0), isWall(0, dy), isWall(dx, dy));
    return { q, src: pieceSource(kind, q) };
  });
}

/** タイルセット1枚（128×128px）の中の、各タイルの位置 */
export const TILESET = {
  size: 128,
  floors: [0, 1, 2, 3].map((i) => ({ x: i * 32, y: 0 })), // 床4種類
  wallTemplate: { x: 0, y: 32 }, // 壁のひな形（64×96px）の左上
  stairs: { x: 64, y: 32 },
  chest: { x: 96, y: 32 },
} as const;

/** 床の模様の選び方。マスの位置から決めるので、同じ場所はいつも同じ模様になる */
export function floorVariant(x: number, y: number): number {
  const h = Math.imul(x * 73856093 ^ y * 19349663, 0x9e3779b1) >>> 0;
  return h % TILESET.floors.length;
}
