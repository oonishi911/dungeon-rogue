// 設定画のない敵の模型（creatures.ts）を組み立てる道具：形の部品、表面の凹凸、光る目や羽、素材の作り方。
// ダークファンタジーの見た目にするため：
// - 体の表面は、なめらかな球や円柱をわずかに波打たせ（roughen）、細かい凹凸の模様（bumpMap）で、皮膚や毛のざらつきを出す
// - 目は暗がりでも見える光る色。霊の体は少し透けさせ、布のすそはぼろぼろに裂く（tatter）
// - たいまつの光で陰影が付くよう、色は暗めにして、ツヤは弱く（鎧や氷だけ強く）
// 体の形はマス単位で、足元が原点、正面が +z。

import * as THREE from 'three';

// ===== 形を作る道具 =====

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export const P = (r: number, y: number) => new THREE.Vector2(r, y); // 回転体の輪郭の点（半径, 高さ）

/** 楕円体（中心が原点）。画面では敵は小さく映るので、面の数は控えめにする（細かくしても見分けられず、描くのが重くなるだけ） */
export function ellipsoid(rx: number, ry: number, rz: number, w = 18, h = 12): THREE.BufferGeometry {
  return new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz);
}

/** 2点のあいだをつなぐ円柱（腕や脚、骨）。a の太さが ra、b の太さが rb */
export function limb(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, segments = 10): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(b, a);
  const geo = new THREE.CylinderGeometry(rb, ra, dir.length(), segments, 2);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize()));
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  return geo.translate(mid.x, mid.y, mid.z);
}

/** とがった角やとげ（根元 a から先 b へ） */
export function spike(a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.BufferGeometry {
  return limb(a, b, r, 0.001, 8);
}

/** なめらかに変わる、なんとなく不規則な値（-1〜1）。表面を波打たせるのに使う */
export function wobble(x: number, y: number, z: number): number {
  return (
    Math.sin(x * 1.7 + Math.sin(y * 2.3)) * Math.sin(y * 1.9 + Math.sin(z * 1.3)) * Math.sin(z * 2.1 + Math.sin(x * 1.1)) * 0.7 +
    Math.sin(x * 4.1 + y * 3.7) * Math.sin(z * 3.3 - x * 2.9) * 0.3
  );
}

/** 表面を、法線の向きにわずかに波打たせる（freq は1マスあたりの波の細かさ） */
export function roughen(geo: THREE.BufferGeometry, amount: number, freq: number, seed = 0): THREE.BufferGeometry {
  geo.computeVertexNormals();
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const d = wobble(x * freq + seed, y * freq + seed * 0.7, z * freq - seed) * amount;
    pos.setXYZ(i, x + nor.getX(i) * d, y + nor.getY(i) * d, z + nor.getZ(i) * d);
  }
  geo.computeVertexNormals();
  return geo;
}

/** 布のすそを裂く：いちばん下の輪の頂点を、ぎざぎざに持ち上げる（teeth は裂け目の数） */
export function tatter(geo: THREE.BufferGeometry, depth: number, teeth: number): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  let bottom = Infinity;
  for (let i = 0; i < pos.count; i++) bottom = Math.min(bottom, pos.getY(i));
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = 1 - (y - bottom) / (depth * 2); // すそに近いほど 1
    if (t <= 0) continue;
    const a = Math.atan2(pos.getZ(i), pos.getX(i));
    const jag = Math.pow(Math.abs(Math.sin(a * teeth * 0.5 + Math.sin(a * 3) * 0.8)), 0.6) * (0.6 + 0.4 * Math.sin(a * 7.3));
    pos.setY(i, y + jag * depth * t * t);
  }
  geo.computeVertexNormals();
  return geo;
}

