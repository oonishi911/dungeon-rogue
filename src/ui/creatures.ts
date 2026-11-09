// 設定画のない敵を、形も色もプログラムで組んだ立体の模型（闇のダンジョンの敵）。
// 闇コウモリ・影・亡霊・アイスインプ・大ネズミ・闇の王。ダークファンタジーの見た目にするため：
// - 体の表面は、なめらかな球や円柱をわずかに波打たせ（roughen）、細かい凹凸の模様（bumpMap）で、皮膚や毛のざらつきを出す
// - 目は暗がりでも見える光る色。霊の体は少し透けさせ、布のすそはぼろぼろに裂く
// - たいまつの光で陰影が付くよう、色は暗めにして、ツヤは弱く（鎧や氷だけ強く）
// 体の形はマス単位で、足元が原点、正面が +z。動きは種類ごとに決める（羽ばたく・浮かぶ・歩く・走る）。

import * as THREE from 'three';
import type { Dir } from '../game/explore';

export type CreatureId = 'dark_bat' | 'shadow' | 'phantom' | 'ice_imp' | 'giant_rat' | 'dark_lord';
export const CREATURE_IDS: readonly CreatureId[] = ['dark_bat', 'shadow', 'phantom', 'ice_imp', 'giant_rat', 'dark_lord'];

const FACING: Record<Dir, number> = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };
const TURN_SPEED = 9;

// ===== 形を作る道具 =====

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const P = (r: number, y: number) => new THREE.Vector2(r, y); // 回転体の輪郭の点（半径, 高さ）

/** 楕円体（中心が原点） */
function ellipsoid(rx: number, ry: number, rz: number, w = 28, h = 20): THREE.BufferGeometry {
  return new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz);
}

/** 2点のあいだをつなぐ円柱（腕や脚、骨）。a の太さが ra、b の太さが rb */
function limb(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, segments = 12): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(b, a);
  const geo = new THREE.CylinderGeometry(rb, ra, dir.length(), segments, 3);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize()));
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  return geo.translate(mid.x, mid.y, mid.z);
}

