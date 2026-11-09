// 炎・氷・無属性・光のダンジョンの敵の模型（と、闇のダンジョンにも出るアイスインプ）。
// 似た体つきの敵は同じ組み立て方を使い、色や大きさ、付ける物を変える：
// - 小鬼（imp）：アイスインプ・火の小鬼
// - 猟犬（hound）：炎の猟犬・炎の魔獣（ボス）
// - 鬼（brute）：ゴブリン・鬼の首領（ボス）
// - ゴーレム（golem）：石ゴーレム・氷の巨像（ボス）
// - 甲冑（armor）：聖なる甲冑・光の守護者（ボス）
// - ほか：溶岩トカゲ・氷のスライム・氷の甲虫・光の鳥・光の精

import * as THREE from 'three';
import { type Builder, ellipsoid, type Kit, limb, P, type Rig, roughen, spike, tatter, V } from './creatureKit';

type Mat = THREE.Material;

/** 関節の付いた手足：点をつないだ円柱と、関節の球。radii は点ごとの太さ */
function chain(k: Kit, parent: THREE.Object3D, pts: THREE.Vector3[], radii: number[], mat: Mat, joints = true) {
  for (let i = 0; i + 1 < pts.length; i++) {
    k.mesh(parent, limb(pts[i]!, pts[i + 1]!, radii[i]!, radii[i + 1]!), mat);
    if (joints && i > 0) k.mesh(parent, ellipsoid(radii[i]! * 1.08, radii[i]! * 1.08, radii[i]! * 1.08, 12, 8), mat, pts[i]!);
  }
}

/** 炎のゆらめき：大きさを不規則に変える */
const flicker = (t: number, i: number) => 0.8 + 0.2 * Math.sin(t * 13 + i * 1.7) * Math.sin(t * 7.3 + i * 2.9);

/** 大きさを変えた模型（ボスなど）：体全体を拡大し、高さと影も合わせる */
function scaled(body: THREE.Group, rig: Rig, s: number): Rig {
  body.scale.setScalar(s);
  return { ...rig, height: rig.height * s, shadow: rig.shadow * s };
}

// ===== 小鬼 =====

type ImpLook = { skin: number; dark: number; membrane: number; eye: number; fire: boolean };

/** 小鬼：とがった耳と角、小さな羽と先のとがった尻尾。獣のような脚で歩く。fire なら焦げた肌に燃えさしが光り、頭に炎がともる */
function imp(k: Kit, body: THREE.Group, look: ImpLook): Rig {
  const skinMat = k.skin(look.skin, { shine: 14, specular: 0x24323e, bump: 0.025, emissive: look.fire ? 0x1a0400 : 0 });
  const darkSkin = k.skin(look.dark, { bump: 0.025 });
  const accent = look.fire
    ? k.skin(0x1a1210, { shine: 30, specular: 0x403028 }) // 黒い角
    : k.skin(0xa8d4ec, { shine: 90, specular: 0xd0f0ff, opacity: 0.85, emissive: 0x0e2030 }); // 氷
  const ember = k.glow(0xff6a1a);
  const membrane = k.skin(look.membrane, { double: true, shine: 20 });
  const mouth = k.skin(0x0a0808);
  const eye = k.glow(look.eye);
  const torso = k.pivot(body, V(0, 0.3, 0));
  k.mesh(torso, roughen(ellipsoid(0.11, 0.14, 0.09), 0.01, 20), skinMat, V(0, 0.13, 0));
  k.mesh(torso, roughen(ellipsoid(0.085, 0.08, 0.07), 0.006, 24), darkSkin, V(0, 0.06, 0.03));
  for (const s of [-1, 1]) {
    if (look.fire) {
      // 肩のとげと、肌の割れ目に光る燃えさし
      k.mesh(torso, spike(V(s * 0.09, 0.24, -0.01), V(s * 0.14, 0.32, -0.04), 0.022), accent);
      k.mesh(torso, limb(V(s * 0.03, 0.2, 0.085), V(s * 0.06, 0.1, 0.08), 0.005, 0.004, 5), ember);
    } else {
      // 肩の氷の結晶
      k.mesh(torso, new THREE.OctahedronGeometry(0.045, 0).scale(0.7, 1.4, 0.7).rotateZ(s * 0.5), accent, V(s * 0.1, 0.25, -0.01));
      k.mesh(torso, new THREE.OctahedronGeometry(0.03, 0).scale(0.7, 1.5, 0.7).rotateZ(s * 0.9), accent, V(s * 0.13, 0.22, -0.03));
    }
  }
  const head = k.pivot(torso, V(0, 0.3, 0.01));
  k.mesh(head, roughen(ellipsoid(0.095, 0.09, 0.088), 0.008, 22), skinMat, V(0, 0.04, 0));
  k.mesh(head, ellipsoid(0.06, 0.015, 0.02), mouth, V(0, 0.0, 0.075));
  for (const s of [-1, 1]) {
    k.mesh(head, spike(V(s * 0.05, 0.1, -0.01), V(s * 0.09, 0.2, -0.07), 0.025), accent); // 角
    k.mesh(head, spike(V(s * 0.085, 0.05, -0.01), V(s * 0.19, 0.08, -0.04), 0.022), skinMat); // とがった耳
    for (const tx of [0.012, 0.034]) k.mesh(head, spike(V(s * tx, 0.003, 0.085), V(s * tx, -0.018, 0.088), 0.005), look.fire ? k.skin(0xc9b890) : accent); // 牙
  }
  k.eyes(head, eye, 0.035, 0.055, 0.075, 0.017, 0.55);
  const flames = look.fire ? [k.glowSprite(head, 'rgba(255,140,40,0.9)', 0.18, V(0, 0.16, -0.02)), k.glowSprite(head, 'rgba(255,200,80,0.8)', 0.1, V(0, 0.21, -0.03))] : [];
  const wings = ([1, -1] as const).map((s) => {
    const w = k.pivot(torso, V(s * 0.05, 0.2, -0.08));
    w.rotation.set(-1.1, 0, s * 0.5); // 背中から後ろ上へ立てる
    k.wing(w, s, 0.22, membrane, darkSkin);
    return w;
  });
  const tail = k.pivot(torso, V(0, 0.02, -0.07));
  const tailCurve = new THREE.CatmullRomCurve3([V(0, 0, 0), V(0, -0.06, -0.1), V(0, -0.02, -0.2), V(0, 0.08, -0.26)]);
  k.mesh(tail, new THREE.TubeGeometry(tailCurve, 16, 0.014, 6), darkSkin);
  k.mesh(tail, new THREE.ConeGeometry(0.03, 0.06, 4).rotateX(-0.6), look.fire ? ember : accent, V(0, 0.11, -0.28));
  const arms = ([-1, 1] as const).map((s) => {
    const g = k.pivot(torso, V(s * 0.11, 0.21, 0));
    k.mesh(g, ellipsoid(0.035, 0.035, 0.035), skinMat);
    chain(k, g, [V(0, 0, 0), V(s * 0.05, -0.12, 0.03), V(s * 0.06, -0.22, 0.08)], [0.03, 0.022, 0.017], skinMat);
    for (const f of [-1, 0, 1]) k.mesh(g, spike(V(s * 0.06, -0.22, 0.08), V(s * (0.06 + f * 0.015), -0.27, 0.12), 0.007), accent);
    return g;
  });
  const legs = ([-1, 1] as const).map((s) => {
    const g = k.pivot(body, V(s * 0.06, 0.3, 0));
    // 獣のような脚：ひざが前、かかとが後ろ
    k.mesh(g, ellipsoid(0.045, 0.05, 0.045), skinMat);
    chain(k, g, [V(0, 0, 0), V(s * 0.01, -0.12, 0.05), V(s * 0.01, -0.24, -0.03), V(s * 0.01, -0.29, 0.05)], [0.042, 0.027, 0.019, 0.015], darkSkin);
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
      flames.forEach((f, i) => f.scale.setScalar((i ? 0.1 : 0.18) * flicker(t, i)));
    },
  };
}

