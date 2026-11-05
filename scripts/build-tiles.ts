// 仮のタイル素材（public/tiles/{特性}.png）を作るスクリプト。2D表示（?render=2d）で使う。
// 本番の画像ができたら、同じ配置で描いたPNGに差し替える。配置は docs/tiles.md を参照。
// 実行：npx tsx scripts/build-tiles.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { PALETTES, PixelImage, type Palette } from './pixels';

/** 壁のかたまり：外周に縁、上側に明るい線 */
function blob(img: PixelImage, x: number, y: number, w: number, h: number, p: Palette) {
  img.fill(x, y, w, h, p.wall);
  img.fill(x, y + 2, w, 2, p.light);
  img.fill(x, y, w, 2, p.edge);
  img.fill(x, y + h - 2, w, 2, p.edge);
  img.fill(x, y, 2, h, p.edge);
  img.fill(x + w - 2, y, 2, h, p.edge);
}

function tileset(p: Palette): PixelImage {
  const img = new PixelImage(128, 128);
  // 1段目：床4種類
  for (let i = 0; i < 4; i++) img.floor(i * 32, 0, i, p);

  // 2〜4段目の左：壁のひな形（64×96px）
  const tx = 0;
  const ty = 32;
  blob(img, tx, ty, 32, 32, p); // 見本：単独の壁
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
  blob(img, tx, ty + 32, 64, 64, p); // 外角・辺・中央のかたまり

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
