// 強敵専用の模型。強敵は、元の敵の模型をそのまま使わず、ここの模型で描く。
// 元の敵の体を大きくして、その敵だけの飾り（角・冠・光の輪・まわる欠片など）と、体のまわりの光を足してある。
// 強敵になる敵は、ダンジョンの設定（出る敵の組み合わせ）で決まる：道中でいちばん強い敵（enemies.ts の strongestOf）。
// 専用の模型がない敵が強敵になったときは、genericElite（大きくして、赤い光と角の冠を足す）で描く。
// 組み立ての道具は creatureKit.ts。ボスは強敵の扱いだが、ここは使わない（ボスの模型は元の敵の模型の中にある）。

import * as THREE from 'three';
import { type Builder, ellipsoid, flicker, type Kit, limb, spike, V } from './creatureKit';

/** 飾りの足し方：base は元の模型。adorn は、元の模型と同じ大きさの座標（体は床に立ち、1.0が約1マス）で飾りを足し、毎フレーム動かす関数を返す */
type Adorn = (k: Kit, body: THREE.Group, height: number) => ((t: number) => void) | void;

/**
 * 元の模型 base を scale 倍に大きくし、飾りを足した強敵の模型にする。
 * 息づかい（creatures.ts が体の大きさを変える）と大きさが重ならないよう、元の模型と飾りは内側の入れ物に入れて拡大する。
 * top は飾りで高くなる分（元の座標で、頭上のマークの位置に足す）
 */
function elite(base: Builder, scale: number, top: number, adorn: Adorn): Builder {
  return (k, body) => {
    const inner = k.pivot(body, V(0, 0, 0));
    inner.scale.setScalar(scale);
    const rig = base(k, inner);
    const tick = adorn(k, inner, rig.height);
    return {
      ...rig,
      height: (rig.height + top) * scale,
      shadow: rig.shadow * scale,
      animate(t, walk, walking, dt) {
        rig.animate(t, walk, walking, dt);
        tick?.(t);
      },
    };
  };
}

/** 輪の形に並べた、上へ向くとげの冠（中心 y、半径 r、本数 n、とげの高さ h） */
function crown(k: Kit, parent: THREE.Object3D, mat: THREE.Material, y: number, r: number, n: number, h: number, at = V(0, 0, 0)) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    // 前のとげは少し低く、後ろのとげは高くして、横から見ても冠に見えるようにする
    const tall = h * (0.75 + 0.25 * Math.max(0, -Math.sin(a)));
    k.mesh(parent, spike(V(x, y, z).add(at), V(x * 1.15, y + tall, z * 1.15).add(at), 0.016), mat);
  }
}

/** まわりをゆっくりまわる欠片（氷・岩・剣など）の入れ物を作る。回すのは返した関数 */
function orbit(k: Kit, parent: THREE.Object3D, at: THREE.Vector3, shards: { geo: THREE.BufferGeometry; mat: THREE.Material; r: number; y: number; phase: number }[], speed: number) {
  const ring = k.pivot(parent, at);
  const items = shards.map((s) => {
    const m = k.mesh(ring, s.geo, s.mat);
    m.position.set(Math.cos(s.phase) * s.r, s.y, Math.sin(s.phase) * s.r);
    return { m, s };
  });
  return (t: number) => {
    ring.rotation.y = t * speed;
    items.forEach(({ m, s }, i) => {
      m.position.y = s.y + Math.sin(t * 1.6 + i * 1.3) * 0.03;
      m.rotation.set(t * 0.9 + i, t * 1.3 + i * 0.7, 0);
    });
  };
}

/** 体のまわりの光（ゆらめく） */
function aura(k: Kit, parent: THREE.Object3D, color: string, size: number, at: THREE.Vector3) {
  const sprite = k.glowSprite(parent, color, size, at);
  return (t: number) => sprite.scale.setScalar(size * (0.92 + 0.08 * flicker(t, 0)));
}

const both = (...f: (((t: number) => void) | undefined)[]) => (t: number) => f.forEach((x) => x?.(t));

// ===== 強敵ごとの模型 =====

/**
 * 溶岩トカゲの強敵：背に溶岩の結晶が並び、頭に長い角が生える。体のまわりに火の粉まじりの光。
 * 元の模型は小さい（長さ0.5マス）ので、大きく（1.7倍）する
 */