// ===== 猟犬 =====

/** 炎の猟犬：焦げた黒い皮に、たてがみと尻尾の先が燃える猟犬。boss なら角を生やし、炎が増える */
function hound(k: Kit, body: THREE.Group, boss: boolean): Rig {
  const hide = k.skin(0x3e2418, { bump: 0.035, emissive: 0x2a0a00, shine: 12, specular: 0x302018 });
  const dark = k.skin(0x120a08, { bump: 0.02 });
  const bone = k.skin(0xb8a888, { shine: 30 });
  const ember = k.glow(0xff5a14);
  const eye = k.glow(0xffc040);
  const torso = k.pivot(body, V(0, 0, 0));
  k.mesh(torso, roughen(ellipsoid(0.13, 0.14, 0.17), 0.015, 14), hide, V(0, 0.36, 0.07));
  k.mesh(torso, roughen(ellipsoid(0.1, 0.11, 0.15), 0.015, 14, 2), hide, V(0, 0.34, -0.13));
  k.mesh(torso, limb(V(0, 0.4, 0.15), V(0, 0.47, 0.25), 0.075, 0.06), hide); // 首
  // あばらの割れ目に光る燃えさし
  for (const s of [-1, 1]) for (const z of [0.02, 0.08]) k.mesh(torso, limb(V(s * 0.118, 0.4, z), V(s * 0.122, 0.33, z + 0.015), 0.006, 0.004, 5), ember);
  const head = k.pivot(torso, V(0, 0.48, 0.27));
  k.mesh(head, roughen(ellipsoid(0.07, 0.065, 0.085), 0.008, 22), hide);
  k.mesh(head, limb(V(0, -0.01, 0.05), V(0, -0.03, 0.17), 0.045, 0.03), hide); // 鼻づら
  const jaw = k.pivot(head, V(0, -0.04, 0.04));
  k.mesh(jaw, limb(V(0, 0, 0), V(0, -0.02, 0.11), 0.03, 0.022), dark);
  for (const s of [-1, 1]) {
    k.mesh(head, spike(V(s * 0.04, 0.04, -0.02), V(s * 0.07, 0.1, -0.08), 0.022), hide); // 耳
    k.mesh(head, spike(V(s * 0.02, -0.045, 0.15), V(s * 0.02, -0.075, 0.15), 0.006), bone); // 牙
    if (boss) {
      const h1 = V(s * 0.05, 0.05, 0), h2 = V(s * 0.12, 0.1, -0.06), h3 = V(s * 0.13, 0.2, -0.14);
      k.mesh(head, limb(h1, h2, 0.022, 0.016, 8), bone);
      k.mesh(head, spike(h2, h3, 0.016), bone);
    }
  }
  k.eyes(head, eye, 0.04, 0.02, 0.07, 0.014, 0.5);
  // 首から背中へ燃えるたてがみ
  const flames: THREE.Sprite[] = [];
  const maneCount = boss ? 7 : 5;
  for (let i = 0; i < maneCount; i++) {
    const z = 0.25 - i * 0.07;
    const y = 0.5 - Math.abs(z - 0.1) * 0.3;
    k.mesh(torso, spike(V(0, y - 0.02, z), V(0, y + 0.08, z - 0.06), 0.022), dark);
    flames.push(k.glowSprite(torso, 'rgba(255,120,30,0.85)', 0.14, V(0, y + 0.06, z - 0.03)));
  }
  const legs = [
    [-1, 0.13, true],
    [1, 0.13, true],
    [-1, -0.16, false],
    [1, -0.16, false],
  ].map(([s, z, front]) => {
    const sx = s as number;
    const g = k.pivot(torso, V(sx * 0.08, 0.32, z as number));
    const pts = front
      ? [V(0, 0, 0), V(0, -0.15, 0.02), V(0, -0.29, -0.01), V(0, -0.31, 0.03)]
      : [V(0, 0, 0), V(0, -0.12, 0.06), V(0, -0.22, -0.04), V(0, -0.31, 0.0)];
    chain(k, g, pts, [0.05, 0.03, 0.022, 0.02], hide);
    for (const f of [-1, 0, 1]) k.mesh(g, spike(V(f * 0.012, -0.31, 0.03), V(f * 0.015, -0.32, 0.06), 0.006), bone);
    return g;
  });
  const tail = k.pivot(torso, V(0, 0.38, -0.27));
  k.mesh(tail, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, 0, 0), V(0, 0.06, -0.08), V(0, 0.14, -0.12)]), 10, 0.018, 6), dark);
  flames.push(k.glowSprite(tail, 'rgba(255,150,40,0.9)', 0.16, V(0, 0.16, -0.13)));
  const rig: Rig = {
    height: 0.6,
    shadow: 0.3,
    animate(t, walk, walking) {
      const run = walk * 13;
      legs.forEach((g, i) => (g.rotation.x = walking ? Math.sin(run + (i < 2 ? 0 : Math.PI) + (i % 2) * 0.6) * 0.6 : 0));
      torso.position.y = walking ? Math.abs(Math.sin(run)) * 0.025 : Math.sin(t * 3) * 0.004;
      torso.rotation.x = walking ? Math.sin(run) * 0.05 : 0;
      head.rotation.x = walking ? 0.15 : Math.sin(t * 0.8) * 0.06;
      head.rotation.y = walking ? 0 : Math.sin(t * 0.5) * 0.3;
      jaw.rotation.x = 0.1 + Math.max(0, Math.sin(t * 6)) * (walking ? 0.25 : 0.12); // 息を荒くする
      tail.rotation.y = Math.sin(t * 3) * 0.3;
      flames.forEach((f, i) => f.scale.setScalar(0.14 * flicker(t, i) * (i === flames.length - 1 ? 1.2 : 1)));
    },
  };
  return boss ? scaled(body, rig, 1.65) : rig;
}

