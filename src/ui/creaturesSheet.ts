// 以前は設定画から作っていた7体の模型：トロル・溶岩スライム・岩鬼イワオ・レイス・イエティ・暗黒騎士・聖騎士。
// ほかの敵と見た目をそろえるため、設定画の特徴（形・色・持ち物）をもとに、形も色もプログラムで組む。
// 騎士の2体は同じ組み立て方（knight）で、鎧の色と持ち物を変える。

import * as THREE from 'three';
import { type Builder, chain, ellipsoid, flicker, type Kit, limb, P, pleat, type Rig, roughen, spike, tatter, V } from './creatureKit';

/** 岩：角の少ない球を大きく波打たせる（面を角ばらせる素材と組み合わせる） */
function boulderMaker() {
  let seed = 0;
  return (r: number, sx = 1, sy = 1, sz = 1) => roughen(new THREE.SphereGeometry(r, 9, 7).scale(sx, sy, sz), r * 0.2, 1.6 / r, ++seed * 1.37);
}

/** 毛むくじゃらの塊：表面を細かく大きめに波打たせる */
const shaggy = (rx: number, ry: number, rz: number, seed = 0) => roughen(roughen(ellipsoid(rx, ry, rz, 32, 24), Math.min(rx, ry, rz) * 0.12, 9 / Math.min(rx, ry, rz) * 0.1, seed), 0.006, 60, seed + 3);

/** 2本脚の歩き：脚と腕を交互に振る */
function swing(legs: THREE.Object3D[], arms: THREE.Object3D[], step: number, legAmp: number, armAmp: number, armBase: [number, number] = [0, 0]) {
  legs[0]!.rotation.x = step * legAmp;
  legs[1]!.rotation.x = -step * legAmp;
  arms[0]!.rotation.x = armBase[0] - step * armAmp;
  arms[1]!.rotation.x = armBase[1] + step * armAmp;
}

// ===== トロル =====

/** トロル：緑の肌の大きな体で、前かがみ。長い腕に、もつれた黒い髪と下あごの牙。
 *  左肩に錆びた鉄の肩当て、ぼろの革の腰巻き、右手に石を縛った木の棍棒を引きずる */