export function eliteLavaLizard(base: Builder): Builder {
  return elite(base, 1.7, 0.1, (k, body) => {
    const horn = k.skin(0x201a16, { shine: 25, specular: 0x5a4a40, bump: 0.04 });
    const lava = k.glow(0xff7a20);
    const core = k.glow(0xffd24a);
    for (let i = 0; i < 6; i++) {
      const h = 0.1 - i * 0.008;
      const z = 0.17 - i * 0.065;
      k.mesh(body, new THREE.OctahedronGeometry(0.03, 0).scale(0.8, h / 0.03, 0.8), lava, V(0, 0.2 + h * 0.5, z));
      k.mesh(body, new THREE.OctahedronGeometry(0.014, 0).scale(0.8, h / 0.03 * 0.9, 0.8), core, V(0, 0.2 + h * 0.5, z));
    }
    for (const s of [-1, 1]) {
      // 頭の角：後ろへ反って、先が上を向く
      k.mesh(body, limb(V(s * 0.045, 0.17, 0.27), V(s * 0.1, 0.24, 0.2), 0.022, 0.014, 8), horn);
      k.mesh(body, spike(V(s * 0.1, 0.24, 0.2), V(s * 0.12, 0.36, 0.12), 0.014), horn);
      k.mesh(body, spike(V(s * 0.07, 0.2, 0.25), V(s * 0.14, 0.27, 0.22), 0.01), horn);
    }
    const flame = aura(k, body, 'rgba(255,110,30,0.6)', 0.95, V(0, 0.2, 0));
    const embers = orbit(
      k,
      body,
      V(0, 0.05, 0),
      [0, 1, 2, 3, 4].map((i) => ({ geo: new THREE.OctahedronGeometry(0.018, 0), mat: lava, r: 0.3 + (i % 2) * 0.06, y: 0.1 + i * 0.05, phase: (i / 5) * Math.PI * 2 })),
      0.8,
    );
    return both(flame, embers);
  });
}

/** 氷の彫像の強敵：頭に氷の冠、まわりを氷の欠片がまわり、冷たい光に包まれる */
export function eliteIceStatue(base: Builder): Builder {
  return elite(base, 1.3, 0.22, (k, body) => {
    const ice = k.skin(0xcdeefa, { shine: 100, specular: 0xffffff, opacity: 0.88, flat: true, double: true });
    const frost = k.glow(0xe8fbff);
    // 兜の上（高さ1.0〜1.12）に、大きな冠
    crown(k, body, ice, 1.08, 0.075, 8, 0.2, V(0, 0, 0.01));
    k.mesh(body, new THREE.OctahedronGeometry(0.035, 0).scale(1, 1.6, 1), frost, V(0, 1.2, 0.01)); // 冠の中央の青い宝石
    const cold = aura(k, body, 'rgba(160,225,255,0.55)', 1.25, V(0, 0.65, 0));
    const shards = orbit(
      k,
      body,
      V(0, 0.15, 0),
      [0, 1, 2, 3, 4, 5].map((i) => ({ geo: new THREE.OctahedronGeometry(0.045, 0).scale(0.7, 1.7, 0.7), mat: ice, r: 0.42, y: 0.25 + (i % 3) * 0.3, phase: (i / 6) * Math.PI * 2 })),
      0.7,
    );
    return both(cold, shards);
  });
}

/** 岩鬼イワオの強敵：頭に赤く光る角の冠、肩に大きな岩の連なり、まわりを岩がまわる。体の割れ目から炎がもれる */
export function eliteIwao(base: Builder): Builder {
  return elite(base, 1.25, 0.2, (k, body) => {
    const rock = k.skin(0x3c3834, { shine: 8, bump: 0.04, flat: true });
    const rust = k.skin(0x7a3a1c, { shine: 30, specular: 0x6a3a20, bump: 0.03 });
    const ember = k.glow(0xff6a20);
    // 頭は高さ約1.0〜1.1：太い角を5本の冠にする
    crown(k, body, rust, 1.07, 0.09, 5, 0.25, V(0, 0, 0.1));
    for (const s of [-1, 1]) {
      // 肩の上に、さらに岩のとげの連なり
      for (let i = 0; i < 3; i++) k.mesh(body, spike(V(s * (0.2 + i * 0.07), 0.98 - i * 0.04, -0.02), V(s * (0.24 + i * 0.1), 1.2 - i * 0.07, -0.05), 0.03), rust);
    }
    k.mesh(body, new THREE.TorusGeometry(0.14, 0.014, 6, 24).rotateX(Math.PI / 2), ember, V(0, 1.05, 0.1)); // 頭の周りの熱い輪
    const heat = aura(k, body, 'rgba(255,90,30,0.55)', 1.35, V(0, 0.65, 0));
    const rocks = orbit(
      k,
      body,
      V(0, 0.1, 0),
      [0, 1, 2, 3].map((i) => ({ geo: new THREE.DodecahedronGeometry(0.06 + (i % 2) * 0.02, 0), mat: rock, r: 0.5, y: 0.3 + (i % 2) * 0.35, phase: (i / 4) * Math.PI * 2 })),
      0.55,
    );
    return both(heat, rocks);
  });
}

