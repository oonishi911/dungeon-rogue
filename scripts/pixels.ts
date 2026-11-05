// 仮の素材を作るスクリプトで共通に使う部品：特性ごとの色、ピクセルの書き込み、PNGの書き出し。
// 外部ライブラリを使わず、Node.js の zlib だけでPNGを作る。

import { deflateSync } from 'node:zlib';

export type RGB = [number, number, number];

export interface Palette {
  floor: RGB;
  speck: RGB; // 床の模様
  wall: RGB;
  edge: RGB; // 壁の縁・目地
  light: RGB; // 壁の明るい部分
  accent: RGB; // 階段・宝箱
}

export const hex = (s: string): RGB => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];

// 特性ごとの色。炎は溶岩の岩、氷は氷の塊、無属性は石、光は白い大理石、闇は黒い石のつもり
export const PALETTES: Record<string, Palette> = {
  fire: { floor: hex('#3a1f1a'), speck: hex('#5a2a1e'), wall: hex('#6e2c1c'), edge: hex('#250c08'), light: hex('#d9653b'), accent: hex('#f2b04a') },
  ice: { floor: hex('#1d2e3a'), speck: hex('#2c4656'), wall: hex('#4f7f9e'), edge: hex('#122633'), light: hex('#cfeefa'), accent: hex('#e8f7ff') },
  neutral: { floor: hex('#26302d'), speck: hex('#33403c'), wall: hex('#4b5a55'), edge: hex('#141a18'), light: hex('#7d8f88'), accent: hex('#ece5d3') },
  light: { floor: hex('#3a3626'), speck: hex('#4d4733'), wall: hex('#b9ab7a'), edge: hex('#4a4128'), light: hex('#fff3c4'), accent: hex('#fff9dc') },
  dark: { floor: hex('#1c1726'), speck: hex('#2a2238'), wall: hex('#3e3358'), edge: hex('#0c0912'), light: hex('#7a68a3'), accent: hex('#cdb9e6') },
};

export class PixelImage {
  readonly data: Uint8Array; // 何も描かないところは透明

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8Array(width * height * 4);
  }

  fill(x: number, y: number, w: number, h: number, c: RGB) {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) this.data.set([c[0], c[1], c[2], 255], (j * this.width + i) * 4);
    }
  }

  /** 床1マス（32×32px）。模様の位置は種類ごとに決める（乱数を使わないので、作り直しても同じ絵になる） */
  floor(x: number, y: number, variant: number, p: Palette) {
    this.fill(x, y, 32, 32, p.floor);
    for (let n = 0; n < 7; n++) {
      const sx = (n * 11 + variant * 7) % 30;
      const sy = (n * 13 + variant * 5) % 30;
      this.fill(x + sx, y + sy, variant % 2 === 0 ? 2 : 1, 1, p.speck);
    }
  }

  png(): Buffer {
    const row = this.width * 4 + 1;
    // 各行の先頭にフィルタの種類（0：なし）を置く
    const raw = Buffer.alloc(row * this.height);
    for (let y = 0; y < this.height; y++) {
      raw[y * row] = 0;
      Buffer.from(this.data.subarray(y * this.width * 4, (y + 1) * this.width * 4)).copy(raw, y * row + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.width, 0);
    ihdr.writeUInt32BE(this.height, 4);
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
