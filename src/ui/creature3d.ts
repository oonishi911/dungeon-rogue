// 設定画のない敵の立体の模型。主人公（hero3d.ts）のように、形と色を一から組み立てる。
// 闇のダンジョンの敵：闇コウモリ・影・亡霊・氷の小鬼・大ネズミ・闇の王（ボス）。
// 写実的なダークファンタジーの見た目に近づけるよう、肌・毛・布には細かいまだら模様と凹凸（noiseTexture）を付け、
// 色は暗く沈ませ、目だけを光らせる。霊の体は少し透ける。
//
// 模型は足元が原点で、正面は +z（画面の手前）。歩いた向きへ体を回す。
// 動きは敵ごと：コウモリは羽ばたき、ネズミと小鬼は手足を動かし、影と亡霊は漂い、闇の王は浮かんで杖の宝珠が脈打つ。

import * as THREE from 'three';
import type { Dir } from '../game/explore';
import type { EnemyId } from '../game/types';

const FACING: Record<Dir, number> = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };
const TURN_SPEED = 9;

/** 素材に手を加える関数（ダンジョンの暗がりを効かせる）。name は素材の種類ごとの名前 */
export type MaterialWrap = <T extends THREE.Material>(material: T, name: string) => T;

// ===== 形の部品 =====

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const ellipsoid = (rx: number, ry: number, rz: number, x = 0, y = 0, z = 0, detail = 20) =>
  new THREE.SphereGeometry(1, detail, Math.round(detail * 0.7)).scale(rx, ry, rz).translate(x, y, z);

/** 2点のあいだをつなぐ円柱（腕や脚）。a の太さが ra、b の太さが rb */
function limb(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, segments = 12): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(b, a);
  const geo = new THREE.CylinderGeometry(rb, ra, dir.length(), segments, 3);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  return geo.translate(mid.x, mid.y, mid.z);
}

/** 先へ向かって細くなる、曲がった管（しっぽや角）。points を順に通り、太さは r0 から r1 へ */
function taperedTube(points: THREE.Vector3[], r0: number, r1: number, segments = 24): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, segments, 1, 8, false);
  const pos = geo.getAttribute('position');
  const p = new THREE.Vector3();
  // 管の断面ごとに、中心からの距離を先へ向かって細くする
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const center = curve.getPointAt(t);
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= 8; j++) {
      const k = i * 9 + j;
      p.fromBufferAttribute(pos, k).sub(center).multiplyScalar(r).add(center);
      pos.setXYZ(k, p.x, p.y, p.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

/** 回転体（ローブなど）。profile は [半径, 高さ] を下から順に。ragged を付けると、すそをぎざぎざにする */
function robe(profile: [number, number][], ragged = 0, segments = 28): THREE.BufferGeometry {
  const geo = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  if (ragged > 0) {
    const pos = geo.getAttribute('position');
    const bottom = profile[0]![1];
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > bottom + 0.001) continue;
      const a = Math.atan2(pos.getX(i), pos.getZ(i));
      pos.setY(i, y + ragged * (0.5 + 0.5 * Math.sin(a * 7) * Math.sin(a * 3 + 1)));
    }
    geo.computeVertexNormals();
  }
  return geo;
}

/** 0〜1 のなめらかな3次元のノイズ（でこぼこ用） */
function noise3(x: number, y: number, z: number): number {
  const hash = (i: number, j: number, k: number) => {
    const h = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
    return h - Math.floor(h);
  };
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const f = (t: number) => t * t * (3 - 2 * t);
  const u = f(x - xi), v = f(y - yi), w = f(z - zi);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

/** 表面を不規則にでこぼこにする（筋肉のこぶ、毛の房、布のしわ）。amount はでこぼこの大きさ（マス）、scale は細かさ */
function roughen(geo: THREE.BufferGeometry, amount: number, scale = 18): THREE.BufferGeometry {
  geo.computeVertexNormals();
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = noise3(x * scale, y * scale, z * scale) * 0.65 + noise3(x * scale * 2.7 + 5, y * scale * 2.7, z * scale * 2.7) * 0.35 - 0.5;
    pos.setXYZ(i, x + nor.getX(i) * n * amount, y + nor.getY(i) * n * amount, z + nor.getZ(i) * n * amount);
  }
  geo.computeVertexNormals();
  return geo;
}