/** 聖なる甲冑の強敵：頭上に金の光の輪、背に浮かぶ3本の光の剣、全身が日の光のような金色の光に包まれる */
export function eliteHolyArmor(base: Builder): Builder {
  return elite(base, 1.3, 0.3, (k, body) => {
    const light = k.glow(0xfff2c0);
    const gold = k.skin(0xd8b45a, { shine: 90, specular: 0xfff0b0, emissive: 0x3a2a08 });
    const steel = k.skin(0xdfe2ea, { shine: 90, specular: 0xffffff, emissive: 0x20222a });
    const halo = k.mesh(body, new THREE.TorusGeometry(0.13, 0.012, 8, 36).rotateX(Math.PI / 2), light, V(0, 1.3, 0));
    // 背中の後ろに、扇のように浮かぶ光の剣（先を上へ。中央が高く、両脇は倒れる）
    const swords = k.pivot(body, V(0, 0.8, -0.22));
    const blades = [-1, 0, 1].map((i) => {
      const g = k.pivot(swords, V(i * 0.2, 0, i === 0 ? 0.04 : 0));
      g.rotation.z = -i * 0.42;
      k.mesh(g, new THREE.BoxGeometry(0.055, 0.5, 0.012), steel, V(0, 0.28, 0));
      k.mesh(g, spike(V(0, 0.53, 0), V(0, 0.68, 0), 0.027), steel);
      k.mesh(g, new THREE.BoxGeometry(0.15, 0.022, 0.03), gold, V(0, 0.02, 0));
      k.mesh(g, limb(V(0, -0.02, 0), V(0, -0.12, 0), 0.012, 0.012, 6), gold);
      return g;
    });
    const sun = aura(k, body, 'rgba(255,225,140,0.6)', 1.4, V(0, 0.72, -0.05));
    return both(sun, (t) => {
      halo.rotation.y = t * 0.8;
      halo.position.y = 1.3 + Math.sin(t * 1.5) * 0.02;
      blades.forEach((g, i) => (g.position.y = Math.sin(t * 1.4 + i * 1.7) * 0.03));
    });
  });
}

/** 暗黒騎士の強敵：兜に長く反った2本の角、頭の後ろに赤く光る欠けた月の輪、全身から黒赤い炎がたちのぼる */
export function eliteDarkKnight(base: Builder): Builder {
  return elite(base, 1.3, 0.25, (k, body) => {
    const horn = k.skin(0x16161a, { shine: 50, specular: 0x5a5a64, bump: 0.01 });
    const red = k.glow(0xff3020);
    for (const s of [-1, 1]) {
      // 兜（高さ約1.0）の両脇から、外へ張り出して上へ反る角
      k.mesh(body, limb(V(s * 0.08, 0.99, 0), V(s * 0.2, 1.08, -0.03), 0.026, 0.02, 8), horn);
      k.mesh(body, limb(V(s * 0.2, 1.08, -0.03), V(s * 0.27, 1.26, -0.07), 0.02, 0.012, 8), horn);
      k.mesh(body, spike(V(s * 0.27, 1.26, -0.07), V(s * 0.25, 1.42, -0.08), 0.012), horn);
    }
    // 頭の後ろの、欠けた赤い月の輪（正面から見ると頭の後ろに光る）
    k.mesh(body, new THREE.TorusGeometry(0.2, 0.011, 6, 36, Math.PI * 1.55).rotateZ(Math.PI * 0.72), red, V(0, 1.02, -0.14));
    const flame = aura(k, body, 'rgba(190,30,50,0.6)', 1.3, V(0, 0.65, -0.1));
    const wisps = orbit(
      k,
      body,
      V(0, 0.1, 0),
      [0, 1, 2, 3, 4].map((i) => ({ geo: new THREE.OctahedronGeometry(0.03, 0).scale(0.7, 1.8, 0.7), mat: red, r: 0.38, y: 0.15 + i * 0.17, phase: i * 1.7 })),
      -0.9,
    );
    return both(flame, wisps);
  });
}

/** 専用の模型がない敵が強敵になったときの模型：元の模型を大きくして、足元から赤い光と、頭上に角の冠を足す */
export function genericElite(base: Builder): Builder {
  return elite(base, 1.3, 0.15, (k, body, height) => {
    const horn = k.skin(0x3a1a1a, { shine: 30, specular: 0x6a3030 });
    const red = k.glow(0xff4a30);
    crown(k, body, horn, height - 0.02, Math.max(0.05, height * 0.07), 5, 0.12 + height * 0.06);
    k.mesh(body, ellipsoid(0.02, 0.02, 0.02, 8, 6), red, V(0, height + 0.12, 0));
    return aura(k, body, 'rgba(255,70,40,0.5)', Math.max(0.6, height * 1.1), V(0, height * 0.5, 0));
  });
}