function troll(k: Kit, body: THREE.Group): Rig {
  const skin = k.skin(0x5c7040, { bump: 0.035, shine: 10, specular: 0x202a18 });
  const leather = k.skin(0x3a2a1c, { bump: 0.03 });
  const iron = k.skin(0x4e4740, { shine: 40, specular: 0x5a5048, bump: 0.02 });
  const hair = k.skin(0x1c1812, { bump: 0.03 });
  const tusk = k.skin(0xc8b890, { shine: 30 });
  const wood = k.skin(0x3e2a1a, { bump: 0.04 });
  const stone = k.skin(0x5c5a55, { shine: 4, flat: true });
  const rope = k.skin(0x5a4a34, { bump: 0.02 });
  const eye = k.glow(0xffb030);
  const legs = ([-1, 1] as const).map((s) => {
    const g = k.pivot(body, V(s * 0.12, 0.5, 0));
    chain(k, g, [V(0, 0, 0), V(s * 0.015, -0.24, 0.05), V(s * 0.015, -0.45, -0.01)], [0.085, 0.062, 0.05], skin);
    k.mesh(g, limb(V(s * 0.015, -0.3, 0.03), V(s * 0.015, -0.44, 0.0), 0.062, 0.066), leather); // 革のブーツ
    k.mesh(g, roughen(ellipsoid(0.065, 0.04, 0.1), 0.006, 25), leather, V(s * 0.015, -0.47, 0.035));
    return g;
  });
  const hips = k.pivot(body, V(0, 0.5, 0));
  k.mesh(hips, roughen(ellipsoid(0.19, 0.1, 0.15), 0.01, 14), skin, V(0, 0.02, 0));
  k.mesh(hips, tatter(new THREE.LatheGeometry([P(0.22, -0.24), P(0.2, -0.06), P(0.18, 0.06)], 22), 0.08, 7), leather); // 腰巻き
  k.mesh(hips, new THREE.TorusGeometry(0.185, 0.02, 6, 24).rotateX(Math.PI / 2), rope, V(0, 0.05, 0));
  const torso = k.pivot(hips, V(0, 0.04, 0));
  torso.rotation.x = 0.32; // 前かがみ
  k.mesh(torso, roughen(ellipsoid(0.19, 0.16, 0.16), 0.014, 12), skin, V(0, 0.12, 0.03)); // 腹
  k.mesh(torso, roughen(ellipsoid(0.25, 0.18, 0.16), 0.016, 12, 2), skin, V(0, 0.32, 0)); // 胸と肩
  k.mesh(torso, roughen(ellipsoid(0.16, 0.1, 0.1), 0.012, 14, 4), skin, V(0, 0.43, -0.05)); // 盛り上がった背中
  k.mesh(torso, limb(V(-0.22, 0.42, 0.05), V(0.17, 0.08, 0.13), 0.022, 0.022, 6), leather); // 斜めの革帯
  // 左肩（+x）：錆びた鉄板を重ねた肩当て
  const pad = k.pivot(torso, V(0.24, 0.42, 0));
  pad.rotation.z = -0.35;
  for (let i = 0; i < 3; i++) k.mesh(pad, new THREE.SphereGeometry(0.11 - i * 0.012, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, 0.7, 1.05), iron, V(i * 0.025, -i * 0.035, 0));
  for (const dz of [-0.04, 0.04]) k.mesh(pad, spike(V(0.0, 0.07, dz), V(0.03, 0.13, dz), 0.016), iron);
  const head = k.pivot(torso, V(0, 0.47, 0.11));
  head.rotation.x = -0.32; // 前かがみでも前を見る
  k.mesh(head, roughen(ellipsoid(0.1, 0.095, 0.1), 0.01, 20), skin, V(0, 0.04, 0));
  k.mesh(head, ellipsoid(0.085, 0.025, 0.035), skin, V(0, 0.065, 0.075)); // 眉のでっぱり
  k.mesh(head, roughen(ellipsoid(0.095, 0.055, 0.085), 0.006, 25), skin, V(0, -0.03, 0.04)); // 大きなあご
  k.mesh(head, ellipsoid(0.03, 0.03, 0.035), skin, V(0, 0.025, 0.1)); // つぶれた鼻
  for (const s of [-1, 1]) {
    k.mesh(head, spike(V(s * 0.05, -0.04, 0.1), V(s * 0.065, 0.03, 0.12), 0.016), tusk); // 下あごから上へ伸びる牙
    k.mesh(head, spike(V(s * 0.09, 0.04, 0), V(s * 0.15, 0.07, -0.04), 0.022), skin); // とがった耳
  }
  k.eyes(head, eye, 0.035, 0.04, 0.09, 0.012, 0.6);
  // もつれた長い髪：頭の上から背中へ垂れる房
  k.mesh(head, roughen(new THREE.SphereGeometry(0.108, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.45).rotateX(-0.5), 0.01, 25), hair, V(0, 0.05, -0.01));
  for (let i = 0; i < 9; i++) {
    const a = -1.3 + i * 0.32;
    const root = V(Math.sin(a) * 0.09, 0.08, -Math.cos(a) * 0.07);
    const tip = V(Math.sin(a) * 0.13, -0.18 - (i % 3) * 0.05, -Math.cos(a) * 0.1 - 0.05);
    k.mesh(head, limb(root, tip, 0.022, 0.006, 6), hair);
  }
  const arms = ([-1, 1] as const).map((s) => {
    const g = k.pivot(torso, V(s * 0.26, 0.38, 0));
    g.rotation.z = s * 0.12;
    chain(k, g, [V(0, 0, 0), V(s * 0.06, -0.24, 0.03), V(s * 0.07, -0.47, 0.07)], [0.075, 0.06, 0.055], skin);
    k.mesh(g, limb(V(s * 0.065, -0.29, 0.04), V(s * 0.07, -0.44, 0.065), 0.066, 0.064), iron); // 鉄の籠手
    k.mesh(g, roughen(ellipsoid(0.065, 0.07, 0.06), 0.006, 25), skin, V(s * 0.072, -0.53, 0.08));
    return g;
  });
  // 右手（-x）：石を縄で縛った木の棍棒を、下へ垂らして持つ
  const club = k.pivot(arms[0]!, V(-0.072, -0.54, 0.09));
  club.rotation.x = 0.35;
  k.mesh(club, limb(V(0, 0.06, 0), V(0, -0.4, 0), 0.022, 0.04, 10), wood);
  k.mesh(club, roughen(new THREE.SphereGeometry(0.07, 9, 7).scale(1, 1.3, 1), 0.015, 22, 5), stone, V(0, -0.38, 0));
  k.mesh(club, new THREE.TorusGeometry(0.045, 0.01, 6, 14).rotateX(Math.PI / 2), rope, V(0, -0.32, 0));
  return {
    height: 1.12,
    shadow: 0.36,
    animate(t, walk, walking) {
      const step = walking ? Math.sin(walk * 7) : 0;
      swing(legs, arms, step, 0.45, 0.3);
      club.rotation.x = 0.35 + step * 0.15;
      hips.position.y = 0.5 + (walking ? Math.abs(step) * 0.025 : 0);
      hips.rotation.z = step * 0.06;
      const breath = walking ? 0 : Math.sin(t * 1.8) * 0.02;
      torso.scale.set(1 + breath, 1 + breath * 0.5, 1 + breath);
      head.rotation.y = walking ? 0 : Math.sin(t * 0.5) * 0.3;
    },
  };
}

// ===== 溶岩スライム =====

/** 溶岩スライム：とろけた溶岩の塊。表面には冷えて黒く固まった殻が浮き、割れ目から中の溶岩が光る。
 *  目と口は奥の熱い溶岩で、明るく光る。足元に溶岩がたまる */