// ===== まだら模様 =====

let noise: THREE.CanvasTexture | null = null;
/** 肌・毛・布の細かいまだら模様（明るさ 0.6〜1）。凹凸にも使う。すべての模型で使い回す */
function noiseTexture(): THREE.CanvasTexture {
  if (noise) return noise;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  // 端どうしがつながる値のノイズを、細かさを変えて重ねる
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const layers = [4, 8, 16, 32].map((n) => ({ n, grid: Array.from({ length: n * n }, rand) }));
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      let amp = 0.5;
      for (const { n, grid } of layers) {
        const fx = (x / size) * n;
        const fy = (y / size) * n;
        const x0 = Math.floor(fx) % n;
        const y0 = Math.floor(fy) % n;
        const x1 = (x0 + 1) % n;
        const y1 = (y0 + 1) % n;
        const tx = smooth(fx - Math.floor(fx));
        const ty = smooth(fy - Math.floor(fy));
        const top = grid[y0 * n + x0]! * (1 - tx) + grid[y0 * n + x1]! * tx;
        const bottom = grid[y1 * n + x0]! * (1 - tx) + grid[y1 * n + x1]! * tx;
        v += (top * (1 - ty) + bottom * ty) * amp;
        amp *= 0.5;
      }
      const c = Math.round(255 * (0.6 + 0.4 * Math.min(1, v / 0.94)));
      const k = (y * size + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = c;
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  noise = new THREE.CanvasTexture(canvas);
  noise.wrapS = noise.wrapT = THREE.RepeatWrapping;
  noise.repeat.set(3, 3);
  noise.colorSpace = THREE.NoColorSpace;
  return noise;
}

// ===== 模型の土台 =====

type SkinOptions = { shininess?: number; bump?: number; opacity?: number; emissive?: number; mottled?: boolean; side?: THREE.Side };

abstract class Creature {
  readonly root = new THREE.Group();
  protected readonly body = new THREE.Group(); // 揺れる部分
  protected time = Math.random() * 10; // 同じ種類の敵が並んでも、そろって動かないように
  protected walkTime = 0;
  private facing = 0;
  private readonly disposables: { dispose(): void }[] = [];

  constructor(
    private readonly wrap: MaterialWrap,
    shadowRadius: number,
  ) {
    this.root.add(this.body);
    const shadow = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false });
    const disc = new THREE.CircleGeometry(shadowRadius, 24).rotateX(-Math.PI / 2).translate(0, 0.01, 0);
    this.disposables.push(shadow, disc);
    this.root.add(new THREE.Mesh(disc, shadow));
  }

  /** 肌・毛・布などの素材（まだら模様と凹凸つき） */
  protected skin(color: number, o: SkinOptions = {}): THREE.MeshPhongMaterial {
    const tex = o.mottled === false ? null : noiseTexture();
    const transparent = o.opacity !== undefined;
    const m = new THREE.MeshPhongMaterial({
      color,
      map: tex,
      bumpMap: tex,
      bumpScale: o.bump ?? 1.5,
      shininess: o.shininess ?? 6,
      specular: new THREE.Color(0x111111),
      emissive: new THREE.Color(o.emissive ?? 0x000000),
      transparent,
      opacity: o.opacity ?? 1,
      depthWrite: !transparent,
      side: o.side ?? THREE.FrontSide,
    });
    this.disposables.push(m);
    return this.wrap(m, `creature-${tex ? 'mottled' : 'plain'}`);
  }

  /** 光る目や宝珠（光を受けず、いつも明るい） */
  protected glow(color: number, opacity = 1): THREE.MeshBasicMaterial {
    const m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
    this.disposables.push(m);
    return this.wrap(m, 'creature-glow');
  }

  protected add(geo: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = this.body): THREE.Mesh {
    this.disposables.push(geo);
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = !(material as THREE.Material).transparent;
    parent.add(mesh);
    return mesh;
  }

  /** 軸の位置に置いた、動かす部分の入れ物 */
  protected joint(x: number, y: number, z: number, parent: THREE.Object3D = this.body): THREE.Group {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  }

  /** 毎フレーム呼ぶ。x, z はマスの位置、walking は歩いているか、dt は前のフレームからの秒数 */
  update(x: number, z: number, dir: Dir, walking: boolean, dt: number) {
    this.time += dt;
    this.walkTime = walking ? this.walkTime + dt : 0;
    this.root.position.set(x, 0, z);
    let diff = FACING[dir] - this.facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.facing += diff * Math.min(1, dt * TURN_SPEED);
    this.root.rotation.y = this.facing;
    this.animate(walking, dt);
  }

  protected abstract animate(walking: boolean, dt: number): void;

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}