/** とがった角やとげ（根元 a から先 b へ） */
function spike(a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.BufferGeometry {
  return limb(a, b, r, 0.001, 8);
}

/** なめらかに変わる、なんとなく不規則な値（-1〜1）。表面を波打たせるのに使う */
function wobble(x: number, y: number, z: number): number {
  return (
    Math.sin(x * 1.7 + Math.sin(y * 2.3)) * Math.sin(y * 1.9 + Math.sin(z * 1.3)) * Math.sin(z * 2.1 + Math.sin(x * 1.1)) * 0.7 +
    Math.sin(x * 4.1 + y * 3.7) * Math.sin(z * 3.3 - x * 2.9) * 0.3
  );
}

/** 表面を、法線の向きにわずかに波打たせる（freq は1マスあたりの波の細かさ） */
function roughen(geo: THREE.BufferGeometry, amount: number, freq: number, seed = 0): THREE.BufferGeometry {
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
function tatter(geo: THREE.BufferGeometry, depth: number, teeth: number): THREE.BufferGeometry {
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
function pleat(geo: THREE.BufferGeometry, amount: number, count: number): THREE.BufferGeometry {
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
function wingGeometry(span: number): THREE.BufferGeometry {
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
const WING_BONES: [number, number, number, number][] = [
  [0, 0.08, 0.42, 0.16],
  [0.42, 0.16, 1, 0.04],
  [0.42, 0.16, 0.8, -0.2],
  [0.42, 0.16, 0.54, -0.3],
  [0.42, 0.16, 0.28, -0.32],
];

/** 皮膚や毛のざらつきの模様（凹凸の画像）。すべての模型で1枚を使い回す */
let grainTexture: THREE.Texture | null = null;
function grain(): THREE.Texture {
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
function glowTexture(color: string): THREE.Texture {
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

type Wrap = <T extends THREE.Material>(material: T, name: string) => T;
type SkinOptions = { shine?: number; specular?: number; bump?: number; opacity?: number; double?: boolean; emissive?: number };

/** 組み立てに使う道具（作った形と素材は、片付けるときのために覚えておく） */
class Kit {
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
type Rig = { height: number; shadow: number; animate(t: number, walk: number, walking: boolean, dt: number): void };

const BUILDERS: Record<CreatureId, (k: Kit, body: THREE.Group) => Rig> = {
  // 闇コウモリ：紫がかった黒い毛の大きなコウモリ。上から見ると広げた羽がよく見えるよう、羽は水平に広げて羽ばたく
  dark_bat(k, body) {
    const fur = k.skin(0x3e3052, { bump: 0.02 });
    const membrane = k.skin(0x55406e, { double: true, shine: 20, specular: 0x2a2036, bump: 0.01 });
    const bone = k.skin(0x1a1428);
    const fang = k.skin(0xd9d0c0, { shine: 40 });
    const eye = k.glow(0xc79cff);
    const fly = k.pivot(body, V(0, 0.55, 0));
    fly.scale.setScalar(1.3); // 暗い床の上でも見失わないよう、少し大きめに
    k.mesh(fly, roughen(ellipsoid(0.11, 0.14, 0.1), 0.012, 18), fur);
    const head = k.pivot(fly, V(0, 0.15, 0.03));
    k.mesh(head, roughen(ellipsoid(0.085, 0.08, 0.08), 0.008, 22), fur);
    k.mesh(head, ellipsoid(0.04, 0.03, 0.05), fur, V(0, -0.02, 0.07));
    for (const s of [-1, 1]) {
      k.mesh(head, new THREE.ConeGeometry(0.035, 0.13, 8).rotateZ(-s * 0.35).translate(s * 0.055, 0.1, 0), fur);
      k.mesh(head, spike(V(s * 0.015, -0.035, 0.105), V(s * 0.013, -0.07, 0.1), 0.007), fang);
    }
    k.eyes(head, eye, 0.035, 0.015, 0.068, 0.016);
    // 足（ぶら下がるための爪）
    for (const s of [-1, 1]) k.mesh(fly, spike(V(s * 0.04, -0.12, -0.02), V(s * 0.05, -0.2, -0.04), 0.012), bone);
    const wings = ([1, -1] as const).map((s) => {
      const w = k.pivot(fly, V(s * 0.07, 0.05, 0));
      k.wing(w, s, 0.42, membrane, bone);
      return w;
    });
    return {
      height: 0.9,
      shadow: 0.38,
      animate(t, _walk, walking) {
        const speed = walking ? 14 : 9;
        const flap = Math.sin(t * speed);
        wings[0]!.rotation.z = 0.15 + flap * 0.65;
        wings[1]!.rotation.z = -0.15 - flap * 0.65;
        fly.position.y = 0.5 - flap * 0.035; // 羽を打ち下ろすと浮き上がる
        fly.rotation.x = walking ? 0.3 : 0.05;
        head.rotation.y = Math.sin(t * 0.9) * 0.25;
      },
    };
  },

  // 影：油のように光る、黒紫の不定形のかたまり。床に触手を広げ、細い腕を前へ伸ばす。目だけが白く光る
  shadow(k, body) {
    const ooze = k.skin(0x120d1a, { shine: 28, specular: 0x2e2440, emissive: 0x0a0612, opacity: 0.93, bump: 0.02 });
    const eye = k.glow(0xe6d8ff);
    const mass = k.pivot(body, V(0, 0, 0));
    const blobs = [
      k.mesh(mass, roughen(ellipsoid(0.27, 0.3, 0.23), 0.04, 9, 1), ooze, V(0, 0.3, 0)),
      k.mesh(mass, roughen(ellipsoid(0.17, 0.19, 0.15), 0.03, 12, 2), ooze, V(0, 0.62, 0.02)),
      k.mesh(mass, roughen(ellipsoid(0.12, 0.1, 0.1), 0.02, 14, 3), ooze, V(-0.16, 0.48, -0.04)),
      k.mesh(mass, roughen(ellipsoid(0.1, 0.09, 0.09), 0.02, 14, 4), ooze, V(0.15, 0.52, -0.02)),
    ];
    k.eyes(blobs[1]!, eye, 0.06, 0.03, 0.135, 0.028, 0.45);
    // 床にしみ出して広がる、どろりとした触手
    const tendrils = Array.from({ length: 9 }, (_, i) => {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      const g = k.pivot(mass, V(Math.sin(a) * 0.17, 0.03, Math.cos(a) * 0.14));
      g.rotation.y = a;
      const len = 0.2 + (i % 3) * 0.07;
      k.mesh(g, roughen(ellipsoid(0.06 - (i % 2) * 0.015, 0.032, len / 2, 16, 10), 0.012, 16, i), ooze, V(0, 0, len / 2));
      return g;
    });
    // 前へ伸ばす細い腕と、かぎ爪
    const arms = ([-1, 1] as const).map((s) => {
      const g = k.pivot(mass, V(s * 0.2, 0.5, 0.06));
      k.mesh(g, roughen(limb(V(0, 0, 0), V(s * 0.12, -0.12, 0.16), 0.045, 0.025, 8), 0.008, 25, s), ooze);
      for (const f of [-1, 0, 1]) k.mesh(g, spike(V(s * 0.12, -0.12, 0.16), V(s * 0.14 + f * 0.025, -0.2, 0.24), 0.012), ooze);
      return g;
    });
    return {
      height: 0.82,
      shadow: 0.42,
      animate(t, _walk, walking) {
        blobs.forEach((b, i) => {
          const p = Math.sin(t * 1.6 + i * 1.3) * 0.05;
          b.scale.set(1 + p, 1 - p * 0.8, 1 + p);
        });
        tendrils.forEach((g, i) => {
          g.rotation.x = -Math.abs(Math.sin(t * 1.3 + i)) * 0.12; // 先が少し持ち上がって、うごめく
          g.scale.z = 1 + Math.sin(t * 1.1 + i * 0.7) * 0.12;
        });
        arms.forEach((g, i) => (g.rotation.x = -0.2 + Math.sin(t * 1.2 + i * 2) * 0.15 - (walking ? 0.3 : 0)));
        mass.rotation.x = walking ? 0.15 : 0;
        mass.rotation.y = Math.sin(t * 0.5) * 0.1;
      },
    };
  },

  // 亡霊：ぼろぼろのフードとローブをまとった、青白い霊。脚はなく、すそが裂けて床から浮かぶ。骨の手を前へ伸ばす
  phantom(k, body) {
    const robe = k.skin(0x2a3140, { double: true, opacity: 0.88, emissive: 0x070a10, bump: 0.025 });
    const dark = k.skin(0x05060a);
    const bone = k.skin(0x7d8794, { shine: 20, emissive: 0x0c1016, bump: 0.01 });
    const eye = k.glow(0x9fe8ff);
    const float = k.pivot(body, V(0, 0.12, 0));
    const hem = tatter(
      new THREE.LatheGeometry([P(0.27, 0), P(0.25, 0.2), P(0.2, 0.45), P(0.15, 0.65), P(0.13, 0.75), P(0.06, 0.8)], 28),
      0.12,
      9,
    );
    const robeMesh = k.mesh(float, roughen(pleat(hem, 0.022, 9), 0.01, 14), robe);
    const hoodGroup = k.pivot(float, V(0, 0.86, 0.01));
    // フード：前が開いた球。中は暗がりで、骸骨の顔と光る目がのぞく
    k.mesh(hoodGroup, roughen(new THREE.SphereGeometry(0.135, 24, 16, Math.PI * 0.72, Math.PI * 1.56, 0, Math.PI * 0.75).scale(1, 1.15, 1.1), 0.008, 20), robe);
    k.mesh(hoodGroup, ellipsoid(0.11, 0.12, 0.1), dark, V(0, -0.01, -0.005));
    k.mesh(hoodGroup, roughen(ellipsoid(0.055, 0.072, 0.05), 0.005, 40), bone, V(0, -0.025, 0.045));
    k.eyes(hoodGroup, eye, 0.026, -0.005, 0.105, 0.016, 0.7);
    const arms = ([-1, 1] as const).map((s) => {
      const g = k.pivot(float, V(s * 0.13, 0.72, 0));
      k.mesh(g, tatter(limb(V(0, 0, 0), V(s * 0.12, -0.2, 0.14), 0.045, 0.075, 12), 0.04, 5), robe);
      for (const f of [-1, 0, 1]) k.mesh(g, limb(V(s * 0.12, -0.2, 0.15), V(s * (0.13 + f * 0.02), -0.28, 0.22), 0.007, 0.003, 5), bone);
      return g;
    });
    return {
      height: 1.02,
      shadow: 0.34,
      animate(t, _walk, walking) {
        float.position.y = 0.12 + Math.sin(t * 1.5) * 0.04;
        float.rotation.x += ((walking ? 0.18 : 0) - float.rotation.x) * 0.1;
        robeMesh.rotation.y = Math.sin(t * 0.8) * 0.12; // すそが揺らぐ
        hoodGroup.rotation.z = Math.sin(t * 0.7) * 0.06;
        arms.forEach((g, i) => (g.rotation.x = -0.2 + Math.sin(t * 1.1 + i * Math.PI) * 0.2));
      },
    };
  },

  // アイスインプ：氷のように青白い肌の小鬼。氷の角と肩の結晶、小さな羽と先のとがった尻尾。にやりと笑い、目は冷たく光る
  ice_imp(k, body) {
    const skinMat = k.skin(0x46697f, { shine: 14, specular: 0x24323e, bump: 0.025 });
    const darkSkin = k.skin(0x22344a, { bump: 0.025 });
    const ice = k.skin(0xa8d4ec, { shine: 90, specular: 0xd0f0ff, opacity: 0.85, emissive: 0x0e2030 });
    const membrane = k.skin(0x2c4862, { double: true, shine: 20 });
    const mouth = k.skin(0x0a0f18);
    const eye = k.glow(0xbff6ff);
    const torso = k.pivot(body, V(0, 0.3, 0));
    k.mesh(torso, roughen(ellipsoid(0.11, 0.14, 0.09), 0.01, 20), skinMat, V(0, 0.13, 0));
    k.mesh(torso, roughen(ellipsoid(0.085, 0.08, 0.07), 0.006, 24), darkSkin, V(0, 0.06, 0.03));
    for (const s of [-1, 1]) {
      // 肩の氷の結晶
      k.mesh(torso, new THREE.OctahedronGeometry(0.045, 0).scale(0.7, 1.4, 0.7).rotateZ(s * 0.5), ice, V(s * 0.1, 0.25, -0.01));
      k.mesh(torso, new THREE.OctahedronGeometry(0.03, 0).scale(0.7, 1.5, 0.7).rotateZ(s * 0.9), ice, V(s * 0.13, 0.22, -0.03));
    }
    const head = k.pivot(torso, V(0, 0.3, 0.01));
    k.mesh(head, roughen(ellipsoid(0.095, 0.09, 0.088), 0.008, 22), skinMat, V(0, 0.04, 0));
    k.mesh(head, ellipsoid(0.06, 0.015, 0.02), mouth, V(0, 0.0, 0.075));
    for (const s of [-1, 1]) {
      k.mesh(head, spike(V(s * 0.05, 0.1, -0.01), V(s * 0.09, 0.2, -0.07), 0.025), ice); // 角
      k.mesh(head, spike(V(s * 0.085, 0.05, -0.01), V(s * 0.19, 0.08, -0.04), 0.022), skinMat); // とがった耳
      for (const tx of [0.012, 0.034]) k.mesh(head, spike(V(s * tx, 0.003, 0.085), V(s * tx, -0.018, 0.088), 0.005), ice); // 牙
    }
    k.eyes(head, eye, 0.035, 0.055, 0.075, 0.017, 0.55);
    const wings = ([1, -1] as const).map((s) => {
      const w = k.pivot(torso, V(s * 0.05, 0.2, -0.08));
      w.rotation.set(-1.1, 0, s * 0.5); // 背中から後ろ上へ立てる
      k.wing(w, s, 0.22, membrane, darkSkin);
      return w;
    });
    const tail = k.pivot(torso, V(0, 0.02, -0.07));
    const tailCurve = new THREE.CatmullRomCurve3([V(0, 0, 0), V(0, -0.06, -0.1), V(0, -0.02, -0.2), V(0, 0.08, -0.26)]);
    k.mesh(tail, new THREE.TubeGeometry(tailCurve, 16, 0.014, 6), darkSkin);
    k.mesh(tail, new THREE.ConeGeometry(0.03, 0.06, 4).rotateX(-0.6), ice, V(0, 0.11, -0.28));
    const arms = ([-1, 1] as const).map((s) => {
      const g = k.pivot(torso, V(s * 0.11, 0.21, 0));
      k.mesh(g, ellipsoid(0.035, 0.035, 0.035), skinMat);
      k.mesh(g, limb(V(0, 0, 0), V(s * 0.05, -0.12, 0.03), 0.03, 0.022), skinMat);
      k.mesh(g, ellipsoid(0.024, 0.024, 0.024), skinMat, V(s * 0.05, -0.12, 0.03));
      k.mesh(g, limb(V(s * 0.05, -0.12, 0.03), V(s * 0.06, -0.22, 0.08), 0.022, 0.017), skinMat);
      for (const f of [-1, 0, 1]) k.mesh(g, spike(V(s * 0.06, -0.22, 0.08), V(s * (0.06 + f * 0.015), -0.27, 0.12), 0.007), ice);
      return g;
    });
    const legs = ([-1, 1] as const).map((s) => {
      const g = k.pivot(body, V(s * 0.06, 0.3, 0));
      // 獣のような脚：ひざが前、かかとが後ろ
      k.mesh(g, ellipsoid(0.045, 0.05, 0.045), skinMat);
      k.mesh(g, limb(V(0, 0, 0), V(s * 0.01, -0.12, 0.05), 0.042, 0.028), skinMat);
      k.mesh(g, ellipsoid(0.028, 0.028, 0.028), darkSkin, V(s * 0.01, -0.12, 0.05));
      k.mesh(g, limb(V(s * 0.01, -0.12, 0.05), V(s * 0.01, -0.24, -0.03), 0.026, 0.018), darkSkin);
      k.mesh(g, ellipsoid(0.019, 0.019, 0.019), darkSkin, V(s * 0.01, -0.24, -0.03));
      k.mesh(g, limb(V(s * 0.01, -0.24, -0.03), V(s * 0.01, -0.29, 0.05), 0.02, 0.016), darkSkin);
      return g;
    });
    return {
      height: 0.78,
      shadow: 0.24,
      animate(t, walk, walking) {
        const step = walking ? Math.sin(walk * 11) : 0;
        legs[0]!.rotation.x = step * 0.55;
        legs[1]!.rotation.x = -step * 0.55;
        arms[0]!.rotation.x = -step * 0.5;
        arms[1]!.rotation.x = step * 0.5;
        torso.position.y = 0.3 + (walking ? Math.abs(step) * 0.02 : Math.sin(t * 2.4) * 0.006);
        const flutter = Math.sin(t * (walking ? 16 : 3)) * (walking ? 0.35 : 0.12);
        wings[0]!.rotation.z = 0.5 + flutter;
        wings[1]!.rotation.z = -0.5 - flutter;
        tail.rotation.y = Math.sin(t * 2.2) * 0.4;
        head.rotation.z = Math.sin(t * 1.3) * 0.08;
      },
    };
  },

  // 大ネズミ：汚れた灰茶色の毛の、犬ほどもあるネズミ。赤い目、黄ばんだ前歯、長い裸の尻尾
  giant_rat(k, body) {
    const fur = k.skin(0x3a322b, { bump: 0.04 });
    const belly = k.skin(0x4f4337, { bump: 0.03 });
    const flesh = k.skin(0x5e4240, { shine: 25, specular: 0x2a1e1e, bump: 0.01 });
    const tooth = k.skin(0xc9b37a, { shine: 40 });
    const eye = k.glow(0xff3a2a);
    const torso = k.pivot(body, V(0, 0, 0));
    k.mesh(torso, roughen(ellipsoid(0.15, 0.13, 0.25), 0.02, 14), fur, V(0, 0.22, 0));
    k.mesh(torso, roughen(ellipsoid(0.17, 0.15, 0.16), 0.02, 14, 2), fur, V(0, 0.22, -0.15));
    k.mesh(torso, ellipsoid(0.11, 0.07, 0.2), belly, V(0, 0.15, 0.02));
    // 背中の逆立った毛
    for (let i = 0; i < 7; i++) k.mesh(torso, spike(V(0, 0.33, 0.12 - i * 0.05), V(0, 0.37, 0.08 - i * 0.05), 0.02), fur);
    const head = k.pivot(torso, V(0, 0.25, 0.22));
    k.mesh(head, roughen(ellipsoid(0.085, 0.08, 0.11), 0.01, 20), fur, V(0, 0, 0.04));
    k.mesh(head, roughen(new THREE.ConeGeometry(0.055, 0.17, 12, 3).rotateX(Math.PI / 2), 0.004, 40), fur, V(0, -0.02, 0.18));
    k.mesh(head, ellipsoid(0.018, 0.015, 0.015), flesh, V(0, -0.02, 0.265));
    for (const s of [-1, 1]) {
      k.mesh(head, ellipsoid(0.032, 0.036, 0.01).rotateY(s * 0.5), flesh, V(s * 0.06, 0.075, -0.01));
      k.mesh(head, new THREE.BoxGeometry(0.012, 0.03, 0.008), tooth, V(s * 0.007, -0.06, 0.225));
    }
    k.eyes(head, eye, 0.048, 0.025, 0.105, 0.016, 0.8);
    const legs = [
      [-1, 0.16],
      [1, 0.16],
      [-1, -0.17],
      [1, -0.17],
    ].map(([s, z]) => {
      const g = k.pivot(torso, V(s! * 0.1, 0.18, z!));
      k.mesh(g, limb(V(0, 0, 0), V(s! * 0.02, -0.16, 0.02), 0.035, 0.02), fur);
      k.mesh(g, ellipsoid(0.025, 0.012, 0.04), flesh, V(s! * 0.02, -0.165, 0.035));
      return g;
    });
    const tail = k.pivot(torso, V(0, 0.2, -0.3));
    const tailCurve = new THREE.CatmullRomCurve3([V(0, 0, 0), V(0.04, -0.08, -0.12), V(-0.05, -0.15, -0.26), V(0.03, -0.18, -0.42)]);
    k.mesh(tail, new THREE.TubeGeometry(tailCurve, 20, 0.016, 6), flesh);
    return {
      height: 0.42,
      shadow: 0.34,
      animate(t, walk, walking) {
        const run = walking ? walk * 16 : 0;
        legs.forEach((g, i) => (g.rotation.x = walking ? Math.sin(run + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.6 : 0));
        torso.position.y = walking ? Math.abs(Math.sin(run)) * 0.025 : 0;
        head.rotation.x = walking ? 0.1 : Math.sin(t * 7) * 0.05 * Math.max(0, Math.sin(t * 0.9)); // 止まると鼻をひくつかせる
        head.rotation.y = walking ? 0 : Math.sin(t * 0.6) * 0.3;
        tail.rotation.y = Math.sin(t * (walking ? 8 : 1.8)) * 0.35;
      },
    };
  },

  // 闇の王（ボス）：角の冠をかぶった、とげだらけの黒い鎧の王。裂けたマントをひるがえし、床から浮かぶ。
  // 左手の杖の先の宝玉と目が紫に光り、体のまわりには闇の気配がゆらめく
  dark_lord(k, body) {
    const armor = k.skin(0x231b33, { shine: 60, specular: 0x6f5596, bump: 0.01 });
    const cloth = k.skin(0x130e1c, { double: true, bump: 0.02 });
    const trim = k.skin(0x6f5596, { shine: 80, specular: 0xb79ce0, emissive: 0x1a1028 });
    const horn = k.skin(0x1a1418, { shine: 30, specular: 0x3a3040 });
    const eye = k.glow(0xd7b0ff);
    const orbGlow = k.glow(0xb07cff);
    const float = k.pivot(body, V(0, 0.1, 0));
    // 下半身：裂けたすその長い衣
    k.mesh(float, roughen(tatter(new THREE.LatheGeometry([P(0.32, 0), P(0.28, 0.25), P(0.21, 0.5), P(0.17, 0.66), P(0.1, 0.7)], 28), 0.12, 11), 0.015, 12), cloth);
    k.mesh(float, new THREE.TorusGeometry(0.17, 0.022, 8, 28).rotateX(Math.PI / 2), trim, V(0, 0.66, 0)); // 帯
    const chest = k.pivot(float, V(0, 0.66, 0));
    k.mesh(chest, roughen(ellipsoid(0.2, 0.19, 0.14), 0.006, 16), armor, V(0, 0.2, 0));
    k.mesh(chest, ellipsoid(0.15, 0.1, 0.12), armor, V(0, 0.06, 0.01));
    k.mesh(chest, new THREE.OctahedronGeometry(0.04, 0).scale(1, 1.4, 0.5), trim, V(0, 0.2, 0.14)); // 胸の紋章
    const cape = k.pivot(chest, V(0, 0.32, -0.02));
    k.mesh(cape, tatter(new THREE.CylinderGeometry(0.22, 0.38, 0.98, 22, 8, true, Math.PI * 0.55, Math.PI * 0.9).translate(0, -0.49, -0.02), 0.12, 13), cloth);
    for (const s of [-1, 1]) {
      // とげの付いた肩当て
      const pad = k.pivot(chest, V(s * 0.21, 0.31, 0));
      k.mesh(pad, roughen(new THREE.SphereGeometry(0.11, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1, 0.8, 1), 0.006, 20), armor);
      for (const [dx, dz] of [[0.02, 0.03], [0.06, -0.02], [0.0, -0.05]]) k.mesh(pad, spike(V(s * dx!, 0.05, dz!), V(s * (dx! + 0.05), 0.17, dz! - 0.02), 0.022), horn);
    }
    const arms = ([-1, 1] as const).map((s) => {
      const g = k.pivot(chest, V(s * 0.22, 0.26, 0));
      k.mesh(g, limb(V(0, 0, 0), V(s * 0.08, -0.2, 0.04), 0.055, 0.045), armor);
      k.mesh(g, limb(V(s * 0.08, -0.2, 0.04), V(s * 0.09, -0.36, 0.13), 0.05, 0.04), armor);
      k.mesh(g, ellipsoid(0.045, 0.04, 0.05), armor, V(s * 0.09, -0.39, 0.15));
      for (const f of [-1, 0, 1]) k.mesh(g, spike(V(s * 0.09 + f * 0.02, -0.4, 0.18), V(s * 0.09 + f * 0.025, -0.45, 0.23), 0.009), horn);
      return g;
    });
    // 左手（+x）の杖と宝玉
    const staff = k.pivot(arms[1]!, V(0.09, -0.39, 0.15));
    k.mesh(staff, limb(V(0, -0.5, 0), V(0, 0.55, 0), 0.016, 0.02, 8), horn);
    for (const a of [0, 2.1, 4.2]) k.mesh(staff, spike(V(0, 0.52, 0), V(Math.sin(a) * 0.06, 0.66, Math.cos(a) * 0.06), 0.012), horn);
    const orb = k.mesh(staff, ellipsoid(0.04, 0.04, 0.04, 14, 10), orbGlow, V(0, 0.62, 0));
    const head = k.pivot(chest, V(0, 0.42, 0.01));
    k.mesh(head, roughen(ellipsoid(0.095, 0.115, 0.1), 0.004, 20), armor, V(0, 0.04, 0));
    k.mesh(head, new THREE.BoxGeometry(0.12, 0.022, 0.03), k.skin(0x05040a), V(0, 0.05, 0.09)); // 兜のすき間
    k.eyes(head, eye, 0.03, 0.05, 0.1, 0.014, 0.5);
    for (const s of [-1, 1]) {
      // 大きな角：横へ出て、上へ反り返る
      const h1 = V(s * 0.08, 0.1, -0.01), h2 = V(s * 0.17, 0.15, -0.04), h3 = V(s * 0.21, 0.28, -0.08), h4 = V(s * 0.19, 0.4, -0.14);
      k.mesh(head, limb(h1, h2, 0.03, 0.024, 8), horn);
      k.mesh(head, limb(h2, h3, 0.024, 0.016, 8), horn);
      k.mesh(head, spike(h3, h4, 0.016), horn);
    }
    for (const a of [-0.5, -0.25, 0, 0.25, 0.5]) k.mesh(head, spike(V(Math.sin(a) * 0.08, 0.13, Math.cos(a) * 0.07), V(Math.sin(a) * 0.1, 0.22 - Math.abs(a) * 0.08, Math.cos(a) * 0.09), 0.012), trim); // 冠
    // 闇の気配（加算で光る、ゆらめく輪）
    const auraMap = glowTexture('rgba(150,90,230,0.55)');
    const auraMat = new THREE.SpriteMaterial({ map: auraMap, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    k.disposables.push(auraMap, auraMat);
    const aura = new THREE.Sprite(auraMat);
    aura.position.set(0, 0.7, -0.05);
    float.add(aura);
    const orbMap = glowTexture('rgba(200,150,255,0.9)');
    const orbMat = new THREE.SpriteMaterial({ map: orbMap, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    k.disposables.push(orbMap, orbMat);
    const orbHalo = new THREE.Sprite(orbMat);
    orbHalo.scale.setScalar(0.22);
    orb.add(orbHalo);
    return {
      height: 1.48,
      shadow: 0.48,
      animate(t, _walk, walking) {
        float.position.y = 0.1 + Math.sin(t * 1.2) * 0.035;
        float.rotation.x += ((walking ? 0.12 : 0) - float.rotation.x) * 0.1;
        cape.rotation.x = -0.08 - Math.sin(t * 1.4) * 0.05 - (walking ? 0.15 : 0);
        arms[0]!.rotation.x = -0.1 + Math.sin(t * 0.9) * 0.08;
        arms[1]!.rotation.x = -0.15 + Math.sin(t * 0.9 + 1) * 0.05;
        head.rotation.y = Math.sin(t * 0.5) * 0.15;
        const pulse = 0.5 + 0.5 * Math.sin(t * 2.3);
        aura.scale.setScalar(1.3 + pulse * 0.15);
        auraMat.opacity = 0.55 + pulse * 0.3;
        orbHalo.scale.setScalar(0.18 + pulse * 0.08);
      },
    };
  },
};

/** 1体分の模型 */
export class Creature {
  readonly root = new THREE.Group();
  readonly height: number; // 頭のてっぺんの高さ（マス）。頭上のマークを置く
  private readonly body = new THREE.Group();
  private readonly rig: Rig;
  private readonly kit: Kit;
  private facing = 0;
  private time = Math.random() * 10; // 同じ種類の敵が並んでも、そろって動かないように
  private walkTime = 0;

  constructor(id: CreatureId, wrap: Wrap = (m) => m) {
    this.kit = new Kit(wrap);
    this.rig = BUILDERS[id](this.kit, this.body);
    this.height = this.rig.height;
    this.root.add(this.body);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false });
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(this.rig.shadow, 24).rotateX(-Math.PI / 2).translate(0, 0.01, 0), shadowMat);
    this.kit.disposables.push(shadowMat, shadow.geometry);
    this.root.add(shadow);
    this.rig.animate(this.time, 0, false, 0);
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
    this.rig.animate(this.time, this.walkTime, walking, dt);
  }

  dispose() {
    for (const d of this.kit.disposables) d.dispose();
  }
}
