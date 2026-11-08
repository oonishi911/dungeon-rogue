// 角の丸い壁の形。1マスの壁（足元が y=0、中心が原点、幅1×奥行き1×高さ height）を、
// 床に面している辺だけ丸めて作る。となりも壁の面は描かず（壁どうしは継ぎ目なくつながる）、
// 床に面した側面の上の縁と、床に面した2つの側面が出会う縦の角を、半径 radius で丸める。
// 丸めるには、面の上の点を「丸めない内側の箱」に押し込み、はみ出した分を長さ radius にそろえて戻す
// （角の丸い箱の作り方）。縁の近くは細かく分けて、丸みがなめらかに見えるようにする。
// 面の向き（法線）も丸みに合わせるので、縁に当たる光がなだらかに変わる。
// 素材は2つ：0 が側面と丸めた縁の下半分と底、1 が上面と丸めた縁の上半分。
// 頂点の色は、面の向きで明るさを変える（上面が明るく、側面は向きごとに暗く。もとの箱の壁と同じ明るさ）

import * as THREE from 'three';

/** 床に面している（丸める）側面。px は +x、nx は -x、pz は +z、nz は -z */
export interface WallExposure {
  px: boolean;
  nx: boolean;
  pz: boolean;
  nz: boolean;
}

/** 4つの側面のどれが床に面しているかを、0〜15 の番号にする（px が1、nx が2、pz が4、nz が8） */
export function exposureIndex(e: WallExposure): number {
  return (e.px ? 1 : 0) | (e.nx ? 2 : 0) | (e.pz ? 4 : 0) | (e.nz ? 8 : 0);
}

export function exposureOf(index: number): WallExposure {
  return { px: (index & 1) !== 0, nx: (index & 2) !== 0, pz: (index & 4) !== 0, nz: (index & 8) !== 0 };
}

// 面の明るさ（もとの箱の壁と同じ）。上・下・±x・+z（手前）・-z（奥）
const SHADE = { top: 1.15, bottom: 0.3, x: 0.7, front: 0.85, back: 0.6 };
// 丸めた縁を分ける位置（縁の幅に対する割合）。縁の外側ほど細かく
const BAND = [0, 0.3, 0.6, 0.85, 1];
const STEP = 1 / 4; // 丸めない平らなところを分ける間隔（マス）。表面のでこぼこ（explore3d.ts の WALL_ROUGH）が出るくらい細かく、スマホで重くならないくらい粗く

export function softWallGeometry(exposure: WallExposure, height: number, radius: number): THREE.BufferGeometry {
  const r = radius;
  const innerMin = new THREE.Vector3(exposure.nx ? -0.5 + r : -0.5, -Infinity, exposure.nz ? -0.5 + r : -0.5);
  const innerMax = new THREE.Vector3(exposure.px ? 0.5 - r : 0.5, height - r, exposure.pz ? 0.5 - r : 0.5);
  const xs = axis(-0.5, 0.5, exposure.nx, exposure.px, r);
  const zs = axis(-0.5, 0.5, exposure.nz, exposure.pz, r);
  const ys = axis(0, height, false, true, r);

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const groups: { start: number; count: number; material: number }[] = [];
  const q = new THREE.Vector3();
  const d = new THREE.Vector3();

  // 面を1枚、格子に分けて足す。point(u, v) は面の上の点、normal は面の向き
  const face = (us: number[], vs: number[], point: (u: number, v: number) => THREE.Vector3, normal: THREE.Vector3, material: number, round: boolean) => {
    const base = positions.length / 3;
    const start = indices.length;
    for (const v of vs) {
      for (const u of us) {
        const p = point(u, v);
        let n = normal;
        if (round) {
          q.copy(p).clamp(innerMin, innerMax);
          d.subVectors(p, q);
          const len = d.length();
          if (len > 1e-6) {
            n = d.divideScalar(len);
            p.copy(q).addScaledVector(n, r);
          }
        }
        positions.push(p.x, p.y, p.z);
        normals.push(n.x, n.y, n.z);
        const k = shadeOf(n);
        colors.push(k, k, k);
      }
    }
    const w = us.length;
    for (let j = 0; j + 1 < vs.length; j++) {
      for (let i = 0; i + 1 < w; i++) {
        const a = base + j * w + i;
        const b = a + 1;
        const c = a + w;
        const e = c + 1;
        indices.push(...facing([a, b, e], normal, positions), ...facing([a, e, c], normal, positions));
      }
    }
    groups.push({ start, count: indices.length - start, material });
  };

  const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  face(xs, zs, (x, z) => P(x, height, z), new THREE.Vector3(0, 1, 0), 1, true);
  if (exposure.px) face(zs, ys, (z, y) => P(0.5, y, z), new THREE.Vector3(1, 0, 0), 0, true);
  if (exposure.nx) face(zs, ys, (z, y) => P(-0.5, y, z), new THREE.Vector3(-1, 0, 0), 0, true);
  if (exposure.pz) face(xs, ys, (x, y) => P(x, y, 0.5), new THREE.Vector3(0, 0, 1), 0, true);
  if (exposure.nz) face(xs, ys, (x, y) => P(x, y, -0.5), new THREE.Vector3(0, 0, -1), 0, true);
  // 底は見えないが、たいまつの影を正しく落とすために残す（影は光から見て裏側の面で描くため）
  face([-0.5, 0.5], [-0.5, 0.5], (x, z) => P(x, 0, z), new THREE.Vector3(0, -1, 0), 0, false);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  // テクスチャはダンジョンの中の位置で貼る（worldMapped）が、テクスチャを使う素材には uv が要るので、0 を入れておく
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
  geo.setIndex(indices);
  // 同じ素材の面をまとめて描く
  for (const material of [0, 1]) {
    for (const g of groups.filter((g) => g.material === material)) geo.addGroup(g.start, g.count, material);
  }
  return geo;
}

/** lo から hi までを分ける位置。丸める端の近くは BAND で細かく、ほかは STEP おきに */
function axis(lo: number, hi: number, roundLo: boolean, roundHi: boolean, r: number): number[] {
  const a = roundLo ? lo + r : lo;
  const b = roundHi ? hi - r : hi;
  const out: number[] = [];
  if (roundLo) for (const f of BAND.slice(0, -1)) out.push(lo + r * f);
  const n = Math.max(1, Math.round((b - a) / STEP));
  for (let i = 0; i <= n; i++) out.push(a + ((b - a) * i) / n);
  if (roundHi) for (const f of BAND.slice(1)) out.push(b + r * f);
  return out;
}

/** 三角形の頂点の並びを、面の向き（外側）から見て反時計回りにそろえる */
function facing(tri: [number, number, number], normal: THREE.Vector3, positions: number[]): number[] {
  const v = (i: number) => new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
  const [a, b, c] = tri.map(v) as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  const cross = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  return cross.dot(normal) >= 0 ? tri : [tri[0], tri[2], tri[1]];
}

/** 面の向きから明るさを決める（向きの成分の2乗で、上・下・横の明るさを混ぜる） */
function shadeOf(n: THREE.Vector3): number {
  const up = n.y > 0 ? SHADE.top : SHADE.bottom;
  const z = n.z > 0 ? SHADE.front : SHADE.back;
  return up * n.y * n.y + SHADE.x * n.x * n.x + z * n.z * n.z;
}