// ===== 闇コウモリ：ねじれた耳と赤い目、骨ばった膜の翼で羽ばたきながら、床の上を飛ぶ =====

class DarkBat extends Creature {
  private readonly wings: THREE.Group[] = [];

  constructor(wrap: MaterialWrap) {
    super(wrap, 0.22);
    const fur = this.skin(0x2e2438, { bump: 2 });
    const membrane = this.skin(0x241a2e, { bump: 1, side: THREE.DoubleSide, shininess: 14 });
    const bone = this.skin(0x4a3c58);
    const eye = this.glow(0xff3a2a);
    this.body.position.y = 0.5;
    this.add(ellipsoid(0.085, 0.11, 0.08, 0, 0, 0), fur); // 胴
    this.add(ellipsoid(0.065, 0.06, 0.065, 0, 0.12, 0.03), fur); // 頭
    this.add(new THREE.ConeGeometry(0.025, 0.05, 8).rotateX(Math.PI / 2).translate(0, 0.11, 0.1), fur); // 突き出た鼻づら
    for (const s of [-1, 1]) {
      this.add(new THREE.ConeGeometry(0.03, 0.11, 8).rotateZ(-s * 0.35).translate(s * 0.04, 0.2, 0.01), fur); // 長い耳
      this.add(ellipsoid(0.012, 0.01, 0.01, s * 0.028, 0.135, 0.085, 8), eye);
      this.add(limb(V(s * 0.03, -0.08, 0), V(s * 0.035, -0.17, 0.02), 0.012, 0.008, 6), bone); // 爪のある足
      // 翼：肩から外へ伸びる骨と、そのあいだに張った膜（下の縁が波打つ）
      const wing = this.joint(s * 0.06, 0.05, 0);
      wing.scale.x = s;
      const shape = new THREE.Shape();
      shape.moveTo(0, 0.02);
      shape.lineTo(0.18, 0.1);
      shape.lineTo(0.42, 0.05);
      shape.quadraticCurveTo(0.36, -0.03, 0.33, -0.12);
      shape.quadraticCurveTo(0.27, -0.06, 0.22, -0.11);
      shape.quadraticCurveTo(0.15, -0.05, 0.1, -0.1);
      shape.quadraticCurveTo(0.05, -0.06, 0, -0.08);
      this.add(new THREE.ShapeGeometry(shape, 8), membrane, wing);
      this.add(limb(V(0, 0.02, 0), V(0.18, 0.1, 0), 0.012, 0.01, 6), bone, wing);
      this.add(limb(V(0.18, 0.1, 0), V(0.42, 0.05, 0), 0.01, 0.004, 6), bone, wing);
      for (const tip of [V(0.33, -0.12, 0), V(0.22, -0.11, 0), V(0.1, -0.1, 0)]) this.add(limb(V(0.18, 0.1, 0), tip, 0.006, 0.003, 5), bone, wing);
      this.wings.push(wing);
    }
  }

  protected animate(walking: boolean) {
    const flap = Math.sin(this.time * (walking ? 16 : 11));
    for (const [i, wing] of this.wings.entries()) {
      wing.rotation.z = (i === 0 ? -1 : 1) * flap * 0.75;
      wing.rotation.y = (i === 0 ? 1 : -1) * 0.25;
    }
    this.body.position.y = 0.5 + Math.sin(this.time * 2.3) * 0.04 - flap * 0.02;
    this.body.rotation.x = walking ? 0.35 : 0.1;
  }
}

// ===== 影：黒い煙が固まったような体。ゆらゆらとふくらみ縮み、紫の目だけが光る =====

class Shadow extends Creature {
  private readonly puffs: { mesh: THREE.Mesh; phase: number; base: number }[] = [];
  private readonly arms: THREE.Group[] = [];

