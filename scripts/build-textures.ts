// 3D表示の仮のテクスチャ（public/textures/{特性}/*.png）を作るスクリプト。
// なめらかな質感（ドット絵ではない）で、1枚128×128px。床4種類・壁の上面・壁の側面を、別々の画像として書き出す。
// 本番の画像ができたら、同じ名前・同じ大きさのPNGに差し替える。仕様は docs/textures.md を参照。
// 実行：npx tsx scripts/build-textures.ts
//
// 模様は、端でつながる（タイルとして並べても継ぎ目が出ない）ノイズを重ねて作る。
// 乱数は使わず、位置から決まる値を使うので、作り直しても同じ絵になる。
import { mkdirSync, writeFileSync } from 'node:fs';
import { PALETTES, PixelImage, type Palette, type RGB } from './pixels';

const SIZE = 128;

// ===== ノイズ =====

/** 格子点ごとの決まった値（0〜1）。period で折り返すので、絵の端どうしがつながる */
function lattice(x: number, y: number, period: number, seed: number): number {
  const ix = ((x % period) + period) % period;
  const iy = ((y % period) + period) % period;
  let h = Math.imul(ix * 374761393 + iy * 668265263 + seed * 2147483647, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** 格子の間をなめらかにつないだノイズ（0〜1）。cells は絵の幅あたりの格子の数 */
function valueNoise(px: number, py: number, cells: number, seed: number): number {
  const x = (px / SIZE) * cells;
  const y = (py / SIZE) * cells;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const a = lattice(x0, y0, cells, seed);
  const b = lattice(x0 + 1, y0, cells, seed);
  const c = lattice(x0, y0 + 1, cells, seed);
  const d = lattice(x0 + 1, y0 + 1, cells, seed);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

/** 大きな模様から細かい模様まで重ねたノイズ（0〜1） */
function fbm(px: number, py: number, seed: number, base = 4, octaves = 5): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(px, py, base << o, seed + o * 97) * amp;
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

// ===== 色 =====

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

function paint(draw: (x: number, y: number) => RGB): PixelImage {
  const img = new PixelImage(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const c = draw(x, y);
      img.data.set([Math.round(clamp01(c[0] / 255) * 255), Math.round(clamp01(c[1] / 255) * 255), Math.round(clamp01(c[2] / 255) * 255), 255], (y * SIZE + x) * 4);
    }
  }
  return img;
}

/** 縁からの近さ（0：縁、1：縁から width 以上内側）。石の角を丸く削ったような、なめらかな面取りに使う */
function bevel(x: number, y: number, w: number, h: number, width: number): number {
  const d = Math.min(x + 0.5, y + 0.5, w - x - 0.5, h - y - 0.5);
  return smooth(clamp01(d / width));
}

// ===== 床 =====

/**
 * 床1マス：1枚の敷石。中ほどは明るく、縁は目地へ向かってなめらかに沈む。
 * 種類ごとに、まだら模様の出方と、ひび・小石の位置を変える。縁はどの種類も同じ暗さなので、並べても継ぎ目が目立たない
 */
function floorTexture(p: Palette, variant: number): PixelImage {
  const seed = 11 + variant * 31;
  // ひび：ノイズが細い帯になるところを暗くする（種類ごとに場所が変わる）
  return paint((x, y) => {
    const mottled = fbm(x, y, seed, 4);
    const grain = fbm(x, y, seed + 7, 16, 3);
    let c = mix(p.floor, p.speck, clamp01(mottled * 1.6 - 0.35));
    c = shade(c, 0.88 + grain * 0.24);
    const crack = Math.abs(fbm(x, y, seed + 13, 2, 3) - 0.5);
    if (variant % 2 === 1 && crack < 0.03) c = mix(c, p.edge, 0.3 * smooth(1 - crack / 0.03));
    // 小石：明るいしみをぼかして散らす
    const pebble = valueNoise(x, y, 24, seed + 29);
    if (variant >= 2 && pebble > 0.78) c = mix(c, shade(p.speck, 1.25), smooth((pebble - 0.78) / 0.22) * 0.5);
    // 縁の面取りと目地
    const b = bevel(x, y, SIZE, SIZE, 14);
    c = mix(shade(p.edge, 1.1), c, 0.35 + 0.65 * b);
    return shade(c, 0.92 + 0.1 * b);
  });
}

// ===== 壁 =====

/** 壁の上面：大きな切り石。縁を明るく面取りし、表面にまだら模様と細かい凹凸を付ける */
function wallTopTexture(p: Palette): PixelImage {
  return paint((x, y) => {
    const mottled = fbm(x, y, 201, 4);
    const grain = fbm(x, y, 207, 16, 3);
    let c = mix(p.wall, p.light, clamp01(mottled - 0.25) * 0.45);
    c = shade(c, 0.85 + grain * 0.3);
    // 外側の縁は光が当たって明るく、そのすぐ内側は少し影になる
    const outer = 1 - bevel(x, y, SIZE, SIZE, 6);
    const inner = 1 - bevel(x, y, SIZE, SIZE, 18);
    c = mix(c, p.light, outer * 0.45);
    return shade(c, 1 - (inner - outer) * 0.12);
  });
}

/**
 * 壁の側面：レンガ積み。4段（1段32px）で、1段に2つ、段ごとに半分ずらす。
 * レンガごとに色合いを少し変え、角を丸め、目地はなめらかに沈ませる。左右の端でつながる
 */
function wallSideTexture(p: Palette): PixelImage {
  const rows = 4;
  const rowH = SIZE / rows;
  const brickW = SIZE / 2;
  const mortar = 3;
  return paint((x, y) => {
    const row = Math.floor(y / rowH);
    const shift = row % 2 === 0 ? 0 : brickW / 2;
    const bx = (((x + shift) % SIZE) + SIZE) % SIZE;
    const col = Math.floor(bx / brickW);
    const lx = bx - col * brickW;
    const ly = y - row * rowH;
    // レンガごとの色合いと、表面の凹凸
    const tone = lattice(col, row, 16, 401);
    const grain = fbm(x, y, 409, 16, 3);
    const mottled = fbm(x, y, 419, 4);
    let c = mix(p.wall, p.light, tone * 0.22 + clamp01(mottled - 0.4) * 0.3);
    c = shade(c, 0.82 + grain * 0.3);
    // 上側は光が当たって明るく、下側は少し暗い
    c = shade(c, 1.08 - (ly / rowH) * 0.16);
    // 角を丸めた面取りで、目地へなめらかに沈む
    const b = bevel(lx, ly, brickW, rowH, mortar + 7);
    const inMortar = 1 - smooth(clamp01((Math.min(lx, ly, brickW - lx, rowH - ly) - mortar + 2.5) / 4));
    c = shade(c, 0.7 + 0.3 * b);
    return mix(c, mix(p.edge, p.wall, 0.35), inMortar * 0.8);
  });
}

// ===== 書き出し =====

const root = new URL('../public/textures/', import.meta.url);
for (const [trait, palette] of Object.entries(PALETTES)) {
  const dir = new URL(`${trait}/`, root);
  mkdirSync(dir, { recursive: true });
  const files: [string, PixelImage][] = [
    ...[0, 1, 2, 3].map((v): [string, PixelImage] => [`floor${v + 1}.png`, floorTexture(palette, v)]),
    ['wall-top.png', wallTopTexture(palette)],
    ['wall-side.png', wallSideTexture(palette)],
  ];
  for (const [name, img] of files) writeFileSync(new URL(name, dir), img.png());
  console.log(`wrote public/textures/${trait}/ (${files.map(([n]) => n).join(', ')})`);
}