// ===== 鬼 =====

/** ゴブリン：くすんだ緑の肌の、前かがみの小鬼。大きな耳と鉤鼻、ぼろの革鎧に、とげの付いた棍棒。
 *  chief（鬼の首領）なら大きく赤茶の肌で、角の付いた兜と骨の首飾り、鉄の金棒を持つ */
function brute(k: Kit, body: THREE.Group, chief: boolean): Rig {
  const skinMat = k.skin(chief ? 0x5a3a2a : 0x4a5636, { bump: 0.03, shine: 10, specular: 0x202018 });
  const leather = k.skin(0x2e2218, { bump: 0.03 });
  const metal = k.skin(0x45423e, { shine: 50, specular: 0x6a6660, bump: 0.01 });
  const wood = k.skin(0x3a2818, { bump: 0.03 });
  const bone = k.skin(0xbcae8e, { shine: 25 });
  const gold = k.skin(0x8a6a2a, { shine: 70, specular: 0xc8a050 });
  const eye = k.glow(chief ? 0xff5030 : 0xffd040);
  const legs = ([-1, 1] as const).map((s) => {
    const g = k.pivot(body, V(s * 0.08, 0.38, 0));
    chain(k, g, [V(0, 0, 0), V(s * 0.01, -0.18, 0.05), V(s * 0.01, -0.34, -0.01)], [0.055, 0.04, 0.03], skinMat);
    k.mesh(g, roughen(ellipsoid(0.04, 0.025, 0.07), 0.004, 30), leather, V(s * 0.01, -0.36, 0.03)); // 足
    k.mesh(g, limb(V(s * 0.01, -0.2, 0.05), V(s * 0.01, -0.32, 0.0), 0.045, 0.04), leather); // すね当て
    return g;
  });
  const hips = k.pivot(body, V(0, 0.38, 0));
  k.mesh(hips, tatter(new THREE.LatheGeometry([P(0.15, -0.16), P(0.13, -0.04), P(0.11, 0.04)], 20, 0, Math.PI * 2), 0.06, 7), leather);
  const torso = k.pivot(hips, V(0, 0.02, 0));
  torso.rotation.x = 0.25; // 前かがみ
  k.mesh(torso, roughen(ellipsoid(0.13, 0.11, 0.1), 0.012, 16), skinMat, V(0, 0.08, 0.01));
  k.mesh(torso, roughen(ellipsoid(0.15, 0.13, 0.11), 0.012, 16, 3), skinMat, V(0, 0.22, 0));
  k.mesh(torso, limb(V(-0.13, 0.32, 0.02), V(0.12, 0.05, 0.1), 0.018, 0.018, 6), leather); // 斜めの革帯
  const pad = k.pivot(torso, V(0.15, 0.3, 0));
  k.mesh(pad, new THREE.SphereGeometry(0.075, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), metal);
  for (const dz of [-0.03, 0.03]) k.mesh(pad, spike(V(0.02, 0.04, dz), V(0.06, 0.1, dz), 0.015), metal);
  if (chief) {
    // 骨と金の首飾り
    for (let i = -3; i <= 3; i++) k.mesh(torso, spike(V(i * 0.03, 0.3, 0.1 - Math.abs(i) * 0.008), V(i * 0.034, 0.24, 0.12 - Math.abs(i) * 0.008), 0.009), i === 0 ? gold : bone);
  }
  const head = k.pivot(torso, V(0, 0.34, 0.06));
  head.rotation.x = -0.25; // 前かがみでも前を見る
  k.mesh(head, roughen(ellipsoid(0.08, 0.08, 0.085), 0.01, 22), skinMat, V(0, 0.05, 0));
  k.mesh(head, ellipsoid(0.07, 0.02, 0.03), skinMat, V(0, 0.08, 0.065)); // 眉のでっぱり
  k.mesh(head, spike(V(0, 0.05, 0.075), V(0, 0.0, 0.13), 0.022), skinMat); // 鉤鼻
  k.mesh(head, ellipsoid(0.065, 0.03, 0.06), skinMat, V(0, -0.01, 0.035)); // あご
  for (const s of [-1, 1]) {
    k.mesh(head, spike(V(s * 0.07, 0.06, 0), V(s * (chief ? 0.13 : 0.2), 0.1, -0.05), 0.03), skinMat); // 耳
    k.mesh(head, spike(V(s * 0.03, 0.0, 0.08), V(s * 0.035, 0.045, 0.09), 0.008), bone); // 下あごから出た牙
  }
  k.eyes(head, eye, 0.03, 0.065, 0.075, 0.013, 0.6);
  if (chief) {
    // 角の付いた鉄の兜
    k.mesh(head, new THREE.SphereGeometry(0.09, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), metal, V(0, 0.07, -0.005));
    for (const s of [-1, 1]) {
      const h1 = V(s * 0.08, 0.12, 0), h2 = V(s * 0.15, 0.17, -0.02), h3 = V(s * 0.16, 0.27, -0.05);
      k.mesh(head, limb(h1, h2, 0.022, 0.016, 8), bone);
      k.mesh(head, spike(h2, h3, 0.016), bone);
    }
  }
  const arms = ([-1, 1] as const).map((s) => {
    const g = k.pivot(torso, V(s * 0.16, 0.28, 0));
    chain(k, g, [V(0, 0, 0), V(s * 0.06, -0.17, 0.05), V(s * 0.07, -0.32, 0.1)], [0.045, 0.036, 0.03], skinMat);
    k.mesh(g, limb(V(s * 0.06, -0.19, 0.06), V(s * 0.07, -0.29, 0.09), 0.04, 0.037), leather); // 籠手
    k.mesh(g, roughen(ellipsoid(0.04, 0.045, 0.04), 0.005, 30), skinMat, V(s * 0.07, -0.35, 0.11));
    return g;
  });
  // 右手（-x）の武器：ゴブリンはとげの付いた木の棍棒、首領は鉄の金棒
  const weapon = k.pivot(arms[0]!, V(-0.07, -0.35, 0.11));
  weapon.rotation.x = 1.0;
  k.mesh(weapon, limb(V(0, -0.04, 0), V(0, 0.32, 0), 0.018, chief ? 0.045 : 0.04, 10), chief ? metal : wood);
  for (let i = 0; i < (chief ? 9 : 5); i++) {
    const a = i * 2.4, y = 0.16 + (i / (chief ? 9 : 5)) * 0.15;
    k.mesh(weapon, spike(V(Math.sin(a) * 0.035, y, Math.cos(a) * 0.035), V(Math.sin(a) * 0.075, y + 0.01, Math.cos(a) * 0.075), 0.012), metal);
  }
  const rig: Rig = {
    height: 0.86,
    shadow: 0.28,
    animate(t, walk, walking) {
      const step = walking ? Math.sin(walk * 9) : 0;
      legs[0]!.rotation.x = step * 0.5;
      legs[1]!.rotation.x = -step * 0.5;
      arms[0]!.rotation.x = -0.3 - step * 0.3;
      arms[1]!.rotation.x = step * 0.5;
      hips.position.y = 0.38 + (walking ? Math.abs(step) * 0.02 : 0);
      hips.rotation.z = step * 0.05;
      const breath = walking ? 0 : Math.sin(t * 2) * 0.02;
      torso.scale.set(1 + breath, 1 + breath * 0.5, 1 + breath);
      head.rotation.y = walking ? 0 : Math.sin(t * 0.6) * 0.3;
    },
  };
  return chief ? scaled(body, rig, 1.55) : rig;
}