  constructor(wrap: MaterialWrap) {
    super(wrap, 0.3);
    const smoke = this.skin(0x17121f, { opacity: 0.9, emissive: 0x0e0818, bump: 3 });
    const wisp = this.skin(0x231b30, { opacity: 0.6, emissive: 0x120a20, bump: 3 });
    const eye = this.glow(0xc9a8ff);
    // 下から上へ、煙の玉を積み重ねて、前かがみの人影にする
    const puffs: [number, number, number, number][] = [
      [0, 0.12, 0, 0.2],
      [0.06, 0.22, -0.03, 0.17],
      [-0.06, 0.25, 0.02, 0.17],
      [0, 0.4, 0, 0.19],
      [0.04, 0.55, 0.03, 0.16],
      [-0.05, 0.52, -0.04, 0.14],
      [0, 0.68, 0.06, 0.12], // 頭
    ];
    puffs.forEach(([x, y, z, r], i) => {
      const mesh = this.add(ellipsoid(r, r * 1.1, r, 0, 0, 0, 16), i % 2 ? wisp : smoke);
      mesh.position.set(x, y, z);
      this.puffs.push({ mesh, phase: i * 1.7, base: 1 });
    });
    for (const s of [-1, 1]) {
      this.add(ellipsoid(0.018, 0.012, 0.01, s * 0.04, 0.69, 0.17, 8), eye);
      // 垂れ下がる腕：先へ向かって細くなる煙の筋
      const arm = this.joint(s * 0.16, 0.55, 0.04);
      this.add(taperedTube([V(0, 0, 0), V(s * 0.08, -0.15, 0.06), V(s * 0.06, -0.32, 0.12), V(s * 0.02, -0.42, 0.1)], 0.05, 0.008), smoke, arm);
      this.arms.push(arm);
    }
  }

  protected animate(walking: boolean) {
    for (const p of this.puffs) p.mesh.scale.setScalar(1 + Math.sin(this.time * 2.2 + p.phase) * 0.08);
    this.body.position.y = 0.03 + Math.sin(this.time * 1.4) * 0.025;
    this.body.rotation.x = walking ? 0.25 : 0.08;
    this.body.rotation.z = Math.sin(this.time * 0.9) * 0.05;
    this.arms.forEach((arm, i) => {
      arm.rotation.x = Math.sin(this.time * 1.6 + i * 2) * 0.2 - (walking ? 0.4 : 0);
      arm.rotation.z = (i === 0 ? 1 : -1) * Math.sin(this.time * 1.1 + i) * 0.12;
    });
  }
}

// ===== 亡霊：青白く透けるぼろぼろのローブ。フードの奥は闇で、目だけが光る。すそは床に着かずに漂う =====

class Phantom extends Creature {
  private readonly cloth = new THREE.Group();
  private readonly arms: THREE.Group[] = [];

  constructor(wrap: MaterialWrap) {
    super(wrap, 0.25);
    const shroud = this.skin(0xa8a2bc, { opacity: 0.72, emissive: 0x1a1828, bump: 2, side: THREE.DoubleSide });
    const dark = this.skin(0x07060a, { mottled: false });
    const hand = this.skin(0xc9c3d8, { opacity: 0.8, emissive: 0x15131f });
    const eye = this.glow(0xe8f0ff);
    this.body.add(this.cloth);
    this.add(robe([[0.24, 0.0], [0.2, 0.18], [0.16, 0.42], [0.15, 0.58], [0.17, 0.7], [0.12, 0.8], [0.0, 0.84]], 0.12), shroud, this.cloth);
    // フード：頭をおおう丸い布と、前の開き（奥は闇）
    this.add(ellipsoid(0.13, 0.14, 0.13, 0, 0.88, -0.01), shroud);
    this.add(ellipsoid(0.085, 0.1, 0.05, 0, 0.87, 0.085), dark);
    for (const s of [-1, 1]) {
      this.add(ellipsoid(0.016, 0.01, 0.008, s * 0.032, 0.89, 0.13, 8), eye);
      // 長い袖：肩から前へ垂らし、袖口から骨ばった手が出る
      const arm = this.joint(s * 0.15, 0.7, 0.02);
      this.add(limb(V(0, 0, 0), V(s * 0.06, -0.24, 0.14), 0.05, 0.075), shroud, arm);
      this.add(ellipsoid(0.025, 0.05, 0.02, s * 0.065, -0.3, 0.16, 10), hand, arm);
      this.arms.push(arm);
    }
  }