function lavaSlime(k: Kit, body: THREE.Group): Rig {
  const lava = k.skin(0xff6418, { emissive: 0xb02a00, shine: 70, specular: 0xffc080, bump: 0.02 });
  const crust = k.skin(0x221a16, { shine: 12, specular: 0x302018, flat: true });
  const hot = k.glow(0xffe070);
  const blob = k.pivot(body, V(0, 0, 0));
  k.mesh(blob, roughen(new THREE.SphereGeometry(0.29, 36, 24).scale(1, 1.08, 0.95).translate(0, 0.27, 0), 0.03, 7), lava);
  k.mesh(blob, roughen(ellipsoid(0.38, 0.05, 0.35, 32, 10), 0.02, 8, 3), lava, V(0, 0.03, -0.01)); // 足元の溜まり
  // 冷えて固まった殻：背中と頭に多く、顔のまわりはあける
  const boulder = boulderMaker();
  for (let i = 0; i < 26; i++) {
    const a = i * 2.4 + 0.3; // まわりの向き（0 が正面）
    const e = 0.1 + ((i * 0.37) % 1) * 1.2; // 高さの角度
    if (Math.cos(a) > 0.55 && e < 1.0) continue; // 顔の前はあける
    const r = 0.28 * Math.cos(e);
    const at = V(Math.sin(a) * r, 0.27 + Math.sin(e) * 0.3, Math.cos(a) * r * 0.95);
    const size = 0.028 + ((i * 0.53) % 1) * 0.03;
    const m = k.mesh(blob, boulder(size, 1.4, 0.4, 1.4), crust, at);
    m.lookAt(at.clone().multiplyScalar(2).setY(at.y * 2 - 0.27));
    m.rotateX(Math.PI / 2);
  }
  // 顔：つり上がった目と、ぎざぎざの大きな口
  for (const s of [-1, 1]) {
    k.mesh(blob, ellipsoid(0.05, 0.025, 0.03).rotateZ(-s * 0.35), hot, V(s * 0.085, 0.38, 0.255));
  }
  const mouth = k.mesh(blob, roughen(ellipsoid(0.12, 0.04, 0.035, 20, 10), 0.008, 30), hot, V(0, 0.24, 0.265));
  for (let i = -2; i <= 2; i++) k.mesh(blob, spike(V(i * 0.045, 0.275, 0.28), V(i * 0.045, 0.245, 0.29), 0.012), crust); // 牙のような殻
  // したたる溶岩
  for (const [x, z] of [[0.24, 0.08], [-0.22, 0.12], [0.1, -0.24], [-0.15, -0.2]]) k.mesh(blob, ellipsoid(0.03, 0.06, 0.03), lava, V(x!, 0.1, z!));
  const glow = k.glowSprite(blob, 'rgba(255,120,30,0.6)', 1.0, V(0, 0.3, 0));
  return {
    height: 0.66,
    shadow: 0.38,
    animate(t, walk, walking) {
      const hop = walking ? Math.abs(Math.sin(walk * 6)) : 0;
      const squash = Math.sin(t * 1.2 * Math.PI * 2) * 0.04 * (walking ? 0.5 : 1) + (walking ? (0.5 - hop) * 0.1 : 0);
      blob.position.y = hop * 0.06;
      blob.scale.set(1 - squash * 0.5, 1 + squash, 1 - squash * 0.5);
      mouth.scale.y = 1 + Math.sin(t * 2.3) * 0.25;
      glow.scale.setScalar(1.0 * flicker(t * 0.4, 0));
    },
  };
}

// ===== 岩鬼イワオ =====

/** 岩鬼イワオ：黒い岩でできた、鬼のような大男。肩と腕から錆びた鉄のとげが突き出し、岩の割れ目と背中の文字が赤く光る。
 *  頭は肩のあいだに低く埋まり、腰には革の前垂れ */
function iwao(k: Kit, body: THREE.Group): Rig {
  const rock = k.skin(0x3c3834, { shine: 8, bump: 0.04, flat: true });
  const rust = k.skin(0x6a3a1e, { shine: 25, specular: 0x5a3020, bump: 0.03 });
  const leather = k.skin(0x2e2218, { bump: 0.03, double: true });
  const ember = k.glow(0xff6a20);
  const boulder = boulderMaker();
  const crack = (parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) => k.mesh(parent, limb(a, b, 0.006, 0.004, 5), ember);
  const legs = ([-1, 1] as const).map((s) => {
    const g = k.pivot(body, V(s * 0.14, 0.48, 0));
    k.mesh(g, boulder(0.12, 1, 1.15, 1), rock, V(0, -0.1, 0));
    k.mesh(g, boulder(0.11, 1, 1.2, 1), rock, V(0, -0.29, 0.02));
    k.mesh(g, boulder(0.1, 1.2, 0.6, 1.5), rock, V(0, -0.42, 0.05));
    crack(g, V(s * 0.1, -0.24, 0.07), V(s * 0.09, -0.33, 0.09));
    return g;
  });
  const torso = k.pivot(body, V(0, 0.5, 0));
  k.mesh(torso, boulder(0.17, 1.15, 0.8, 0.9), rock, V(0, 0.03, 0));
  k.mesh(torso, boulder(0.27, 1.1, 0.8, 0.75), rock, V(0, 0.32, 0));
  k.mesh(torso, tatter(new THREE.CylinderGeometry(0.1, 0.12, 0.3, 10, 4, true, -0.6, 1.2), 0.06, 5), leather, V(0, -0.1, 0.02)); // 前垂れ
  // 胸の割れ目の光
  crack(torso, V(-0.08, 0.42, 0.2), V(0.02, 0.3, 0.21));
  crack(torso, V(0.02, 0.3, 0.21), V(0.1, 0.36, 0.2));
  crack(torso, V(0.02, 0.3, 0.21), V(-0.01, 0.18, 0.2));
  // 背中の赤く光る文字
  k.mesh(torso, new THREE.BoxGeometry(0.02, 0.16, 0.01), ember, V(-0.03, 0.34, -0.205));
  k.mesh(torso, new THREE.TorusGeometry(0.035, 0.009, 4, 10, Math.PI * 1.2).rotateZ(-0.6), ember, V(0.0, 0.38, -0.205));
  k.mesh(torso, new THREE.BoxGeometry(0.018, 0.09, 0.01).rotateZ(0.6), ember, V(0.02, 0.3, -0.205));
  k.glowSprite(torso, 'rgba(255,90,30,0.55)', 0.3, V(0, 0.34, -0.24));
  // 肩：大きな岩に錆びたとげ
  for (const s of [-1, 1]) {
    k.mesh(torso, boulder(0.14), rock, V(s * 0.3, 0.46, 0));
    for (const [dx, dz, ang] of [[0, 0, 0], [0.04, -0.06, 0.4], [-0.03, 0.06, -0.3]]) {
      k.mesh(torso, spike(V(s * (0.32 + dx!), 0.55, dz!), V(s * (0.37 + dx!), 0.68, dz! + ang! * 0.1), 0.025), rust);
    }
  }
  for (let i = 0; i < 4; i++) k.mesh(torso, spike(V(0, 0.5 - i * 0.09, -0.17), V(0, 0.55 - i * 0.09, -0.27), 0.022), rust); // 背骨のとげ
  const head = k.pivot(torso, V(0, 0.5, 0.1));
  k.mesh(head, boulder(0.1, 1.05, 0.85, 1), rock);
  k.mesh(head, boulder(0.07, 1.3, 0.6, 1), rock, V(0, -0.05, 0.05)); // あご
  for (const s of [-1, 1]) {
    k.mesh(head, new THREE.BoxGeometry(0.035, 0.012, 0.01).rotateZ(s * 0.25), ember, V(s * 0.035, 0.01, 0.09)); // 怒った目
    k.mesh(head, spike(V(s * 0.06, 0.06, 0), V(s * 0.09, 0.13, -0.03), 0.02), rust); // 角
  }
  const arms = ([-1, 1] as const).map((s) => {
    const g = k.pivot(torso, V(s * 0.32, 0.4, 0));
    k.mesh(g, boulder(0.1, 1, 1.3, 1), rock, V(s * 0.03, -0.13, 0));
    k.mesh(g, boulder(0.115, 1, 1.3, 1), rock, V(s * 0.05, -0.32, 0.03));
    for (const dy of [-0.26, -0.34]) k.mesh(g, spike(V(s * 0.13, dy, 0.03), V(s * 0.21, dy + 0.03, 0.0), 0.02), rust); // 腕のとげ
    k.mesh(g, boulder(0.12), rock, V(s * 0.05, -0.49, 0.05)); // こぶし
    crack(g, V(s * 0.12, -0.12, 0.05), V(s * 0.11, -0.2, 0.07));
    return g;
  });
  return {
    height: 1.2,
    shadow: 0.42,
    animate(t, walk, walking) {
      const step = walking ? Math.sin(walk * 6) : 0;
      swing(legs, arms, step, 0.35, 0.3);
      torso.rotation.z = step * 0.06;
      torso.position.y = 0.5 - Math.abs(step) * 0.015;
      head.rotation.y = walking ? 0 : Math.sin(t * 0.4) * 0.25;
    },
  };
}