// ===== ゴーレム =====

/** 岩のかたまりを組んだゴーレム。胸の奥のコアと目が光る。ice（氷の巨像）なら透ける氷の結晶でできて、つららが生える */
function golem(k: Kit, body: THREE.Group, ice: boolean): Rig {
  const rock = ice
    ? k.skin(0x7aa4bc, { shine: 90, specular: 0xc8ecff, opacity: 0.9, emissive: 0x081820, flat: true })
    : k.skin(0x55534c, { shine: 6, bump: 0.04, flat: true });
  const moss = ice ? k.skin(0xdff4ff, { shine: 60, specular: 0xffffff }) : k.skin(0x34402a, { bump: 0.04 });
  const glowMat = k.glow(ice ? 0x9ff0ff : 0xffa040);
  const glowColor = ice ? 'rgba(140,230,255,0.85)' : 'rgba(255,160,60,0.8)';
  let seed = 0;
  // 岩：角の少ない球を大きく波打たせ、面を角ばらせて描く（継ぎ目のない球なので、波打たせても割れない）
  const boulder = (r: number, sx = 1, sy = 1, sz = 1) => roughen(new THREE.SphereGeometry(r, 9, 7).scale(sx, sy, sz), r * 0.2, 1.6 / r, ++seed);
  const legs = ([-1, 1] as const).map((s) => {
    const g = k.pivot(body, V(s * 0.14, 0.42, 0));
    k.mesh(g, boulder(0.11, 1, 1.2, 1), rock, V(0, -0.1, 0));
    k.mesh(g, boulder(0.1, 1, 1.25, 1), rock, V(0, -0.27, 0.01));
    k.mesh(g, boulder(0.09, 1.3, 0.6, 1.5), rock, V(0, -0.37, 0.04));
    return g;
  });
  const torso = k.pivot(body, V(0, 0.45, 0));
  k.mesh(torso, boulder(0.15, 1.2, 0.8, 0.9), rock, V(0, 0.02, 0));
  k.mesh(torso, boulder(0.25, 1.15, 0.85, 0.8), rock, V(0, 0.3, 0));
  // 胸のコア（割れ目からのぞく光）
  k.mesh(torso, new THREE.OctahedronGeometry(0.05, 0), glowMat, V(0, 0.3, 0.18));
  const core = k.glowSprite(torso, glowColor, 0.35, V(0, 0.3, 0.22));
  for (const s of [-1, 1]) k.mesh(torso, boulder(0.12), rock, V(s * 0.27, 0.42, 0)); // 肩
  // 苔か霜
  for (const [x, y, z] of [[-0.12, 0.48, 0.1], [0.15, 0.44, -0.12], [0.05, 0.52, -0.08]]) k.mesh(torso, roughen(ellipsoid(0.07, 0.025, 0.06), 0.01, 30, x!), moss, V(x!, y!, z!));
  if (ice) {
    // 背中と肩から突き出た氷の結晶
    for (const [x, y, z, rx, rz] of [[0, 0.5, -0.12, -0.5, 0], [0.12, 0.48, -0.1, -0.4, -0.4], [-0.14, 0.47, -0.08, -0.4, 0.5], [0.3, 0.52, -0.02, 0, -0.6], [-0.3, 0.52, -0.02, 0, 0.6]]) {
      k.mesh(torso, new THREE.OctahedronGeometry(0.06, 0).scale(0.6, 2.2, 0.6).rotateX(rx!).rotateZ(rz!), moss, V(x!, y! + 0.05, z!));
    }
  }
  const head = k.pivot(torso, V(0, 0.5, 0.07));
  k.mesh(head, boulder(0.095, 1.1, 0.8, 1), rock);
  for (const s of [-1, 1]) k.mesh(head, new THREE.BoxGeometry(0.035, 0.012, 0.01), glowMat, V(s * 0.035, 0.0, 0.085));
  const arms = ([-1, 1] as const).map((s) => {
    const g = k.pivot(torso, V(s * 0.3, 0.38, 0));
    k.mesh(g, boulder(0.09, 1, 1.3, 1), rock, V(s * 0.03, -0.12, 0));
    k.mesh(g, boulder(0.11, 1, 1.3, 1), rock, V(s * 0.05, -0.3, 0.03));
    k.mesh(g, boulder(0.12), rock, V(s * 0.05, -0.47, 0.05)); // 大きなこぶし
    return g;
  });
  const rig: Rig = {
    height: 1.12,
    shadow: 0.42,
    animate(t, walk, walking) {
      const step = walking ? Math.sin(walk * 6) : 0;
      legs[0]!.rotation.x = step * 0.35;
      legs[1]!.rotation.x = -step * 0.35;
      arms[0]!.rotation.x = -step * 0.3;
      arms[1]!.rotation.x = step * 0.3;
      torso.rotation.z = step * 0.06; // 重い体を左右に揺らして歩く
      torso.position.y = 0.45 - Math.abs(step) * 0.015;
      head.rotation.y = walking ? 0 : Math.sin(t * 0.4) * 0.2;
      core.scale.setScalar(0.32 + Math.sin(t * 2) * 0.05);
    },
  };
  return ice ? scaled(body, rig, 1.55) : rig;
}

