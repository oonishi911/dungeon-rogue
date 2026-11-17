// 記憶の画面の「書きなぐった文字」を決める（見た目の数値だけ。同じ記憶は、いつも同じ荒れ方になる）。
// 一文字ずつ傾き・ずれ・大きさを変え、半分ほどの文字は上から書き直す（重ね書き）。
// 書いては消した言葉（取り消し線）と、黒く塗りつぶした帯を、文章のあいだにはさむ。

import { nextRandom } from '../game/rng';

export const SCRAWL_CONFIG = {
  rot: 9, // 文字の傾き（度。±）
  dx: 0.09, // 横のずれ（文字の幅に対する割合。±）
  dy: 0.16, // 縦のずれ（±）
  size: [0.88, 1.38] as const, // 文字の大きさ（ふつうの文字に対する倍率）
  overwrite: 0.55, // 上から書き直す文字の割合（ずれた文字が、もう1つ重なる）
  tilt: 2.4, // 1行の傾き（度。±）
  shift: 6, // 1行の横のずれ（%。±）
  black: [0.35, 0.8] as const, // 塗りつぶしの帯の長さ（幅に対する割合）
  strikeZigzag: 7, // 取り消し線の折り返しの数
  // 文字を「絵」に変える墨の加工（SVG のフィルタ。字の輪郭を揺らし、かすれをつくる）
  ink: {
    warpFreq: 0.04, // 輪郭を揺らす波の細かさ（大きいほど細かく揺れる）
    warpScale: 5, // 輪郭の揺れの大きさ（px）
    grainX: 0.06, // かすれの筋の、横方向の細かさ（小さいほど、横に長い筋になる）
    grainY: 0.45, // かすれの筋の、縦方向の細かさ
    grainCut: 0.3, // かすれの量（大きいほど、欠けが増える）
  },
} as const;

/** 墨の加工をつけた SVG フィルタの ID */
export const INK_FILTER = 'scrawl-ink';

export interface Glyph {
  ch: string;
  rot: number; // 度
  dx: number; // em
  dy: number; // em
  size: number; // 倍率
  over: { rot: number; dx: number; dy: number } | null; // 重ね書き（なければ null）
}

export type ScrawlItem =
  | { kind: 'line'; glyphs: Glyph[]; tilt: number; shift: number }
  | { kind: 'crossed'; glyphs: Glyph[]; tilt: number; shift: number; zig: number[] } // 書いたあと、ぐちゃぐちゃに消した言葉。zig：取り消し線の上下（0〜1）
  | { kind: 'black'; width: number; tilt: number; shift: number; shape: number[] }; // 塗りつぶし。shape：帯の縁のがたつき（%）

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** 同じシードから、順に乱数を取り出す */
function rngOf(seed: string): { next: () => number; range: (lo: number, hi: number) => number; sign: (m: number) => number } {
  let state = hash(seed);
  const next = () => {
    const step = nextRandom(state);
    state = step.state;
    return step.value;
  };
  return { next, range: (lo, hi) => lo + (hi - lo) * next(), sign: (m) => (next() * 2 - 1) * m };
}

type Rng = ReturnType<typeof rngOf>;

function glyphsOf(text: string, r: Rng): Glyph[] {
  const c = SCRAWL_CONFIG;
  return [...text].map((ch) => ({
    ch,
    rot: r.sign(c.rot),
    dx: r.sign(c.dx),
    dy: r.sign(c.dy),
    size: r.range(c.size[0], c.size[1]),
    over: r.next() < c.overwrite ? { rot: r.sign(c.rot * 1.6), dx: r.sign(c.dx * 2.5), dy: r.sign(c.dy * 2) } : null,
  }));
}

/**
 * 記憶の文章を、書きなぐった画面の部品に並べる。
 * 1行目のあとに「書いては消した言葉」、行のあいだと最後に「塗りつぶしの帯」を入れる
 */
export function scrawl(lines: readonly string[], crossed: string, seed: string): ScrawlItem[] {
  const c = SCRAWL_CONFIG;
  const r = rngOf(seed);
  const line = (text: string): ScrawlItem => ({ kind: 'line', glyphs: glyphsOf(text, r), tilt: r.sign(c.tilt), shift: r.sign(c.shift) });
  const black = (): ScrawlItem => ({
    kind: 'black',
    width: r.range(c.black[0], c.black[1]),
    tilt: r.sign(c.tilt * 1.5),
    shift: r.sign(c.shift * 2),
    shape: Array.from({ length: 8 }, () => r.range(0, 22)),
  });
  const items: ScrawlItem[] = [];
  lines.forEach((text, i) => {
    items.push(line(text));
    if (i === 0 && crossed) {
      items.push({
        kind: 'crossed',
        glyphs: glyphsOf(crossed, r),
        tilt: r.sign(c.tilt * 1.5),
        shift: r.sign(c.shift),
        zig: Array.from({ length: c.strikeZigzag }, () => r.range(0.1, 0.9)),
      });
    }
    // 行のあいだに、1つおきくらいで、黒い帯
    if (i < lines.length - 1 && r.next() < 0.5) items.push(black());
  });
  items.push(black());
  return items;
}
