import { describe, expect, it } from 'vitest';
import { floorVariant, pieceKind, pieceSource, TILESET, wallPieces, type PieceKind } from './autotile';

/** 3×3の並び（中央が対象のマス）から、隣が壁かどうかを返す関数を作る。# が壁 */
function around(rows: [string, string, string]) {
  return (dx: number, dy: number) => rows[1 + dy]![1 + dx] === '#';
}

const kinds = (rows: [string, string, string]): PieceKind[] =>
  wallPieces(around(rows)).map(({ q, src }) => {
    for (const k of ['outer', 'horizontal', 'vertical', 'inner', 'fill'] as const) {
      const s = pieceSource(k, q);
      if (s.x === src.x && s.y === src.y) return k;
    }
    throw new Error('部品が見つからない');
  });

describe('pieceKind', () => {
  it('横・縦・斜めのつながりで部品が決まる', () => {
    expect(pieceKind(false, false, false)).toBe('outer');
    expect(pieceKind(false, false, true)).toBe('outer'); // 斜めだけ壁でも、外角のまま
    expect(pieceKind(true, false, false)).toBe('horizontal');
    expect(pieceKind(false, true, false)).toBe('vertical');
    expect(pieceKind(true, true, false)).toBe('inner');
    expect(pieceKind(true, true, true)).toBe('fill');
  });
});

describe('wallPieces', () => {
  it('周りに壁がなければ、4隅とも外角', () => {
    expect(kinds(['...', '.#.', '...'])).toEqual(['outer', 'outer', 'outer', 'outer']);
  });

  it('周りがすべて壁なら、4つとも中央', () => {
    expect(kinds(['###', '###', '###'])).toEqual(['fill', 'fill', 'fill', 'fill']);
  });

  it('横に続く壁は、上下の辺になる', () => {
    expect(kinds(['...', '###', '...'])).toEqual(['horizontal', 'horizontal', 'horizontal', 'horizontal']);
  });

  it('縦に続く壁は、左右の辺になる', () => {
    expect(kinds(['.#.', '.#.', '.#.'])).toEqual(['vertical', 'vertical', 'vertical', 'vertical']);
  });

  it('斜めだけが床なら、その隅が内角になる', () => {
    // 左上だけが床
    expect(kinds(['.##', '###', '###'])).toEqual(['inner', 'fill', 'fill', 'fill']);
  });
});

describe('pieceSource', () => {
  it('部品はすべてひな形（64×96px）の中から、見本のマスを使わずに切り出す', () => {
    for (const k of ['outer', 'horizontal', 'vertical', 'inner', 'fill'] as const) {
      for (const q of [
        { sx: 0, sy: 0 },
        { sx: 1, sy: 0 },
        { sx: 0, sy: 1 },
        { sx: 1, sy: 1 },
      ] as const) {
        const s = pieceSource(k, q);
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x + 16).toBeLessThanOrEqual(64);
        expect(s.y + 16).toBeLessThanOrEqual(96);
        expect(s.x < 32 && s.y < 32).toBe(false); // 見本のマス
      }
    }
  });

  it('外角はかたまりの4隅から取る', () => {
    expect(pieceSource('outer', { sx: 0, sy: 0 })).toEqual({ x: 0, y: 32 });
    expect(pieceSource('outer', { sx: 1, sy: 1 })).toEqual({ x: 48, y: 80 });
  });
});

describe('floorVariant', () => {
  it('同じ場所はいつも同じ模様で、4種類がまんべんなく使われる', () => {
    expect(floorVariant(5, 7)).toBe(floorVariant(5, 7));
    const counts = [0, 0, 0, 0];
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) counts[floorVariant(x, y)]!++;
    for (const c of counts) expect(c).toBeGreaterThan(1600 / TILESET.floors.length / 2);
  });
});