// ===== 甲冑 =====

/** 中身のない、ひとりでに動く聖なる甲冑。銀に金の縁取りの鎧の部品が、少しずつ離れて浮かび、兜の奥が光る。剣と盾を持つ。
 *  guardian（光の守護者）なら大きく、光の翼と頭上の光の輪、剣の代わりに槍 */
function armor(k: Kit, body: THREE.Group, guardian: boolean): Rig {
  const steel = k.skin(0x6e7076, { shine: 60, specular: 0x8a8a8a, bump: 0.012 });
  const gold = k.skin(0x7a5e22, { shine: 70, specular: 0xb89850 });
  const voidMat = k.skin(0x050608);
  const light = k.glow(0xfff2c0);
  const cloth = k.skin(0x8a8270, { double: true, bump: 0.03 });
  const parts: THREE.Group[] = []; // 浮かぶ部品（ばらばらに上下させる）
  const part = (parent: THREE.Object3D, at: THREE.Vector3) => {
    const g = k.pivot(parent, at);
    parts.push(g);
    return g;
  };
  const legs = ([-1, 1] as const).map((s) => {
    const g = k.pivot(body, V(s * 0.085, 0.45, 0));
    const thigh = part(g, V(0, -0.11, 0.01));
    k.mesh(thigh, limb(V(0, 0.08, 0), V(0, -0.08, 0.02), 0.06, 0.05), steel);
    const knee = part(g, V(0, -0.22, 0.04));
    k.mesh(knee, ellipsoid(0.048, 0.04, 0.045), gold);
    const shin = part(g, V(0, -0.33, 0.0));
    k.mesh(shin, limb(V(0, 0.08, 0), V(0, -0.08, 0), 0.05, 0.042), steel);
    k.mesh(shin, roughen(ellipsoid(0.045, 0.03, 0.08), 0.002, 40), steel, V(0, -0.1, 0.03));
    return g;
  });
  const torso = k.pivot(body, V(0, 0.48, 0));
  const skirt = part(torso, V(0, -0.02, 0));
  k.mesh(skirt, tatter(new THREE.LatheGeometry([P(0.16, -0.16), P(0.14, -0.02), P(0.12, 0.04)], 20), 0.05, 6), cloth); // 腰布
  const cuirass = part(torso, V(0, 0.22, 0));
  k.mesh(cuirass, ellipsoid(0.16, 0.18, 0.12), steel);
  k.mesh(cuirass, new THREE.TorusGeometry(0.14, 0.012, 6, 24).rotateX(Math.PI / 2).scale(1, 1, 0.75), gold, V(0, -0.14, 0));
  k.mesh(cuirass, new THREE.BoxGeometry(0.02, 0.16, 0.01), gold, V(0, 0.02, 0.12)); // 胸の十字
  k.mesh(cuirass, new THREE.BoxGeometry(0.1, 0.02, 0.01), gold, V(0, 0.05, 0.12));
  k.mesh(cuirass, ellipsoid(0.1, 0.05, 0.07), voidMat, V(0, 0.17, 0)); // 首の穴の暗がり
  for (const s of [-1, 1]) {
    const pad = part(torso, V(s * 0.19, 0.36, 0));
    k.mesh(pad, new THREE.SphereGeometry(0.085, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), steel);
    k.mesh(pad, new THREE.TorusGeometry(0.08, 0.008, 6, 20).rotateX(Math.PI / 2), gold, V(0, 0.005, 0));
  }
  const helm = part(torso, V(0, 0.5, 0.01));
  k.mesh(helm, new THREE.CylinderGeometry(0.075, 0.08, 0.12, 18), steel);
  k.mesh(helm, new THREE.SphereGeometry(0.075, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), steel, V(0, 0.06, 0));
  k.mesh(helm, new THREE.BoxGeometry(0.1, 0.014, 0.02), voidMat, V(0, 0.02, 0.072)); // のぞき穴
  k.mesh(helm, new THREE.BoxGeometry(0.07, 0.008, 0.01), light, V(0, 0.02, 0.078)); // 奥の光
  k.mesh(helm, new THREE.BoxGeometry(0.012, 0.09, 0.14), gold, V(0, 0.12, -0.01)); // とさか
  const arms = ([-1, 1] as const).map((s) => {
    const g = k.pivot(torso, V(s * 0.2, 0.32, 0));
    const upper = part(g, V(s * 0.03, -0.1, 0.01));
    k.mesh(upper, limb(V(0, 0.07, 0), V(0, -0.07, 0.01), 0.045, 0.04), steel);
    const fore = part(g, V(s * 0.05, -0.27, 0.06));
    k.mesh(fore, limb(V(0, 0.07, -0.02), V(0, -0.07, 0.03), 0.042, 0.04), steel);
    k.mesh(fore, ellipsoid(0.04, 0.035, 0.045), steel, V(0, -0.1, 0.04));
    return { g, hand: fore };
  });
  // 右手（-x）：剣（守護者は槍）。左手（+x）：盾
  const weapon = k.pivot(arms[0]!.hand, V(0, -0.1, 0.05));
  if (guardian) {
    k.mesh(weapon, limb(V(0, -0.35, 0), V(0, 0.55, 0), 0.012, 0.012, 8), gold);
    k.mesh(weapon, new THREE.OctahedronGeometry(0.04, 0).scale(0.6, 2, 0.25), steel, V(0, 0.62, 0));
    k.glowSprite(weapon, 'rgba(255,240,190,0.8)', 0.18, V(0, 0.62, 0));
  } else {
    weapon.rotation.x = 0.9;
    k.mesh(weapon, limb(V(0, -0.04, 0), V(0, 0.05, 0), 0.012, 0.012, 8), gold);
    k.mesh(weapon, new THREE.BoxGeometry(0.12, 0.018, 0.025), gold, V(0, 0.05, 0));
    k.mesh(weapon, new THREE.BoxGeometry(0.035, 0.42, 0.008), steel, V(0, 0.27, 0));
  }
  const shield = k.pivot(arms[1]!.hand, V(0.02, -0.03, 0.07));
  const kite = new THREE.Shape();
  kite.moveTo(-0.1, 0.12);
  kite.lineTo(0.1, 0.12);
  kite.quadraticCurveTo(0.1, -0.08, 0, -0.2);
  kite.quadraticCurveTo(-0.1, -0.08, -0.1, 0.12);
  k.mesh(shield, new THREE.ExtrudeGeometry(kite, { depth: 0.02, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.006, bevelSegments: 2 }), steel); // 前（+z）へ向ける
  k.mesh(shield, new THREE.BoxGeometry(0.03, 0.22, 0.012), gold, V(0, -0.02, 0.03));
  k.mesh(shield, new THREE.BoxGeometry(0.14, 0.03, 0.012), gold, V(0, 0.04, 0.03));
  const glows: THREE.Sprite[] = [];
  const wings: THREE.Group[] = [];
  if (guardian) {
    glows.push(k.glowSprite(helm, 'rgba(255,235,170,0.7)', 0.12, V(0, 0.2, 0)));
    k.mesh(helm, new THREE.TorusGeometry(0.08, 0.008, 6, 28).rotateX(Math.PI / 2), light, V(0, 0.22, 0)); // 頭上の光の輪
    const feather = k.skin(0xfff4d8, { double: true, emissive: 0x6a5a30, opacity: 0.8 });
    for (const s of [-1, 1] as const) {
      const w = k.pivot(torso, V(s * 0.08, 0.32, -0.12));
      w.rotation.set(0.35, s * 0.4, s * 0.35);
      for (let i = 0; i < 7; i++) {
        const len = 0.5 - i * 0.05;
        const f = k.mesh(w, ellipsoid(0.04, len / 2, 0.006, 10, 8).translate(0, len / 2, 0), feather);
        f.rotation.z = -s * (0.25 + i * 0.22);
      }
      wings.push(w);
    }
  }
  const rig: Rig = {
    height: guardian ? 1.2 : 1.16,
    shadow: 0.3,
    animate(t, walk, walking) {
      const step = walking ? Math.sin(walk * 8) : 0;
      legs[0]!.rotation.x = step * 0.45;
      legs[1]!.rotation.x = -step * 0.45;
      arms[0]!.g.rotation.x = -0.2 - step * 0.25;
      arms[1]!.g.rotation.x = -0.4 + step * 0.2;
      torso.position.y = 0.48 + Math.abs(step) * 0.015;
      // 中身がないので、部品がそれぞれ少しずつ浮き沈みする
      parts.forEach((p, i) => {
        p.userData.base ??= p.position.y;
        p.position.y = (p.userData.base as number) + Math.sin(t * 2.1 + i * 1.3) * 0.006;
      });
      wings.forEach((w, i) => (w.rotation.z = (i ? 1 : -1) * (0.35 + Math.sin(t * 1.5) * 0.08)));
      glows.forEach((g) => g.scale.setScalar(0.12 + Math.sin(t * 2) * 0.02));
    },
  };
  return guardian ? scaled(body, rig, 1.45) : rig;
}