  protected animate(walking: boolean) {
    this.body.position.y = 0.12 + Math.sin(this.time * 1.5) * 0.04;
    this.body.rotation.x = walking ? 0.22 : 0.05;
    this.cloth.rotation.z = Math.sin(this.time * 1.3) * 0.05;
    this.cloth.rotation.x = Math.sin(this.time * 1.7) * 0.04;
    this.arms.forEach((arm, i) => {
      arm.rotation.x = -0.3 + Math.sin(this.time * 1.2 + i * 1.5) * 0.15 - (walking ? 0.3 : 0);
    });
  }
}

// ===== 氷の小鬼：青い肌の小さな鬼。とがった耳と角、肩と背中から氷の結晶が生え、しっぽの先も氷 =====

class IceImp extends Creature {
  private readonly arms: THREE.Group[] = [];
  private readonly legs: THREE.Group[] = [];
  private readonly tail: THREE.Group;

  constructor(wrap: MaterialWrap) {
    super(wrap, 0.22);
    const hide = this.skin(0x3d7aa3, { bump: 2, shininess: 10 });
    const darkHide = this.skin(0x1f4766, { bump: 2 });
    const horn = this.skin(0xd8e6ee, { shininess: 30 });
    const ice = this.skin(0xaee4fa, { opacity: 0.75, shininess: 80, emissive: 0x1a3c52, mottled: false });
    const eye = this.glow(0x9ff4ff);
    this.add(ellipsoid(0.11, 0.13, 0.09, 0, 0.42, 0), hide); // 胴
    this.add(ellipsoid(0.09, 0.07, 0.08, 0, 0.3, 0.01), darkHide); // 腰
    this.add(ellipsoid(0.11, 0.1, 0.1, 0, 0.62, 0.03), hide); // 大きな頭
    this.add(ellipsoid(0.06, 0.035, 0.04, 0, 0.57, 0.1), darkHide); // 突き出たあご
    for (const s of [-1, 1]) {
      this.add(new THREE.ConeGeometry(0.03, 0.14, 8).rotateZ(-s * 1.25).translate(s * 0.15, 0.65, 0.01), hide); // とがった耳
      this.add(taperedTube([V(s * 0.05, 0.69, 0.03), V(s * 0.08, 0.77, 0.0), V(s * 0.06, 0.84, -0.06)], 0.022, 0.003, 12), horn); // 反った角
      this.add(ellipsoid(0.02, 0.014, 0.01, s * 0.04, 0.63, 0.115, 8), eye);
      for (const [dx, dy, dz, rot] of [[0.1, 0.52, -0.02, 0.4], [0.06, 0.55, -0.07, 0.15]] as const)
        this.add(new THREE.OctahedronGeometry(0.035).scale(0.6, 1.8, 0.6).rotateZ(-s * rot).translate(s * dx, dy, dz), ice); // 肩の氷
      const arm = this.joint(s * 0.11, 0.5, 0);
      this.add(limb(V(0, 0, 0), V(s * 0.05, -0.13, 0.02), 0.032, 0.026), hide, arm);
      this.add(limb(V(s * 0.05, -0.13, 0.02), V(s * 0.06, -0.25, 0.06), 0.026, 0.02), hide, arm);
      for (const f of [-0.015, 0, 0.015]) this.add(new THREE.ConeGeometry(0.008, 0.05, 6).rotateX(Math.PI).translate(s * 0.06 + f, -0.29, 0.07), horn, arm); // かぎ爪
      this.arms.push(arm);
      const leg = this.joint(s * 0.05, 0.28, 0);
      this.add(limb(V(0, 0, 0), V(s * 0.01, -0.13, 0.05), 0.04, 0.03), hide, leg); // 太もも
      this.add(limb(V(s * 0.01, -0.13, 0.05), V(s * 0.01, -0.26, -0.01), 0.03, 0.022), darkHide, leg); // 逆に曲がるすね
      this.add(ellipsoid(0.03, 0.02, 0.05, s * 0.01, -0.27, 0.03, 10), darkHide, leg);
      this.legs.push(leg);
    }
    this.add(new THREE.OctahedronGeometry(0.04).scale(0.6, 2, 0.6).rotateX(-0.5).translate(0, 0.52, -0.1), ice); // 背中の氷
    this.tail = this.joint(0, 0.3, -0.07);
    this.add(taperedTube([V(0, 0, 0), V(0, -0.08, -0.12), V(0, -0.02, -0.25), V(0, 0.08, -0.3)], 0.025, 0.008, 16), darkHide, this.tail);
    this.add(new THREE.OctahedronGeometry(0.03).scale(0.7, 1.4, 0.7).translate(0, 0.11, -0.3), ice, this.tail);
  }