// ===== レイス =====

/** レイス：ぼろぼろのフード付きの外套が宙に浮かぶ悪霊。すそは煙のように細く裂け、骨の腕を左右に広げる。
 *  フードの奥で青い目が光り、左手に青い結晶の付いた杖を持つ */
function wraith(k: Kit, body: THREE.Group): Rig {
  const robe = k.skin(0x2c2840, { double: true, opacity: 0.9, emissive: 0x08060e, bump: 0.03 });
  const mist = k.skin(0x2a2c48, { double: true, opacity: 0.3, emissive: 0x0c1020 });
  const dark = k.skin(0x040408);
  const bone = k.skin(0x8a8a80, { shine: 20, bump: 0.01 });
  const wood = k.skin(0x2a2018, { bump: 0.03 });
  const eye = k.glow(0x8fe0ff);
  const crystal = k.glow(0x9ff0ff);
  const float = k.pivot(body, V(0, 0.1, 0));
  const hem = tatter(new THREE.LatheGeometry([P(0.24, 0), P(0.22, 0.2), P(0.17, 0.45), P(0.14, 0.65), P(0.17, 0.74), P(0.08, 0.8)], 28), 0.2, 11);
  const robeMesh = k.mesh(float, roughen(pleat(hem, 0.025, 11), 0.012, 12), robe);
  // 肩にかかる、ぼろぼろの肩掛け
  k.mesh(float, tatter(roughen(new THREE.LatheGeometry([P(0.3, 0.55), P(0.24, 0.68), P(0.12, 0.8)], 24), 0.012, 14, 2), 0.08, 9), robe);
  // すその下の、煙のような尾
  const wisps = [0, 1, 2, 3, 4].map((i) => {
    const a = i * 1.26;
    const m = k.mesh(float, new THREE.ConeGeometry(0.06, 0.32, 8, 1, true).rotateX(Math.PI).translate(0, -0.12, 0), mist, V(Math.sin(a) * 0.13, 0.04, Math.cos(a) * 0.13));
    return m;
  });
  const hood = k.pivot(float, V(0, 0.87, 0.02));
  k.mesh(hood, roughen(new THREE.SphereGeometry(0.13, 24, 16, Math.PI * 0.7, Math.PI * 1.6, 0, Math.PI * 0.78).scale(1, 1.2, 1.15), 0.01, 20), robe);
  k.mesh(hood, spike(V(0, 0.1, -0.05), V(0, 0.2, -0.16), 0.05), robe); // とがったフードの先
  k.mesh(hood, ellipsoid(0.105, 0.12, 0.1), dark, V(0, -0.01, 0));
  k.eyes(hood, eye, 0.03, 0.0, 0.1, 0.017, 0.5);
  const eyeGlow = k.glowSprite(hood, 'rgba(120,210,255,0.6)', 0.2, V(0, 0, 0.11));
  const arms = ([-1, 1] as const).map((s) => {
    const g = k.pivot(float, V(s * 0.16, 0.72, 0));
    g.rotation.z = s * 0.2;
    // 裂けた袖と、骨の腕
    k.mesh(g, tatter(limb(V(0, 0, 0), V(s * 0.24, -0.1, 0.06), 0.05, 0.085, 12), 0.05, 5), robe);
    chain(k, g, [V(s * 0.22, -0.09, 0.06), V(s * 0.32, -0.14, 0.08)], [0.014, 0.012], bone);
    for (const f of [-1, 0, 1]) k.mesh(g, limb(V(s * 0.32, -0.14, 0.08), V(s * 0.38, -0.2, 0.08 + f * 0.03), 0.007, 0.003, 5), bone);
    return g;
  });
  // 左手（+x）の杖
  const staff = k.pivot(arms[1]!, V(0.33, -0.15, 0.08));
  staff.rotation.z = -0.2;
  k.mesh(staff, limb(V(0, -0.45, 0), V(0, 0.4, 0), 0.012, 0.016, 8), wood);
  for (const s of [-1, 1]) k.mesh(staff, spike(V(0, 0.38, 0), V(s * 0.05, 0.47, 0), 0.01), wood); // 結晶を抱える枝
  k.mesh(staff, new THREE.OctahedronGeometry(0.04, 0).scale(0.7, 1.6, 0.7), crystal, V(0, 0.47, 0));
  const staffGlow = k.glowSprite(staff, 'rgba(140,230,255,0.85)', 0.3, V(0, 0.47, 0));
  const aura = k.glowSprite(float, 'rgba(90,110,200,0.3)', 1.1, V(0, 0.4, 0));
  return {
    height: 1.14,
    shadow: 0.34,
    animate(t, _walk, walking) {
      float.position.y = 0.1 + Math.sin(t * 1.4) * 0.04;
      float.rotation.x += ((walking ? 0.18 : 0) - float.rotation.x) * 0.1;
      robeMesh.rotation.y = Math.sin(t * 0.8) * 0.1;
      wisps.forEach((w, i) => (w.scale.y = 0.8 + Math.sin(t * 2 + i * 1.7) * 0.25));
      hood.rotation.z = Math.sin(t * 0.7) * 0.06;
      arms.forEach((g, i) => (g.rotation.x = -0.1 + Math.sin(t * 1.1 + i * Math.PI) * 0.12));
      staffGlow.scale.setScalar(0.3 * flicker(t * 0.5, 1));
      eyeGlow.scale.setScalar(0.2 + Math.sin(t * 3) * 0.03);
      aura.scale.setScalar(1.1 + Math.sin(t * 1.3) * 0.08);
    },
  };
}