// ===== そのほか =====

/** 溶岩トカゲ：黒い玄武岩のような鱗の、地をはう大トカゲ。腹と背の割れ目から溶岩が光る */
function lavaLizard(k: Kit, body: THREE.Group): Rig {
  const scale = k.skin(0x3c322c, { bump: 0.05, shine: 20, specular: 0x4a3e36, emissive: 0x200800 });
  const lava = k.glow(0xff5a18);
  const eye = k.glow(0xffd040);
  const torso = k.pivot(body, V(0, 0.14, 0));
  k.mesh(torso, roughen(ellipsoid(0.13, 0.075, 0.24), 0.012, 16), scale);
  k.mesh(torso, ellipsoid(0.09, 0.02, 0.18), lava, V(0, -0.055, 0)); // 腹の溶岩
  for (let i = 0; i < 6; i++) {
    k.mesh(torso, spike(V(0, 0.06, 0.16 - i * 0.065), V(0, 0.12, 0.13 - i * 0.065), 0.022), scale);
    k.mesh(torso, limb(V(-0.07, 0.065, 0.14 - i * 0.06), V(0.07, 0.065, 0.12 - i * 0.06), 0.005, 0.005, 5), lava); // 背の割れ目
  }
  const head = k.pivot(torso, V(0, 0.01, 0.24));
  k.mesh(head, roughen(ellipsoid(0.075, 0.045, 0.1), 0.006, 25), scale, V(0, 0, 0.06));
  k.mesh(head, ellipsoid(0.055, 0.012, 0.07), lava, V(0, -0.022, 0.09)); // 口の奥の光
  for (const s of [-1, 1]) {
    k.mesh(head, ellipsoid(0.016, 0.012, 0.016), eye, V(s * 0.055, 0.025, 0.07));
    k.mesh(head, spike(V(s * 0.04, 0.03, 0.02), V(s * 0.07, 0.06, -0.04), 0.014), scale);
  }
  const legs = [
    [-1, 0.13],
    [1, 0.13],
    [-1, -0.13],
    [1, -0.13],
  ].map(([s, z]) => {
    const g = k.pivot(torso, V(s! * 0.11, -0.01, z!));
    chain(k, g, [V(0, 0, 0), V(s! * 0.065, 0.0, 0.01), V(s! * 0.085, -0.12, 0.03)], [0.038, 0.03, 0.022], scale);
    for (const f of [-1, 0, 1]) k.mesh(g, spike(V(s! * 0.085, -0.125, 0.03), V(s! * (0.095 + f * 0.012), -0.13, 0.075), 0.007), scale);
    return g;
  });
  // 尻尾：先へ行くほど細くなる節。節ごとに少しずつ曲げて、うねらせる
  const tail: THREE.Group[] = [];
  let parent: THREE.Object3D = torso;
  let at = V(0, 0, -0.22);
  for (let i = 0; i < 6; i++) {
    const g = k.pivot(parent, at);
    const r = 0.06 * (1 - i / 6.5);
    k.mesh(g, limb(V(0, 0, 0), V(0, -0.008, -0.08), r, r * 0.85, 10), scale);
    tail.push(g);
    parent = g;
    at = V(0, -0.008, -0.08);
  }
  return {
    height: 0.32,
    shadow: 0.36,
    animate(t, walk, walking) {
      const run = walk * 10;
      legs.forEach((g, i) => (g.rotation.y = walking ? Math.sin(run + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.5 : 0));
      torso.rotation.y = walking ? Math.sin(run) * 0.12 : 0;
      head.rotation.y = walking ? -Math.sin(run) * 0.15 : Math.sin(t * 0.5) * 0.25;
      tail.forEach((g, i) => (g.rotation.y = Math.sin((walking ? run : t * 1.2) - i * 0.6) * (walking ? 0.25 : 0.12)));
    },
  };
}

/** 氷のスライム：透き通った氷の塊。中に暗い核が透け、上には凍った結晶が突き出す。ぷるぷると伸び縮みして弾む */
function iceSlime(k: Kit, body: THREE.Group): Rig {
  const jelly = k.skin(0x6aa8cc, { shine: 110, specular: 0xffffff, opacity: 0.72, emissive: 0x08202c });
  const core = k.skin(0x1a3a52, { shine: 30 });
  const crystal = k.skin(0xd8f4ff, { shine: 100, specular: 0xffffff, opacity: 0.88, emissive: 0x10283a });
  const eye = k.glow(0xe8fbff);
  const blob = k.pivot(body, V(0, 0, 0));
  k.mesh(blob, roughen(new THREE.SphereGeometry(0.26, 32, 20).scale(1, 0.8, 0.95).translate(0, 0.2, 0), 0.018, 9), jelly);
  k.mesh(blob, roughen(ellipsoid(0.09, 0.08, 0.08), 0.01, 20), core, V(0.02, 0.18, -0.02));
  for (const [x, z, h, rx, rz] of [[0.05, 0.02, 0.16, 0.1, -0.2], [-0.08, -0.05, 0.12, -0.2, 0.35], [0.12, -0.08, 0.1, -0.3, -0.5], [-0.02, -0.12, 0.13, -0.5, 0.1]]) {
    k.mesh(blob, new THREE.OctahedronGeometry(0.04, 0).scale(0.7, h! / 0.04, 0.7).rotateX(rx!).rotateZ(rz!), crystal, V(x!, 0.38, z!));
  }
  k.eyes(blob, eye, 0.07, 0.27, 0.22, 0.02, 0.8);
  return {
    height: 0.52,
    shadow: 0.3,
    animate(t, walk, walking) {
      const hop = walking ? Math.abs(Math.sin(walk * 7)) : 0;
      const squash = Math.sin(t * 1.4 * Math.PI * 2) * 0.05 * (walking ? 0.5 : 1) + (walking ? (0.5 - hop) * 0.12 : 0);
      blob.position.y = hop * 0.1;
      blob.scale.set(1 - squash * 0.5, 1 + squash, 1 - squash * 0.5);
    },
  };
}

/** 氷の甲虫：霜の付いた青い甲羅の大きな甲虫。頭には氷の角と大あご、6本の脚で歩く */
function iceBeetle(k: Kit, body: THREE.Group): Rig {
  const shell = k.skin(0x3a6a8a, { shine: 90, specular: 0xbfe8ff, bump: 0.01 });
  const chitin = k.skin(0x1a2a36, { shine: 40, specular: 0x506070, bump: 0.02 });
  const frost = k.skin(0xd8f4ff, { shine: 100, specular: 0xffffff, opacity: 0.85, emissive: 0x0e2232 });
  const eye = k.glow(0x9fe8ff);
  const torso = k.pivot(body, V(0, 0.17, 0));
  for (const s of [-1, 1]) {
    // 左右の甲羅（半分の楕円体）
    k.mesh(torso, new THREE.SphereGeometry(1, 20, 14, s > 0 ? 0 : Math.PI, Math.PI, 0, Math.PI / 2).scale(0.15, 0.13, 0.22), shell, V(s * 0.004, 0, -0.05));
  }
  k.mesh(torso, limb(V(0, 0.005, 0.17), V(0, 0.005, -0.27), 0.006, 0.004, 5), chitin); // 甲羅の合わせ目
  k.mesh(torso, ellipsoid(0.14, 0.05, 0.22), chitin, V(0, -0.01, -0.05)); // 腹
  k.mesh(torso, roughen(ellipsoid(0.11, 0.07, 0.07), 0.004, 30), shell, V(0, 0.01, 0.17)); // 前胸
  for (const [x, z] of [[0.06, -0.02], [-0.05, -0.1], [0.03, -0.17], [-0.08, 0.03]]) {
    k.mesh(torso, new THREE.OctahedronGeometry(0.025, 0).scale(0.8, 1.6, 0.8), frost, V(x!, 0.12, z!));
  }
  const head = k.pivot(torso, V(0, 0, 0.23));
  k.mesh(head, ellipsoid(0.06, 0.045, 0.05), chitin);
  k.mesh(head, new THREE.OctahedronGeometry(0.03, 0).scale(0.7, 3, 0.7).rotateX(0.7), frost, V(0, 0.07, 0.06)); // 氷の角
  const mandibles = ([-1, 1] as const).map((s) => {
    const g = k.pivot(head, V(s * 0.03, -0.02, 0.04));
    k.mesh(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, 0, 0), V(s * 0.03, 0, 0.05), V(-s * 0.005, 0, 0.09)]), 8, 0.008, 5), chitin);
    return g;
  });
  for (const s of [-1, 1]) {
    k.mesh(head, ellipsoid(0.014, 0.014, 0.012), eye, V(s * 0.045, 0.015, 0.03));
    k.mesh(head, limb(V(s * 0.03, 0.03, 0.04), V(s * 0.09, 0.08, 0.12), 0.004, 0.003, 4), chitin); // 触角
  }
  const legs = [-1, 1].flatMap((s) =>
    [0.1, -0.02, -0.14].map((z, i) => {
      const g = k.pivot(torso, V(s * 0.11, -0.03, z));
      g.userData.phase = (i % 2 === 0 ? 0 : Math.PI) + (s > 0 ? Math.PI : 0); // 3本ずつ交互に動かす
      chain(k, g, [V(0, 0, 0), V(s * 0.08, 0.04, (i - 1) * -0.02), V(s * 0.12, -0.14, (i - 1) * -0.05)], [0.022, 0.017, 0.009], chitin);
      return g;
    }),
  );
  return {
    height: 0.4,
    shadow: 0.3,
    animate(t, walk, walking) {
      const run = walk * 14;
      legs.forEach((g) => (g.rotation.y = walking ? Math.sin(run + (g.userData.phase as number)) * 0.35 : 0));
      torso.position.y = 0.17 + (walking ? Math.abs(Math.sin(run)) * 0.008 : 0);
      mandibles.forEach((g, i) => (g.rotation.y = (i ? -1 : 1) * Math.max(0, Math.sin(t * 3)) * 0.3));
      head.rotation.y = walking ? 0 : Math.sin(t * 0.7) * 0.15;
    },
  };
}