  protected animate(walking: boolean) {
    const phase = this.walkTime * 9;
    const swing = walking ? Math.sin(phase) * 0.55 : 0;
    this.legs[0]!.rotation.x = swing;
    this.legs[1]!.rotation.x = -swing;
    this.arms[0]!.rotation.x = -swing * 0.8;
    this.arms[1]!.rotation.x = swing * 0.8;
    const breath = walking ? 0 : Math.sin(this.time * 2.6) * 0.02;
    this.body.position.y = walking ? Math.abs(Math.sin(phase)) * 0.03 : 0;
    this.body.scale.set(1 + breath, 1 + breath * 0.5, 1 + breath);
    this.body.rotation.x = walking ? 0.12 : 0.04;
    this.tail.rotation.y = Math.sin(this.time * 3) * 0.35;
  }
}

// ===== 大ネズミ：脂ぎった焦げ茶の毛の大きなネズミ。長いしっぽを引きずり、四つ足で走る =====

class GiantRat extends Creature {
  private readonly legs: THREE.Group[] = []; // 左前・右前・左後ろ・右後ろ
  private readonly head: THREE.Group;
  private readonly tail: THREE.Group;

  constructor(wrap: MaterialWrap) {
    super(wrap, 0.3);
    const fur = this.skin(0x4a3b2c, { bump: 3, shininess: 12 });
    const pale = this.skin(0x8f6f62, { bump: 1 });
    const tooth = this.skin(0xd9c79a, { shininess: 30, mottled: false });
    const eye = this.glow(0xff4a2a);
    this.add(ellipsoid(0.13, 0.12, 0.2, 0, 0.21, 0.02), fur); // 胸
    this.add(ellipsoid(0.15, 0.14, 0.17, 0, 0.21, -0.15), fur); // 大きな尻
    this.head = this.joint(0, 0.24, 0.18);
    this.add(ellipsoid(0.08, 0.075, 0.11, 0, 0, 0.06), fur, this.head);
    this.add(new THREE.ConeGeometry(0.055, 0.13, 12).rotateX(Math.PI / 2).translate(0, -0.015, 0.2), fur, this.head); // とがった鼻づら
    this.add(ellipsoid(0.015, 0.012, 0.012, 0, -0.01, 0.265, 8), pale, this.head); // 鼻先
    this.add(new THREE.BoxGeometry(0.02, 0.03, 0.006).translate(0, -0.055, 0.23), tooth, this.head); // 前歯
    for (const s of [-1, 1]) {
      this.add(new THREE.CircleGeometry(0.045, 14).translate(0, 0.03, 0).rotateY(s * 0.6).translate(s * 0.06, 0.06, 0.01), pale, this.head); // 丸い耳
      this.add(ellipsoid(0.012, 0.012, 0.01, s * 0.045, 0.02, 0.15, 8), eye, this.head);
    }
    // 脚：肩と腰を軸にして前後に振る
    for (const [x, z, front] of [[0.08, 0.1, true], [-0.08, 0.1, true], [0.1, -0.2, false], [-0.1, -0.2, false]] as const) {
      const leg = this.joint(x, 0.15, z);
      this.add(limb(V(0, 0, 0), V(0, -0.1, front ? 0.02 : -0.03), front ? 0.03 : 0.045, 0.02), fur, leg);
      this.add(ellipsoid(0.022, 0.012, 0.04, 0, -0.14, front ? 0.04 : 0.0, 8), pale, leg);
      this.legs.push(leg);
    }
    this.tail = this.joint(0, 0.18, -0.3);
    this.add(taperedTube([V(0, 0, 0), V(0.02, -0.1, -0.12), V(-0.04, -0.15, -0.28), V(0.03, -0.16, -0.45)], 0.028, 0.006, 20), pale, this.tail);
  }

