// 3D表示の仮のテクスチャ（public/textures/{特性}.png）を作るスクリプト。
// 本番の画像ができたら、同じ配置で描いたPNGに差し替える。配置は docs/textures.md を参照。
// 実行：npx tsx scripts/build-textures.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { PALETTES, PixelImage, type Palette } from './pixels';

function textures(p: Palette): PixelImage {
  const img = new PixelImage(128, 64);

  // 1段目：床4種類。マスの境目がわかるよう、右端と下端に細い線を入れる
  for (let i = 0; i < 4; i++) {
    img.floor(i * 32, 0, i, p);
    img.fill(i * 32 + 31, 0, 1, 32, p.speck);
    img.fill(i * 32, 31, 32, 1, p.speck);
  }

  // 2段目の左：壁の上面。縁を明るくし、ひびを入れる
  img.fill(0, 32, 32, 32, p.wall);
  img.fill(0, 32, 32, 2, p.light);
  img.fill(0, 32, 2, 32, p.light);
  img.fill(30, 32, 2, 32, p.edge);
  img.fill(0, 62, 32, 2, p.edge);
  img.fill(9, 40, 7, 1, p.edge);
  img.fill(15, 41, 1, 5, p.edge);
  img.fill(20, 52, 6, 1, p.edge);

  // 2段目の2番目：壁の側面。レンガ積み（高さ8pxの段で、段ごとに継ぎ目を半分ずらす）
  img.fill(32, 32, 32, 32, p.wall);
  for (let row = 0; row < 4; row++) {
    const y = 32 + row * 8;
    img.fill(32, y + 7, 32, 1, p.edge); // 横の目地
    const shift = row % 2 === 0 ? 0 : 8;
    for (let x = shift; x < 32; x += 16) img.fill(32 + x, y, 1, 7, p.edge); // 縦の目地
    img.fill(32, y, 32, 1, p.light); // 段の上側の明るい線
  }
  return img;
}

const dir = new URL('../public/textures/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const [trait, palette] of Object.entries(PALETTES)) {
  writeFileSync(new URL(`${trait}.png`, dir), textures(palette).png());
  console.log(`wrote public/textures/${trait}.png`);
}