// ===== イエティ =====

/** イエティ：灰白色のもじゃもじゃの毛の大男。頭には巻いた羊のような角、灰色の顔に牙。
 *  左肩に錆びた鎧、とげの付いたベルトとぼろ布の腰巻き、籠手をはめた太い腕 */
function yeti(k: Kit, body: THREE.Group): Rig {
  const fur = k.skin(0xc4c8cc, { bump: 0.06, shine: 4, specular: 0x101418 });
  const furDark = k.skin(0x8a929a, { bump: 0.05, shine: 4 });
  const face = k.skin(0x56606a, { bump: 0.03, shine: 12 });
  const horn = k.skin(0x9a8a70, { bump: 0.04, shine: 20 });
  const metal = k.skin(0x4c4038, { shine: 40, specular: 0x5a5048, bump: 0.02 });
  const cloth = k.skin(0x3a3430, { bump: 0.03, double: true });
  const claw = k.skin(0x2a2622, { shine: 30 });
  const eye = k.glow(0x9fe8ff);
  const legs = ([-1, 1] as const).map((s) => {
    const g = k.pivot(body, V(s * 0.12, 0.46, 0));
    k.mesh(g, shaggy(0.1, 0.15, 0.1, s), fur, V(s * 0.01, -0.12, 0.02));
    k.mesh(g, shaggy(0.085, 0.13, 0.085, s + 5), fur, V(s * 0.01, -0.32, 0.0));
    k.mesh(g, roughen(ellipsoid(0.075, 0.04, 0.11), 0.008, 25), furDark, V(s * 0.01, -0.44, 0.04)); // 大きな足
    for (const f of [-1, 0, 1]) k.mesh(g, spike(V(s * 0.01 + f * 0.03, -0.45, 0.13), V(s * 0.01 + f * 0.035, -0.46, 0.17), 0.01), claw);
    return g;
  });
  const hips = k.pivot(body, V(0, 0.48, 0));
  k.mesh(hips, tatter(new THREE.LatheGeometry([P(0.2, -0.2), P(0.19, -0.05), P(0.17, 0.05)], 22), 0.07, 6), cloth);
  k.mesh(hips, new THREE.TorusGeometry(0.18, 0.025, 6, 24).rotateX(Math.PI / 2), metal, V(0, 0.04, 0)); // とげの付いたベルト
  for (let i = 0; i < 7; i++) {
    const a = -1.2 + i * 0.4;
    k.mesh(hips, spike(V(Math.sin(a) * 0.19, 0.04, Math.cos(a) * 0.19), V(Math.sin(a) * 0.24, 0.04, Math.cos(a) * 0.24), 0.012), metal);
  }
  const torso = k.pivot(hips, V(0, 0.04, 0));
  torso.rotation.x = 0.2;
  k.mesh(torso, shaggy(0.2, 0.17, 0.16, 1), fur, V(0, 0.13, 0));
  k.mesh(torso, shaggy(0.26, 0.19, 0.18, 2), fur, V(0, 0.33, -0.01));
    // 左肩（+x）：錆びた鎧と、とげ
  const pad = k.pivot(torso, V(0.25, 0.44, 0));
  pad.rotation.z = -0.4;
  for (let i = 0; i < 2; i++) k.mesh(pad, new THREE.SphereGeometry(0.115 - i * 0.015, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, 0.7, 1), metal, V(i * 0.03, -i * 0.04, 0));
  for (const dz of [-0.05, 0, 0.05]) k.mesh(pad, spike(V(0, 0.07, dz), V(0.02, 0.14, dz), 0.014), metal);
  k.mesh(torso, limb(V(0.2, 0.46, 0.08), V(-0.12, 0.12, 0.17), 0.02, 0.02, 6), cloth); // 肩当ての革帯
  const head = k.pivot(torso, V(0, 0.5, 0.08));
  head.rotation.x = -0.2;
  k.mesh(head, shaggy(0.12, 0.11, 0.11, 3), fur, V(0, 0.04, -0.01));
  k.mesh(head, roughen(ellipsoid(0.08, 0.075, 0.05), 0.006, 25), face, V(0, 0.02, 0.07));
  k.mesh(head, ellipsoid(0.045, 0.035, 0.04), face, V(0, -0.02, 0.11)); // 鼻づら
  k.mesh(head, ellipsoid(0.08, 0.02, 0.03), furDark, V(0, 0.07, 0.08)); // 眉の毛
  for (const s of [-1, 1]) {
    k.mesh(head, spike(V(s * 0.025, -0.04, 0.13), V(s * 0.028, -0.0, 0.14), 0.008), horn); // 下あごの牙
    // 巻いた角：頭の横から後ろへ、ぐるりと巻いて前へ戻る
    const pts = [0, 1, 2, 3, 4, 5].map((i) => {
      const a = i * 0.95;
      const r = 0.07 - i * 0.008;
      return V(s * (0.09 + i * 0.012), 0.08 + Math.sin(a) * r, -0.02 - Math.cos(a) * r + r);
    });
    chain(k, head, pts, [0.03, 0.027, 0.023, 0.019, 0.014, 0.008], horn);
  }
  k.eyes(head, eye, 0.035, 0.035, 0.105, 0.012, 0.6);
  const arms = ([-1, 1] as const).map((s) => {
    const g = k.pivot(torso, V(s * 0.27, 0.4, 0));
    g.rotation.z = s * 0.14;
    k.mesh(g, shaggy(0.09, 0.14, 0.09, s + 7), fur, V(s * 0.04, -0.12, 0.01));
    k.mesh(g, limb(V(s * 0.06, -0.26, 0.03), V(s * 0.07, -0.42, 0.06), 0.075, 0.07), metal); // 籠手
    k.mesh(g, limb(V(s * 0.06, -0.3, 0.03), V(s * 0.065, -0.31, 0.035), 0.085, 0.085), claw); // 籠手の縁
    k.mesh(g, roughen(ellipsoid(0.07, 0.075, 0.065), 0.008, 22), furDark, V(s * 0.072, -0.49, 0.07));
    for (const f of [-1, 0, 1]) k.mesh(g, spike(V(s * 0.072 + f * 0.025, -0.53, 0.11), V(s * 0.075 + f * 0.03, -0.58, 0.14), 0.01), claw);
    return g;
  });
  return {
    height: 1.18,
    shadow: 0.38,
    animate(t, walk, walking) {
      const step = walking ? Math.sin(walk * 7) : 0;
      swing(legs, arms, step, 0.45, 0.35);
      hips.position.y = 0.48 + (walking ? Math.abs(step) * 0.025 : 0);
      hips.rotation.z = step * 0.06;
      const breath = walking ? 0 : Math.sin(t * 1.6) * 0.02;
      torso.scale.set(1 + breath, 1 + breath * 0.5, 1 + breath);
      head.rotation.y = walking ? 0 : Math.sin(t * 0.55) * 0.3;
    },
  };
}