  protected animate(walking: boolean) {
    const phase = this.walkTime * 13;
    const swing = walking ? Math.sin(phase) * 0.6 : 0;
    // 対角の脚をそろえて動かす
    this.legs[0]!.rotation.x = swing;
    this.legs[3]!.rotation.x = swing;
    this.legs[1]!.rotation.x = -swing;
    this.legs[2]!.rotation.x = -swing;
    this.body.position.y = walking ? Math.abs(Math.sin(phase)) * 0.02 : 0;
    // 止まっているときは、鼻をひくつかせて頭を小刻みに動かす
    this.head.rotation.x = walking ? 0.1 : Math.sin(this.time * 9) * 0.05 + Math.sin(this.time * 1.3) * 0.12;
    this.head.rotation.y = walking ? 0 : Math.sin(this.time * 0.8) * 0.25;
    this.tail.rotation.y = Math.sin(this.time * (walking ? 6 : 1.5)) * 0.3;
  }
}

// ===== 闇の王（ボス）：角の冠をかぶった、背の高い影の王。ぼろのローブと重い肩当て、紫の宝珠の杖。床から浮いている =====

class DarkLord extends Creature {
  private readonly cape = new THREE.Group();
  private readonly orb: THREE.Mesh;
  private readonly halo: THREE.Mesh;
  private readonly staffArm: THREE.Group;
  private readonly freeArm: THREE.Group;