/** 光の鳥：金色に光る羽の大きな鳥。上から見ても羽がよく見えるよう、羽は水平に広げて羽ばたく */
function lightBird(k: Kit, body: THREE.Group): Rig {
  const plume = k.skin(0xe8d8a8, { emissive: 0x3a2c10, shine: 20, double: true, bump: 0.01 });
  const gold = k.skin(0xb8902a, { shine: 80, specular: 0xffe0a0 });
  const eye = k.glow(0xffffff);
  const fly = k.pivot(body, V(0, 0.55, 0));
  k.mesh(fly, roughen(ellipsoid(0.075, 0.075, 0.17), 0.006, 24), plume);
  k.mesh(fly, limb(V(0, 0.03, 0.12), V(0, 0.12, 0.2), 0.045, 0.03), plume); // 長い首
  const head = k.pivot(fly, V(0, 0.14, 0.22));
  k.mesh(head, ellipsoid(0.04, 0.04, 0.05), plume);
  k.mesh(head, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, 0, 0.04), V(0, -0.005, 0.09), V(0, -0.03, 0.11)]), 8, 0.011, 6), gold); // 鉤のくちばし
  k.eyes(head, eye, 0.028, 0.012, 0.03, 0.009, 0.7);
  for (let i = 0; i < 3; i++) k.mesh(head, spike(V(0, 0.03, -0.01 - i * 0.015), V(0, 0.1 - i * 0.015, -0.07 - i * 0.03), 0.009), gold); // 冠羽
  // 羽：幅のある長い羽根を扇のように並べる
  const wings = ([1, -1] as const).map((s) => {
    const w = k.pivot(fly, V(s * 0.06, 0.03, 0.04));
    for (let i = 0; i < 9; i++) {
      const len = 0.5 - Math.abs(i - 2) * 0.045;
      const f = k.mesh(w, ellipsoid(len / 2, 0.005, 0.055, 12, 6).translate((s * len) / 2, 0, 0), plume);
      f.rotation.y = s * (0.1 - i * 0.11);
    }
    return w;
  });
  // 長く垂れる尾羽
  const tail = k.pivot(fly, V(0, 0, -0.15));
  for (let i = -2; i <= 2; i++) {
    const len = 0.34 - Math.abs(i) * 0.05;
    const f = k.mesh(tail, ellipsoid(0.03, 0.004, len / 2, 10, 6).translate(0, 0, -len / 2), plume);
    f.rotation.set(0.25, i * 0.18, 0);
  }
  const halo = k.glowSprite(fly, 'rgba(255,230,160,0.55)', 0.8);
  for (const s of [-1, 1]) k.mesh(fly, spike(V(s * 0.04, -0.08, 0.02), V(s * 0.05, -0.17, 0.04), 0.01), gold); // 脚
  return {
    height: 0.82,
    shadow: 0.34,
    animate(t, _walk, walking) {
      const flap = Math.sin(t * (walking ? 10 : 5));
      wings[0]!.rotation.z = 0.1 + flap * 0.55;
      wings[1]!.rotation.z = -0.1 - flap * 0.55;
      fly.position.y = 0.55 - flap * 0.03;
      fly.rotation.x = walking ? 0.25 : 0;
      tail.rotation.x = Math.sin(t * 1.3) * 0.1;
      head.rotation.y = Math.sin(t * 0.8) * 0.3;
      halo.scale.setScalar(0.8 + Math.sin(t * 2) * 0.06);
    },
  };
}

