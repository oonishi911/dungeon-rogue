// 3D表示の仮のテクスチャ（public/textures/{特性}/*.png）を作るスクリプト。
// なめらかな質感（ドット絵ではない）で、1マスあたり128px。床4種類（1枚1マス、128×128px）・
// 壁の上面（1枚で4×4マス、512×512px）・壁の側面（1枚で横4マス、512×128px）を、別々の画像として書き出す。
// 壁は1枚の絵を何マスにもまたがって貼るので、マスの境目に縁取りを付けず、絵の端どうしがつながるように描く。
// 本番の画像ができたら、同じ名前・同じ大きさのPNGに差し替える。仕様は docs/textures.md を参照。
// 実行：npx tsx scripts/build-textures.ts
//
// 模様は、端でつながる（タイルとして並べても継ぎ目が出ない）ノイズを重ねて作る。
// 乱数は使わず、位置から決まる値を使うので、作り直しても同じ絵になる。
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { PALETTES, PixelImage, type Palette, type RGB } from './pixels';

const SIZE = 128; // 1マスの大きさ（px）
const WALL_SPAN = 4; // 壁の絵1枚が、何マス分にまたがるか（src/ui/explore3d.ts の WALL_TEXTURE_SPAN と合わせる）

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

/** 格子の間をなめらかにつないだノイズ（0〜1）。cells は1マス（SIZE）あたりの格子の数、span は何マスで折り返すか */
function valueNoise(px: number, py: number, cells: number, seed: number, span = 1): number {
  const x = (px / SIZE) * cells;
  const y = (py / SIZE) * cells;
  const period = cells * span;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const a = lattice(x0, y0, period, seed);
  const b = lattice(x0 + 1, y0, period, seed);
  const c = lattice(x0, y0 + 1, period, seed);
  const d = lattice(x0 + 1, y0 + 1, period, seed);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

/** 大きな模様から細かい模様まで重ねたノイズ（0〜1） */
function fbm(px: number, py: number, seed: number, base = 4, octaves = 5, span = 1): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(px, py, base << o, seed + o * 97, span) * amp;
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

// ===== 色 =====

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

function paint(draw: (x: number, y: number) => RGB, width = SIZE, height = SIZE): PixelImage {
  const img = new PixelImage(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = draw(x, y);
      img.data.set([Math.round(clamp01(c[0] / 255) * 255), Math.round(clamp01(c[1] / 255) * 255), Math.round(clamp01(c[2] / 255) * 255), 255], (y * width + x) * 4);
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

/**
 * 壁の上面：4×4マスにまたがる1枚の岩肌。マスごとの縁取りは付けず、上下左右の端でつながるように描く
 * （壁がマスに分かれず、ひと続きの岩の塊に見えるように）
 */
function wallTopTexture(p: Palette): PixelImage {
  const size = SIZE * WALL_SPAN;
  return paint(
    (x, y) => {
      const mottled = fbm(x, y, 201, 4, 5, WALL_SPAN);
      const grain = fbm(x, y, 207, 16, 3, WALL_SPAN);
      const c = mix(p.wall, p.light, clamp01(mottled - 0.25) * 0.45);
      return shade(c, 0.85 + grain * 0.3);
    },
    size,
    size,
  );
}

/**
 * 壁の側面：横4マスにまたがるレンガ積み。4段（1段32px）で、1マスに2つ、段ごとに半分ずらす。
 * レンガごとに色合いを少し変え、角を丸め、目地はなめらかに沈ませる。左右の端でつながる
 */
function wallSideTexture(p: Palette): PixelImage {
  const width = SIZE * WALL_SPAN;
  const rows = 4;
  const rowH = SIZE / rows;
  const brickW = SIZE / 2;
  const mortar = 3;
  return paint((x, y) => {
    const row = Math.floor(y / rowH);
    const shift = row % 2 === 0 ? 0 : brickW / 2;
    const bx = (((x + shift) % width) + width) % width;
    const col = Math.floor(bx / brickW);
    const lx = bx - col * brickW;
    const ly = y - row * rowH;
    // レンガごとの色合いと、表面の凹凸
    const tone = lattice(col, row, width / brickW, 401);
    const grain = fbm(x, y, 409, 16, 3, WALL_SPAN);
    const mottled = fbm(x, y, 419, 4, 5, WALL_SPAN);
    let c = mix(p.wall, p.light, tone * 0.22 + clamp01(mottled - 0.4) * 0.3);
    c = shade(c, 0.82 + grain * 0.3);
    // 上側は光が当たって明るく、下側は少し暗い
    c = shade(c, 1.08 - (ly / rowH) * 0.16);
    // 角を丸めた面取りで、目地へなめらかに沈む
    const b = bevel(lx, ly, brickW, rowH, mortar + 7);
    const inMortar = 1 - smooth(clamp01((Math.min(lx, ly, brickW - lx, rowH - ly) - mortar + 2.5) / 4));
    c = shade(c, 0.7 + 0.3 * b);
    return mix(c, mix(p.edge, p.wall, 0.35), inMortar * 0.8);
  }, width, SIZE);
}

// ===== 書き出し =====

const root = new URL('../public/textures/', import.meta.url);
const sources = new URL('../assets/texture-sources/', import.meta.url);
for (const [trait, palette] of Object.entries(PALETTES)) {
  // 元の画像から作った特性（scripts/build-photo-textures.py）は、仮の素材で上書きしない
  if (['jpg', 'png'].some((ext) => existsSync(new URL(`${trait}.${ext}`, sources)))) {
    console.log(`skip public/textures/${trait}/ (assets/texture-sources/ の画像から作っている)`);
    continue;
  }
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
