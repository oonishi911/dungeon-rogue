// 記憶の画面の「書きなぐった文字」を決める（見た目の数値だけ。同じ記憶は、いつも同じ荒れ方になる）。
// 一文字ずつ傾き・ずれ・大きさを変え、半分ほどの文字は上から書き直す（重ね書き）。
// 書いては消した言葉（取り消し線）と、黒く塗りつぶした帯を、文章のあいだにはさむ。

import { nextRandom } from '../game/rng';

export const SCRAWL_CONFIG = {
  rot: 12, // 文字の傾き（度。±）
  dx: 0.14, // 横のずれ（文字の幅に対する割合。±）
  dy: 0.2, // 縦のずれ（±）
  size: [0.85, 1.55] as const, // 文字の大きさ（ふつうの文字に対する倍率）
  overwrite: 0.7, // 上から書き直す文字の割合（ずれた文字が重なる）
  overwriteTwice: 0.25, // 書き直した文字のうち、さらにもう一度重ねる割合
  tilt: 3.5, // 1行の傾き（度。±）
  shift: 8, // 1行の横のずれ（%。±）
  black: [0.4, 0.95] as const, // 塗りつぶしの帯の長さ（幅に対する割合）
  strikeZigzag: 12,
  scratches: 4, // 画面全体に走らせる、引っかき傷の数
  scratchSteps: [6, 10] as const, // 引っかき傷の折れ曲がる数 // 取り消し線の折り返しの数
  // 文字を「絵」に変える墨の加工（SVG のフィルタ。字の輪郭を揺らし、かすれをつくる）
  ink: {
    warpFreq: 0.06, // 輪郭を揺らす波の細かさ（大きいほど細かく揺れる）
    warpScale: 10, // 輪郭の揺れの大きさ（px）
    grainX: 0.04, // かすれの筋の、横方向の細かさ（小さいほど、横に長い筋になる）
    grainY: 0.5, // かすれの筋の、縦方向の細かさ
    grainCut: 0.36, // かすれの量（大きいほど、欠けが増える）
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
  over: { rot: number; dx: number; dy: number }[]; // 重ね書き（なければ空。多いと、何度もなぞった字になる）
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

function overs(r: Rng): Glyph['over'] {
  const c = SCRAWL_CONFIG;
  const one = () => ({ rot: r.sign(c.rot * 1.6), dx: r.sign(c.dx * 2.5), dy: r.sign(c.dy * 2) });
  if (r.next() >= c.overwrite) return [];
  return r.next() < c.overwriteTwice ? [one(), one()] : [one()];
}

function glyphsOf(text: string, r: Rng): Glyph[] {
  const c = SCRAWL_CONFIG;
  return [...text].map((ch) => ({
    ch,
    rot: r.sign(c.rot),
    dx: r.sign(c.dx),
    dy: r.sign(c.dy),
    size: r.range(c.size[0], c.size[1]),
    over: overs(r),
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

/** 画面全体を走る、引っかき傷（赤い乱れた線）。点は 0〜100 の位置（% ）。同じシードなら同じ傷になる */
export function scratches(seed: string): { points: [number, number][] }[] {
  const c = SCRAWL_CONFIG;
  const r = rngOf(seed + ':scratch');
  return Array.from({ length: c.scratches }, () => {
    const n = Math.round(r.range(c.scratchSteps[0], c.scratchSteps[1]));
    // ほぼ端から端まで、ななめに走る（上下にも大きくぶれる）
    const left = r.next() < 0.5;
    const y0 = r.range(5, 95);
    const slope = r.sign(45);
    const points: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = (left ? t : 1 - t) * 100 + r.sign(4);
      const y = Math.min(100, Math.max(0, y0 + slope * (t - 0.5) + r.sign(12)));
      points.push([x, y]);
    }
    return { points };
  });
}
