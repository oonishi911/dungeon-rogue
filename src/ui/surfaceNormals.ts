// 床と壁の凹凸の絵（法線マップ）を、テクスチャの絵から作る。
// 以前は、描くピクセルごとに、テクスチャを3回読んで明るさの差から凹凸を出していた（bumpMap）。
// 同じ計算を絵を読み込んだときに1回だけ行って絵にしておき、描くときは1回読むだけにする。
// 高さはテクスチャの明るさ（赤）。明るいところが高い。傾きの強さは、以前の凹凸の強さ（SURFACE_BUMP）と
// 同じ見た目になるよう、基準の拡大（1マス TILE_PX ピクセル）で、1ピクセルあたりに絵が何ドット進むかを掛けて決める。

import * as THREE from 'three';
import { TILE_PX } from './explore3dConfig';

const MAX_SIZE = 1024; // 作る絵の大きさの上限（これより大きい絵は、縮めてから作る）

// 絵の色（sRGB）を、光の強さ（リニア）に直す表。凹凸は、描くときに絵を読んだ値（リニア）の差から出していたので、同じにする
const LINEAR = Float32Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

/**
 * 法線マップを作る。span は、絵の幅・高さがそれぞれ何マス分に貼られるか（床と壁の上面は 4×4、壁の側面は 4×1）。
 * strength は凹凸の強さ（SURFACE_BUMP）。絵は繰り返し貼るので、端は反対側とつなげて計算する
 */
export function normalMapFrom(image: CanvasImageSource & { width: number; height: number }, span: { u: number; v: number }, strength: number): THREE.DataTexture {
  const w = Math.min(image.width, MAX_SIZE);
  const h = Math.min(image.height, MAX_SIZE);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, w, h);
  const src = ctx.getImageData(0, 0, w, h).data;
  // 高さ。行は、絵の上から下（v は下から上へ増えるので、書き出すときに上下を入れ替える）
  const height = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) height[i] = LINEAR[src[i * 4]!]!;
  const at = (x: number, y: number) => height[((y + h) % h) * w + ((x + w) % w)]!;
  // 1ピクセルあたりに、絵が何ドット進むか
  const kx = w / span.u / TILE_PX;
  const ky = h / span.v / TILE_PX;
  const out = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    const y = h - 1 - j; // j は v が増える向きの行、y は絵の上からの行
    for (let x = 0; x < w; x++) {
      const gx = (at(x + 1, y) - at(x - 1, y)) / 2; // u（右）の向きの高さの変化（1ドットあたり）
      const gy = (at(x, y - 1) - at(x, y + 1)) / 2; // v（上）の向きの高さの変化
      const nx = -gx * kx * strength;
      const ny = -gy * ky * strength;
      const inv = 1 / Math.hypot(nx, ny, 1);
      const o = (j * w + x) * 4;
      out[o] = Math.round((nx * inv * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      out[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(out, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