  constructor(wrap: MaterialWrap) {
    super(wrap, 0.42);
    const cloth = this.skin(0x1c1626, { bump: 2, side: THREE.DoubleSide });
    const lining = this.skin(0x3a1c3e, { bump: 1, side: THREE.DoubleSide });
    const metal = this.skin(0x3a3442, { shininess: 60, bump: 1 });
    const bone = this.skin(0xb8ad96, { shininess: 20 });
    const wood = this.skin(0x24180f, { bump: 2 });
    const eye = this.glow(0xd18cff);
    const orbGlow = this.glow(0xb07cff);
    this.halo = this.add(new THREE.SphereGeometry(0.11, 16, 12), this.glow(0x7a4cc4, 0.3));
    this.add(robe([[0.34, 0.0], [0.3, 0.25], [0.22, 0.6], [0.2, 0.85], [0.24, 1.08], [0.14, 1.2], [0.0, 1.22]], 0.16), cloth); // ローブ
    this.add(ellipsoid(0.22, 0.2, 0.15, 0, 1.0, 0.02), metal); // 胸当て
    this.add(new THREE.TorusGeometry(0.21, 0.025, 8, 24).rotateX(Math.PI / 2).translate(0, 0.78, 0), metal); // 帯
    // 頭：フードの奥に骨の仮面、その上に角の冠
    this.add(ellipsoid(0.12, 0.14, 0.13, 0, 1.33, -0.01), cloth);
    this.add(ellipsoid(0.08, 0.1, 0.06, 0, 1.31, 0.07), bone);
    this.add(new THREE.TorusGeometry(0.1, 0.018, 8, 20).rotateX(Math.PI / 2).translate(0, 1.43, 0), metal);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const h = i === 0 ? 0.14 : 0.09;
      this.add(new THREE.ConeGeometry(0.017, h, 6).translate(Math.sin(a) * 0.1, 1.45 + h / 2, Math.cos(a) * 0.1), metal);
    }
    for (const s of [-1, 1]) {
      this.add(taperedTube([V(s * 0.1, 1.42, 0), V(s * 0.2, 1.5, -0.03), V(s * 0.22, 1.62, -0.08), V(s * 0.17, 1.7, -0.12)], 0.028, 0.004, 14), bone); // 大きな角
      this.add(ellipsoid(0.018, 0.01, 0.008, s * 0.03, 1.33, 0.13, 8), eye);
      // 肩当て：とげの付いた重い金属
      this.add(ellipsoid(0.12, 0.08, 0.12, s * 0.24, 1.13, 0), metal);
      for (const dz of [-0.05, 0.03]) this.add(new THREE.ConeGeometry(0.022, 0.12, 6).rotateZ(-s * 0.5).translate(s * 0.3, 1.21, dz), metal);
    }
    // マント：肩から背中へ垂らす。下ほど広がる
    this.cape.position.set(0, 1.12, -0.12);
    this.body.add(this.cape);
    const capeGeo = new THREE.PlaneGeometry(0.62, 1.14, 6, 8).translate(0, -0.57, 0);
    const p = capeGeo.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const t = -p.getY(i) / 1.14; // 上 0 → 下 1
      p.setX(i, p.getX(i) * (0.75 + t * 0.6));
      p.setZ(i, -t * 0.18 - Math.cos(p.getX(i) * 6) * 0.03);
    }
    capeGeo.computeVertexNormals();
    this.add(capeGeo, lining, this.cape);
    // 腕：右手（-x）に杖を立てて持ち、左手は前へ差し出す
    this.staffArm = this.joint(-0.25, 1.08, 0.02);
    this.add(limb(V(0, 0, 0), V(-0.05, -0.22, 0.1), 0.06, 0.055), cloth, this.staffArm);
    this.add(limb(V(-0.05, -0.22, 0.1), V(-0.04, -0.4, 0.2), 0.055, 0.05), cloth, this.staffArm);
    this.add(ellipsoid(0.04, 0.05, 0.04, -0.04, -0.44, 0.22, 10), bone, this.staffArm);
    this.add(limb(V(-0.04, -1.0, 0.22), V(-0.04, 0.32, 0.22), 0.016, 0.02, 8), wood, this.staffArm); // 杖
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      this.add(taperedTube([V(-0.04, 0.3, 0.22), V(-0.04 + Math.sin(a) * 0.07, 0.38, 0.22 + Math.cos(a) * 0.07), V(-0.04 + Math.sin(a) * 0.04, 0.48, 0.22 + Math.cos(a) * 0.04)], 0.012, 0.003, 8), wood, this.staffArm); // 宝珠を包む枝
    }
    this.orb = this.add(new THREE.SphereGeometry(0.05, 16, 12).translate(0, 0, 0), orbGlow, this.staffArm);
    this.orb.position.set(-0.04, 0.4, 0.22);
    this.staffArm.attach(this.halo);
    this.halo.position.copy(this.orb.position);
    this.freeArm = this.joint(0.25, 1.08, 0.02);
    this.add(limb(V(0, 0, 0), V(0.06, -0.22, 0.08), 0.06, 0.055), cloth, this.freeArm);
    this.add(limb(V(0.06, -0.22, 0.08), V(0.07, -0.34, 0.24), 0.055, 0.05), cloth, this.freeArm);
    for (const f of [-0.02, 0, 0.02]) this.add(limb(V(0.07, -0.36, 0.26), V(0.07 + f, -0.42, 0.33), 0.01, 0.005, 6), bone, this.freeArm); // 骨の指
  }

  protected animate(walking: boolean) {
    this.body.position.y = 0.1 + Math.sin(this.time * 1.2) * 0.04;
    this.body.rotation.x = walking ? 0.1 : 0;
    this.cape.rotation.x = (walking ? 0.35 : 0.08) + Math.sin(this.time * 1.6) * 0.05;
    const pulse = 1 + Math.sin(this.time * 3) * 0.15;
    this.orb.scale.setScalar(pulse);
    this.halo.scale.setScalar(pulse * 1.1);
    this.staffArm.rotation.x = Math.sin(this.time * 1.2) * 0.04;
    this.freeArm.rotation.x = -0.15 + Math.sin(this.time * 0.9 + 1) * 0.1;
  }
}

/** 形から組み立てる敵と、その頭の高さ（頭上のマークを置く高さ、マス） */
export const CREATURES: Partial<Record<EnemyId, { height: number; make: (wrap: MaterialWrap) => Creature }>> = {
  dark_bat: { height: 0.8, make: (wrap) => new DarkBat(wrap) },
  shadow: { height: 0.85, make: (wrap) => new Shadow(wrap) },
  phantom: { height: 1.05, make: (wrap) => new Phantom(wrap) },
  ice_imp: { height: 0.85, make: (wrap) => new IceImp(wrap) },
  giant_rat: { height: 0.45, make: (wrap) => new GiantRat(wrap) },
  dark_lord: { height: 1.85, make: (wrap) => new DarkLord(wrap) },
};