// ===== 騎士 =====

/** 騎士：全身を板金の鎧で包み、兜ののぞき穴が光る。背中にマント。
 *  暗黒騎士（dark）は黒い鎧にとげの肩当て、赤く光る目、裂けた黒いマントに、両手で持つ大剣。
 *  聖騎士は銀に金の縁取りの鎧、兜に白い飾り毛、白いマントと青い前垂れ、青く光る剣と、太陽の紋の盾 */
function knight(k: Kit, body: THREE.Group, dark: boolean): Rig {
  const plate = dark ? k.skin(0x2c2c32, { shine: 55, specular: 0x6a6a74, bump: 0.012 }) : k.skin(0xa8acb4, { shine: 80, specular: 0xd8d8e0, bump: 0.008 });
  const trim = dark ? k.skin(0x16161a, { shine: 35, specular: 0x404048 }) : k.skin(0x9a7a30, { shine: 70, specular: 0xd8b860 });
  const under = k.skin(dark ? 0x1e1c1c : 0x3a3630, { bump: 0.03 });
  const cape = dark ? k.skin(0x141216, { double: true, bump: 0.03 }) : k.skin(0xd8d0bc, { double: true, bump: 0.02 });
  const tabard = dark ? k.skin(0x2a1a1a, { double: true, bump: 0.03 }) : k.skin(0x2a3a7a, { double: true, bump: 0.02 });
  const voidMat = k.skin(0x050507);
  const visor = k.glow(dark ? 0xff3020 : 0xbfe8ff);
  const legs = ([-1, 1] as const).map((s) => {
    const g = k.pivot(body, V(s * 0.09, 0.48, 0));
    chain(k, g, [V(0, 0, 0), V(0, -0.22, 0.03), V(0, -0.43, 0)], [0.065, 0.05, 0.045], plate);
    k.mesh(g, ellipsoid(0.055, 0.05, 0.045), trim, V(0, -0.22, 0.05)); // ひざ当て
    k.mesh(g, roughen(ellipsoid(0.05, 0.035, 0.09), 0.002, 40), plate, V(0, -0.45, 0.035)); // 鉄の靴
    return g;
  });
  const hips = k.pivot(body, V(0, 0.48, 0));
  k.mesh(hips, new THREE.LatheGeometry([P(0.17, -0.12), P(0.15, 0.0), P(0.13, 0.06)], 22), plate); // 草摺り
  k.mesh(hips, new THREE.TorusGeometry(0.15, 0.015, 6, 24).rotateX(Math.PI / 2), trim, V(0, 0.0, 0));
  // 前垂れ
  const front = k.pivot(hips, V(0, -0.02, 0.15));
  k.mesh(front, tatter(new THREE.CylinderGeometry(0.11, 0.13, 0.36, 8, 4, true, -0.5, 1.0).translate(0, -0.16, -0.12), dark ? 0.06 : 0.02, 5), tabard, V(0, 0, 0));
  const torso = k.pivot(hips, V(0, 0.04, 0));
  k.mesh(torso, ellipsoid(0.14, 0.12, 0.1), under, V(0, 0.08, 0));
  k.mesh(torso, ellipsoid(0.17, 0.18, 0.12), plate, V(0, 0.27, 0.005)); // 胸当て
  k.mesh(torso, limb(V(0, 0.16, 0.115), V(0, 0.4, 0.105), 0.012, 0.012, 6), trim); // 胸の稜線
  k.mesh(torso, new THREE.TorusGeometry(0.14, 0.013, 6, 24).rotateX(Math.PI / 2).scale(1, 1, 0.75), trim, V(0, 0.12, 0));
  k.mesh(torso, new THREE.CylinderGeometry(0.075, 0.1, 0.07, 16), plate, V(0, 0.44, 0)); // 首当て
  if (!dark) k.mesh(torso, new THREE.CircleGeometry(0.035, 16), trim, V(0, 0.3, 0.123)); // 胸の金の紋
  for (const s of [-1, 1]) {
    const pad = k.pivot(torso, V(s * 0.2, 0.39, 0));
    pad.rotation.z = -s * 0.35;
    for (let i = 0; i < 3; i++) k.mesh(pad, new THREE.SphereGeometry(0.095 - i * 0.012, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, 0.7, 1.05), plate, V(s * i * 0.02, -i * 0.035, 0));
    k.mesh(pad, new THREE.TorusGeometry(0.09, 0.007, 5, 20).rotateX(Math.PI / 2).scale(1, 1, 1.05), trim, V(0, 0.003, 0));
    if (dark) for (const dz of [-0.03, 0.03]) k.mesh(pad, spike(V(0, 0.05, dz), V(s * 0.02, 0.14, dz), 0.016), trim);
  }
  // マント：肩から背中へ垂れる。暗黒騎士のはすそが裂けている
  const capeGroup = k.pivot(torso, V(0, 0.42, -0.07));
  const capeGeo = new THREE.CylinderGeometry(0.16, 0.27, 0.86, 16, 6, true, Math.PI * 0.55, Math.PI * 0.9).translate(0, -0.43, 0);
  k.mesh(capeGroup, tatter(roughen(capeGeo, 0.006, 12), dark ? 0.12 : 0.03, 8), cape);
  const head = k.pivot(torso, V(0, 0.52, 0.01));
  k.mesh(head, new THREE.CylinderGeometry(0.078, 0.084, 0.13, 18), plate);
  k.mesh(head, new THREE.SphereGeometry(0.078, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), plate, V(0, 0.065, 0));
  k.mesh(head, spike(V(0, 0.0, 0.06), V(0, -0.01, dark ? 0.11 : 0.095), 0.055), plate); // とがった面頬
  k.mesh(head, new THREE.BoxGeometry(0.11, 0.016, 0.02), voidMat, V(0, 0.025, 0.074)); // のぞき穴
  k.mesh(head, new THREE.BoxGeometry(0.075, 0.009, 0.01), visor, V(0, 0.025, 0.08)); // 奥の光
  const visorGlow = k.glowSprite(head, dark ? 'rgba(255,60,30,0.6)' : 'rgba(170,220,255,0.6)', 0.14, V(0, 0.025, 0.1));
  if (dark) {
    for (const s of [-1, 1]) k.mesh(head, spike(V(s * 0.07, 0.08, -0.01), V(s * 0.1, 0.17, -0.05), 0.016), trim); // 兜の角
  } else {
    // 兜の白い飾り毛：頭の上から後ろへなびく
    const plume = new THREE.CatmullRomCurve3([V(0, 0.12, 0.04), V(0, 0.17, -0.03), V(0, 0.12, -0.12), V(0, 0.0, -0.16), V(0, -0.12, -0.15)]);
    for (const dx of [-0.018, 0, 0.018]) k.mesh(head, new THREE.TubeGeometry(plume, 16, 0.024, 8).translate(dx, 0, 0), cape);
    k.mesh(head, new THREE.BoxGeometry(0.014, 0.05, 0.12), trim, V(0, 0.12, 0.0));
  }
  const arms = ([-1, 1] as const).map((s) => {
    const g = k.pivot(torso, V(s * 0.21, 0.35, 0));
    chain(k, g, [V(0, 0, 0), V(s * 0.04, -0.18, 0.02), V(s * 0.05, -0.34, 0.07)], [0.05, 0.044, 0.04], plate);
    k.mesh(g, ellipsoid(0.048, 0.04, 0.045), trim, V(s * 0.04, -0.18, 0.02)); // ひじ当て
    k.mesh(g, roughen(ellipsoid(0.045, 0.045, 0.05), 0.002, 40), plate, V(s * 0.055, -0.38, 0.085)); // 籠手
    return g;
  });
  const glows: THREE.Sprite[] = [visorGlow];
  if (dark) {
    // 右手（-x）：黒い大剣を、切っ先を下へ向けて持つ
    const sword = k.pivot(arms[0]!, V(-0.055, -0.38, 0.09));
    sword.rotation.x = 2.5;
    k.mesh(sword, limb(V(0, -0.1, 0), V(0, 0.04, 0), 0.014, 0.014, 8), under);
    k.mesh(sword, new THREE.BoxGeometry(0.16, 0.022, 0.03), trim, V(0, 0.045, 0));
    k.mesh(sword, ellipsoid(0.02, 0.02, 0.02), trim, V(0, -0.11, 0));
    const blade = new THREE.Shape();
    blade.moveTo(-0.032, 0);
    blade.lineTo(0.032, 0);
    blade.lineTo(0.026, 0.55);
    blade.lineTo(0, 0.62);
    blade.lineTo(-0.026, 0.55);
    blade.closePath();
    k.mesh(sword, new THREE.ExtrudeGeometry(blade, { depth: 0.008, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.003, bevelSegments: 1 }).translate(0, 0.05, -0.004), plate);
    k.mesh(sword, new THREE.BoxGeometry(0.008, 0.45, 0.018), visor, V(0, 0.3, 0)); // 刃の血の溝が赤く光る
  } else {
    // 右手（-x）：青く光る剣
    const sword = k.pivot(arms[0]!, V(-0.055, -0.38, 0.09));
    sword.rotation.x = 1.0;
    k.mesh(sword, limb(V(0, -0.07, 0), V(0, 0.03, 0), 0.012, 0.012, 8), under);
    k.mesh(sword, new THREE.BoxGeometry(0.13, 0.02, 0.025), trim, V(0, 0.035, 0));
    const bladeMat = k.glow(0xb8ecff);
    k.mesh(sword, new THREE.BoxGeometry(0.04, 0.46, 0.01), bladeMat, V(0, 0.27, 0));
    k.mesh(sword, new THREE.ConeGeometry(0.028, 0.06, 4).scale(1, 1, 0.25), bladeMat, V(0, 0.53, 0));
    for (const y of [0.15, 0.3, 0.45]) glows.push(k.glowSprite(sword, 'rgba(150,215,255,0.55)', 0.16, V(0, y, 0)));
    // 左手（+x）：太陽の紋の盾
    const shield = k.pivot(arms[1]!, V(0.07, -0.33, 0.1));
    shield.rotation.y = 0.25;
    const kite = new THREE.Shape();
    kite.moveTo(-0.11, 0.13);
    kite.lineTo(0.11, 0.13);
    kite.quadraticCurveTo(0.11, -0.08, 0, -0.21);
    kite.quadraticCurveTo(-0.11, -0.08, -0.11, 0.13);
    k.mesh(shield, new THREE.ExtrudeGeometry(kite, { depth: 0.02, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.006, bevelSegments: 2 }), plate);
    k.mesh(shield, new THREE.CircleGeometry(0.045, 20), trim, V(0, 0.01, 0.03));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      k.mesh(shield, spike(V(Math.cos(a) * 0.045, 0.01 + Math.sin(a) * 0.045, 0.03), V(Math.cos(a) * 0.085, 0.01 + Math.sin(a) * 0.085, 0.03), 0.01), trim);
    }
    glows.push(k.glowSprite(shield, 'rgba(255,230,150,0.45)', 0.16, V(0, 0.01, 0.05)));
  }
  return {
    height: 1.12,
    shadow: 0.32,
    animate(t, walk, walking) {
      const step = walking ? Math.sin(walk * 8) : 0;
      swing(legs, arms, step, 0.45, 0.2, dark ? [-0.15, 0] : [-0.15, -0.35]);
      hips.position.y = 0.48 + Math.abs(step) * 0.015;
      front.rotation.x = -Math.abs(step) * 0.2;
      capeGroup.rotation.x = (walking ? 0.25 : 0.05) + Math.sin(t * 1.4) * 0.03;
      const breath = walking ? 0 : Math.sin(t * 1.8) * 0.012;
      torso.scale.set(1 + breath, 1 + breath * 0.5, 1 + breath);
      head.rotation.y = walking ? 0 : Math.sin(t * 0.5) * 0.25;
      glows.forEach((g, i) => g.scale.setScalar((i ? 0.16 : 0.14) * (0.9 + Math.sin(t * 2.5 + i) * 0.1)));
    },
  };
}

export const SHEET_BUILDERS = {
  troll,
  lava_slime: lavaSlime,
  iwao,
  wraith,
  yeti,
  dark_knight: (k, body) => knight(k, body, true),
  holy_knight: (k, body) => knight(k, body, false),
} satisfies Record<string, Builder>;