/** 布のひだ：回転体（ローブなど）を、まわりの向きに沿って波打たせる（count はひだの数） */
export function pleat(geo: THREE.BufferGeometry, amount: number, count: number): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  let top = -Infinity;
  for (let i = 0; i < pos.count; i++) top = Math.max(top, pos.getY(i));
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    const a = Math.atan2(z, x);
    const k = 1 + (Math.sin(a * count + Math.sin(a * 3 + y * 6) * 0.9) * amount * (1.2 - y / top)) / r;
    pos.setXYZ(i, x * k, y, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/** コウモリの羽の膜（付け根が原点、+x へ広がる。前が +z）。span は羽の長さ */
export function wingGeometry(span: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const p = (x: number, y: number) => [x * span, y * span] as const;
  s.moveTo(...p(0, 0.08));
  s.lineTo(...p(0.42, 0.16));
  s.lineTo(...p(1, 0.04));
  s.quadraticCurveTo(...p(0.84, -0.04), ...p(0.8, -0.2));
  s.quadraticCurveTo(...p(0.66, -0.1), ...p(0.54, -0.3));
  s.quadraticCurveTo(...p(0.42, -0.15), ...p(0.28, -0.32));
  s.quadraticCurveTo(...p(0.16, -0.15), ...p(0, -0.16));
  s.closePath();
  return new THREE.ShapeGeometry(s, 8).rotateX(Math.PI / 2); // 絵の上（y）を前（+z）へ
}
/** 羽の骨（付け根から指先へ） */
export const WING_BONES: [number, number, number, number][] = [
  [0, 0.08, 0.42, 0.16],
  [0.42, 0.16, 1, 0.04],
  [0.42, 0.16, 0.8, -0.2],
  [0.42, 0.16, 0.54, -0.3],
  [0.42, 0.16, 0.28, -0.32],
];

/** 皮膚や毛のざらつきの模様（凹凸の画像）。すべての模型で1枚を使い回す */
let grainTexture: THREE.Texture | null = null;
export function grain(): THREE.Texture {
  if (grainTexture) return grainTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const x = i % size, y = Math.floor(i / size);
    const v = 128 + wobble(x * 0.31, y * 0.31, 1.7) * 60 + (Math.random() - 0.5) * 70;
    img.data.set([v, v, v, 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  grainTexture = new THREE.CanvasTexture(canvas);
  grainTexture.wrapS = grainTexture.wrapT = THREE.RepeatWrapping;
  grainTexture.repeat.set(3, 3);
  return grainTexture;
}

/** 光る輪（闇の王のまわりの気配など）の画像 */
export function glowTexture(color: string): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

// ===== 模型を組む =====

export type Wrap = <T extends THREE.Material>(material: T, name: string) => T;
export type SkinOptions = { shine?: number; specular?: number; bump?: number; opacity?: number; double?: boolean; emissive?: number; flat?: boolean };

/** 組み立てに使う道具（作った形と素材は、片付けるときのために覚えておく） */
export class Kit {
  readonly disposables: { dispose(): void }[] = [];
  constructor(private readonly wrap: Wrap) {}

  skin(color: number, o: SkinOptions = {}): THREE.MeshPhongMaterial {
    const m = new THREE.MeshPhongMaterial({
      color,
      shininess: o.shine ?? 8,
      specular: o.specular ?? 0x111111,
      emissive: o.emissive ?? 0x000000,
      side: o.double ? THREE.DoubleSide : THREE.FrontSide,
      transparent: o.opacity !== undefined,
      opacity: o.opacity ?? 1,
      depthWrite: o.opacity === undefined,
      flatShading: o.flat ?? false, // 角ばった面（岩や氷）
    });
    if (o.bump) {
      m.bumpMap = grain();
      m.bumpScale = o.bump;
    }
    this.disposables.push(m);
    return this.wrap(m, 'creature');
  }

  /** 暗がりでも光って見える色（目など） */
  glow(color: number): THREE.MeshBasicMaterial {
    const m = new THREE.MeshBasicMaterial({ color });
    this.disposables.push(m);
    return this.wrap(m, 'creature-glow');
  }

  mesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, at?: THREE.Vector3): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, mat);
    if (at) mesh.position.copy(at);
    mesh.castShadow = !(mat as THREE.MeshPhongMaterial).transparent;
    parent.add(mesh);
    this.disposables.push(geo);
    return mesh;
  }

  /** 動かす部分の入れ物。at が回す軸の位置 */
  pivot(parent: THREE.Object3D, at: THREE.Vector3): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(at);
    parent.add(g);
    return g;
  }

  /** 光る目を左右に1対 */
  eyes(parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, r: number, squint = 0.6) {
    for (const side of [-1, 1]) this.mesh(parent, ellipsoid(r, r * squint, r * 0.6, 10, 8), mat, V(side * x, y, z));
  }

  /** 加算で光る、ぼんやりした光の玉（炎や光の気配）。size は直径（マス） */
  glowSprite(parent: THREE.Object3D, color: string, size: number, at?: THREE.Vector3): THREE.Sprite {
    const map = glowTexture(color);
    const mat = new THREE.SpriteMaterial({ map, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.disposables.push(map, mat);
    const sprite = new THREE.Sprite(mat);
    sprite.scale.setScalar(size);
    if (at) sprite.position.copy(at);
    parent.add(sprite);
    return sprite;
  }

  /** コウモリのような羽を1枚（side が 1 なら右、-1 なら左） */
  wing(parent: THREE.Object3D, side: 1 | -1, span: number, membrane: THREE.Material, bone: THREE.Material) {
    const geo = wingGeometry(span);
    if (side < 0) geo.scale(-1, 1, 1);
    this.mesh(parent, geo, membrane).castShadow = true;
    for (const [x0, z0, x1, z1] of WING_BONES) {
      this.mesh(parent, limb(V(side * x0 * span, 0.004, z0 * span), V(side * x1 * span, 0.004, z1 * span), span * 0.018, span * 0.008, 6), bone);
    }
  }
}

/** 動かし方。t は時間、walk は歩き始めてからの時間、walking は歩いているか */
export type Rig = { height: number; shadow: number; animate(t: number, walk: number, walking: boolean, dt: number): void };

/** 模型を組み立てる関数 */
export type Builder = (k: Kit, body: THREE.Group) => Rig;

// ===== 組み立ての決まった手順 =====

/** 関節の付いた手足：点をつないだ円柱と、関節の球。radii は点ごとの太さ */
export function chain(k: Kit, parent: THREE.Object3D, pts: THREE.Vector3[], radii: number[], mat: THREE.Material, joints = true) {
  for (let i = 0; i + 1 < pts.length; i++) {
    k.mesh(parent, limb(pts[i]!, pts[i + 1]!, radii[i]!, radii[i + 1]!), mat);
    if (joints && i > 0) k.mesh(parent, ellipsoid(radii[i]! * 1.08, radii[i]! * 1.08, radii[i]! * 1.08, 12, 8), mat, pts[i]!);
  }
}

/** 炎のゆらめき：大きさを不規則に変える */
export const flicker = (t: number, i: number) => 0.8 + 0.2 * Math.sin(t * 13 + i * 1.7) * Math.sin(t * 7.3 + i * 2.9);

/** 大きさを変えた模型（ボスなど）：体全体を拡大し、高さと影も合わせる */
export function scaled(body: THREE.Group, rig: Rig, s: number): Rig {
  body.scale.setScalar(s);
  return { ...rig, height: rig.height * s, shadow: rig.shadow * s };
}

// ===== 描く回数を減らす =====

/**
 * 動かさない部品を、入れ物（pivot）ごと・素材ごとに1つの形にまとめる。
 * 模型は小さな部品を何十個も組んで作るが、部品1つごとに描く命令が1回かかるので、まとめると描くのがずっと軽くなる。
 * 動かす部品（animate の中で位置・向き・大きさを変える部品）は、まとめずに残す。どれが動くかは、probe（時間や歩き方を
 * 変えて animate を呼ぶ関数）を何度か呼び、そのたびに部品が動いたかを見て決める。
 * まとめた形は disposables に加える（元の形はここで片付ける）
 */
export function mergeStatic(root: THREE.Object3D, probe: (pass: number) => void, passes: number, disposables: { dispose(): void }[]) {
  const nodes: THREE.Object3D[] = [];
  root.traverse((o) => void nodes.push(o));
  const pose = (o: THREE.Object3D) => [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()];
  const before = nodes.map(pose);
  const moving = new Set<THREE.Object3D>();
  for (let pass = 0; pass < passes; pass++) {
    probe(pass);
    nodes.forEach((o, i) => {
      if (pose(o).some((v, k) => Math.abs(v - before[i]![k]!) > 1e-9)) moving.add(o);
    });
  }
  // 部品ごとに、いちばん近い「動く入れ物」（なければ全体）を探し、そこから見た置き方を求める。
  // 動かない入れ物（向きを付けるためだけの入れ物など）は、中の部品ごと、その外の入れ物にまとめる
  type Part = { mesh: THREE.Mesh; matrix: THREE.Matrix4 };
  const byAnchor = new Map<THREE.Object3D, Map<THREE.Material, Part[]>>();
  for (const o of nodes) {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || moving.has(mesh) || mesh.children.length > 0 || Array.isArray(mesh.material) || mesh === root) continue;
    mesh.updateMatrix();
    const matrix = mesh.matrix.clone();
    let anchor = mesh.parent!;
    while (anchor !== root && !moving.has(anchor)) {
      anchor.updateMatrix();
      matrix.premultiply(anchor.matrix);
      anchor = anchor.parent!;
    }
    const byMaterial = byAnchor.get(anchor) ?? new Map<THREE.Material, Part[]>();
    byAnchor.set(anchor, byMaterial);
    byMaterial.set(mesh.material, [...(byMaterial.get(mesh.material) ?? []), { mesh, matrix }]);
  }
  const groups = [...byAnchor].flatMap(([anchor, byMaterial]) => [...byMaterial.values()].map((parts) => ({ anchor, parts })));
  const v = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  for (const { anchor, parts } of groups) {
    if (parts.length < 2 && parts[0]!.mesh.parent === anchor) continue; // まとめる相手がなく、置き場所もそのまま
    const total = parts.reduce((n, p) => n + p.mesh.geometry.getAttribute('position').count, 0);
    const position = new Float32Array(total * 3);
    const normal = new Float32Array(total * 3);
    const uv = new Float32Array(total * 2);
    const index: number[] = [];
    let at = 0;
    for (const { mesh: m, matrix } of parts) {
      normalMatrix.getNormalMatrix(matrix);
      const flipped = matrix.determinant() < 0; // 裏返っていれば、面の表裏を戻す
      const g = m.geometry;
      const pos = g.getAttribute('position');
      const nor = g.getAttribute('normal');
      const tex = g.getAttribute('uv');
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(matrix).toArray(position, (at + i) * 3);
        if (nor) v.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize().toArray(normal, (at + i) * 3);
        if (tex) uv.set([tex.getX(i), tex.getY(i)], (at + i) * 2);
      }
      const count = g.index ? g.index.count : pos.count;
      for (let i = 0; i < count; i += 3) {
        const a = at + (g.index ? g.index.getX(i) : i);
        const b = at + (g.index ? g.index.getX(i + 1) : i + 1);
        const c = at + (g.index ? g.index.getX(i + 2) : i + 2);
        if (flipped) index.push(a, c, b);
        else index.push(a, b, c);
      }
      at += pos.count;
      m.removeFromParent();
      g.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    merged.setIndex(index);
    const first = parts[0]!.mesh;
    const mesh = new THREE.Mesh(merged, first.material);
    mesh.castShadow = first.castShadow;
    anchor.add(mesh);
    disposables.push(merged);
  }
}