/** 光の精：まぶしい核を、透ける光の殻と、まわりを回る小さな光の粒が包む。すそは炎のように細く尾を引く */
function lightWisp(k: Kit, body: THREE.Group): Rig {
  const coreMat = k.glow(0xfff6dc);
  const shell = k.skin(0xffe9b0, { opacity: 0.35, emissive: 0x6a5420, shine: 60, specular: 0xffffff });
  const float = k.pivot(body, V(0, 0.42, 0));
  k.mesh(float, ellipsoid(0.07, 0.07, 0.07, 16, 12), coreMat);
  k.mesh(float, roughen(new THREE.SphereGeometry(0.16, 24, 16).scale(1, 1.15, 1), 0.01, 12), shell);
  k.mesh(float, new THREE.ConeGeometry(0.12, 0.3, 16, 1, true).rotateX(Math.PI).translate(0, -0.2, 0), shell); // 尾
  const glow = k.glowSprite(float, 'rgba(255,240,200,0.9)', 0.6);
  const outer = k.glowSprite(float, 'rgba(255,220,140,0.35)', 1.1);
  const motes = Array.from({ length: 4 }, (_, i) => {
    const g = k.pivot(float, V(0, 0, 0));
    g.rotation.z = i * 0.7;
    k.mesh(g, ellipsoid(0.018, 0.018, 0.018, 8, 6), coreMat, V(0.24, 0, 0));
    k.glowSprite(g, 'rgba(255,240,190,0.8)', 0.08, V(0.24, 0, 0));
    return g;
  });
  return {
    height: 0.7,
    shadow: 0.22,
    animate(t) {
      float.position.y = 0.42 + Math.sin(t * 1.8) * 0.05;
      motes.forEach((g, i) => (g.rotation.y = t * (1.2 + i * 0.3) + i * 1.6));
      glow.scale.setScalar(0.55 + Math.sin(t * 3) * 0.06);
      outer.scale.setScalar(1.05 + Math.sin(t * 1.7) * 0.08);
    },
  };
}

export const WORLD_BUILDERS = {
  ice_imp: (k, body) => imp(k, body, { skin: 0x46697f, dark: 0x22344a, membrane: 0x2c4862, eye: 0xbff6ff, fire: false }),
  fire_imp: (k, body) => imp(k, body, { skin: 0x5e2c1c, dark: 0x2e1610, membrane: 0x3a1610, eye: 0xffc040, fire: true }),
  flame_hound: (k, body) => hound(k, body, false),
  flame_beast: (k, body) => hound(k, body, true),
  lava_lizard: lavaLizard,
  goblin: (k, body) => brute(k, body, false),
  ogre_chief: (k, body) => brute(k, body, true),
  stone_golem: (k, body) => golem(k, body, false),
  ice_colossus: (k, body) => golem(k, body, true),
  holy_armor: (k, body) => armor(k, body, false),
  light_guardian: (k, body) => armor(k, body, true),
  ice_slime: iceSlime,
  ice_beetle: iceBeetle,
  light_bird: lightBird,
  light_wisp: lightWisp,
} satisfies Record<string, Builder>;
