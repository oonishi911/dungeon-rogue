// 仮のタイル素材（public/tiles/{特性}.png）を作るスクリプト。
// 本番の画像ができたら、同じ配置で描いたPNGに差し替える。配置は docs/tiles.md を参照。
// 実行：npx tsx scripts/build-tiles.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

type RGB = [number, number, number];

interface Palette {
  floor: RGB;
  speck: RGB; // 床の模様
  wall: RGB;
  edge: RGB; // 壁の縁
  light: RGB; // 壁の上側の明るい線
  accent: RGB; // 階段・宝箱
}

const hex = (s: string): RGB => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];

// 特性ごとの色。炎は溶岩の岩、氷は氷の塊、無属性は石、光は白い大理石、闇は黒い石のつもり
const PALETTES: Record<string, Palette> = {
  fire: { floor: hex('#3a1f1a'), speck: hex('#5a2a1e'), wall: hex('#6e2c1c'), edge: hex('#250c08'), light: hex('#d9653b'), accent: hex('#f2b04a') },
  ice: { floor: hex('#1d2e3a'), speck: hex('#2c4656'), wall: hex('#4f7f9e'), edge: hex('#122633'), light: hex('#cfeefa'), accent: hex('#e8f7ff') },
  neutral: { floor: hex('#26302d'), speck: hex('#33403c'), wall: hex('#4b5a55'), edge: hex('#141a18'), light: hex('#7d8f88'), accent: hex('#ece5d3') },
  light: { floor: hex('#3a3626'), speck: hex('#4d4733'), wall: hex('#b9ab7a'), edge: hex('#4a4128'), light: hex('#fff3c4'), accent: hex('#fff9dc') },
  dark: { floor: hex('#1c1726'), speck: hex('#2a2238'), wall: hex('#3e3358'), edge: hex('#0c0912'), light: hex('#7a68a3'), accent: hex('#cdb9e6') },
};

const SIZE = 128;

class Image {
  readonly data = new Uint8Array(SIZE * SIZE * 4); // 何も描かないところは透明

  fill(x: number, y: number, w: number, h: number, c: RGB) {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        const k = (j * SIZE + i) * 4;
        this.data.set([c[0], c[1], c[2], 255], k);
      }
    }
  }

  /** 壁のかたまり：外周に縁、上側に明るい線 */
  blob(x: number, y: number, w: number, h: number, p: Palette) {
    this.fill(x, y, w, h, p.wall);
    this.fill(x, y + 2, w, 2, p.light);
    this.fill(x, y, w, 2, p.edge);
    this.fill(x, y + h - 2, w, 2, p.edge);
    this.fill(x, y, 2, h, p.edge);
    this.fill(x + w - 2, y, 2, h, p.edge);
  }

  floor(x: number, y: number, variant: number, p: Palette) {
    this.fill(x, y, 32, 32, p.floor);
    // 模様の位置は種類ごとに決める（乱数を使わないので、作り直しても同じ絵になる）
    for (let n = 0; n < 7; n++) {
      const sx = (n * 11 + variant * 7) % 30;
      const sy = (n * 13 + variant * 5) % 30;
      this.fill(x + sx, y + sy, variant % 2 === 0 ? 2 : 1, 1, p.speck);
    }
  }

  png(): Buffer {
    // 各行の先頭にフィルタの種類（0：なし）を置く
    const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
    for (let y = 0; y < SIZE; y++) {
      raw[y * (SIZE * 4 + 1)] = 0;
      Buffer.from(this.data.subarray(y * SIZE * 4, (y + 1) * SIZE * 4)).copy(raw, y * (SIZE * 4 + 1) + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(SIZE, 0);
    ihdr.writeUInt32BE(SIZE, 4);
    ihdr.set([8, 6, 0, 0, 0], 8); // 8bit・RGBA
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function tileset(p: Palette): Image {
  const img = new Image();
  // 1段目：床4種類
  for (let i = 0; i < 4; i++) img.floor(i * 32, 0, i, p);

  // 2〜4段目の左：壁のひな形（64×96px）
  const tx = 0;
  const ty = 32;
  img.blob(tx, ty, 32, 32, p); // 見本：単独の壁
  // 内角：壁の中で、四隅だけに斜めの床が接する
  img.fill(tx + 32, ty, 32, 32, p.wall);
  for (const [cx, cy] of [
    [0, 0],
    [30, 0],
    [0, 30],
    [30, 30],
  ] as const) {
    img.fill(tx + 32 + cx, ty + cy, 2, 2, p.edge);
  }
  img.blob(tx, ty + 32, 64, 64, p); // 外角・辺・中央のかたまり

  // 2段目の右：階段と宝箱（床の上に描く）
  img.floor(64, 32, 0, p);
  for (let k = 0; k < 4; k++) {
    const inset = 4 + k * 3;
    img.fill(64 + inset, 32 + 6 + k * 6, 32 - inset * 2, 3, p.accent);
  }
  img.floor(96, 32, 1, p);
  img.fill(96 + 8, 32 + 10, 16, 14, p.accent);
  img.fill(96 + 8, 32 + 15, 16, 2, p.edge);
  img.fill(96 + 14, 32 + 17, 4, 4, p.edge);
  return img;
}

const dir = new URL('../public/tiles/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const [trait, palette] of Object.entries(PALETTES)) {
  writeFileSync(new URL(`${trait}.png`, dir), tileset(palette).png());
  console.log(`wrote public/tiles/${trait}.png`);
}
