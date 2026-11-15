// 魔法に弱い敵（動く甲冑・氷の彫像・ガーゴイル）と、物理に弱い敵（呪術師・魔導ゴブリン・炎のまじない師）の模型。
// 魔法に弱い3体は、かたい体（鎧・氷・石）で、武器では削りにくい。物理に弱い3体は、ローブを着た術者で、近づいて殴れば倒れやすい。
// 組み立ての道具は creatureKit.ts。

import * as THREE from 'three';
import { type Builder, chain, ellipsoid, flicker, limb, type Kit, P, pleat, type Rig, roughen, scaled, spike, tatter, V } from './creatureKit';

/** 騎士の形の模型（動く甲冑と氷の彫像が共有する）の見た目の違い */
type KnightLook = {
  shell: number; // 体の色
  trim: number; // 飾りの色
  eye: number; // 兜の奥の光
  ice: boolean; // 氷（半透明で、角ばっていて、兜と肩に結晶が生える）
  weapon: 'axe' | 'sword';
};

function knight(k: Kit, body: THREE.Group, o: KnightLook): Rig {
  const shell = o.ice
    ? k.skin(o.shell, { shine: 90, specular: 0xcfeaff, opacity: 0.86, flat: true, double: true })
    : k.skin(o.shell, { shine: 60, specular: 0x7a7a80, bump: 0.012 });
  const trim = o.ice ? k.skin(o.trim, { shine: 80, specular: 0xffffff, opacity: 0.9, flat: true }) : k.skin(o.trim, { shine: 70, specular: 0xb0a080 });
  const dark = k.skin(0x08090c);
  const eye = k.glow(o.eye);
  const legs = ([-1, 1] as const).map((s) => {
    const g = k.pivot(body, V(s * 0.09, 0.44, 0));
    chain(k, g, [V(0, 0, 0), V(0, -0.2, 0.02), V(0, -0.4, 0)], [0.065, 0.055, 0.045], shell);
    k.mesh(g, ellipsoid(0.055, 0.03, 0.095), shell, V(0, -0.42, 0.04));
    k.mesh(g, ellipsoid(0.058, 0.045, 0.05), trim, V(0, -0.2, 0.05)); // ひざ当て
    return g;
  });
  const torso = k.pivot(body, V(0, 0.46, 0));
  k.mesh(torso, ellipsoid(0.15, 0.09, 0.11), shell, V(0, 0.04, 0));
  k.mesh(torso, ellipsoid(0.18, 0.21, 0.14), shell, V(0, 0.25, 0));
  k.mesh(torso, new THREE.TorusGeometry(0.15, 0.014, 6, 24).rotateX(Math.PI / 2).scale(1, 1, 0.8), trim, V(0, 0.1, 0));
  k.mesh(torso, new THREE.BoxGeometry(0.03, 0.2, 0.01), trim, V(0, 0.27, 0.135)); // 胸の筋
  if (o.ice) k.glowSprite(torso, 'rgba(170,230,255,0.75)', 0.34, V(0, 0.26, 0.04)); // 胸の中の冷たい光
  const helm = k.pivot(torso, V(0, 0.52, 0.01));
  k.mesh(helm, new THREE.CylinderGeometry(0.08, 0.085, 0.13, 18), shell);
  k.mesh(helm, new THREE.SphereGeometry(0.08, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), shell, V(0, 0.065, 0));
  k.mesh(helm, new THREE.BoxGeometry(0.11, 0.016, 0.02), dark, V(0, 0.02, 0.077)); // のぞき穴
  k.mesh(helm, new THREE.BoxGeometry(0.075, 0.009, 0.012), eye, V(0, 0.02, 0.083)); // 奥の光
  if (o.ice) {
    for (const i of [-1, 0, 1]) k.mesh(helm, spike(V(i * 0.04, 0.12, -0.01), V(i * 0.065, 0.27 - Math.abs(i) * 0.06, -0.03), 0.02), shell);
  } else {
    k.mesh(helm, limb(V(0, 0.14, -0.02), V(0, 0.18, -0.13), 0.02, 0.012, 8), trim); // 後ろへ流れる飾り
  }
  for (const s of [-1, 1]) {
    const pad = k.pivot(torso, V(s * 0.21, 0.4, 0));
    k.mesh(pad, new THREE.SphereGeometry(0.09, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), shell);
    if (o.ice) k.mesh(pad, spike(V(s * 0.02, 0.05, 0), V(s * 0.07, 0.2, -0.02), 0.026), shell);
    else k.mesh(pad, new THREE.TorusGeometry(0.085, 0.009, 6, 20).rotateX(Math.PI / 2), trim, V(0, 0.005, 0));
  }
  const arms = ([-1, 1] as const).map((s) => {
    const g = k.pivot(torso, V(s * 0.21, 0.36, 0));
    chain(k, g, [V(0, 0, 0), V(s * 0.03, -0.17, 0.05), V(s * 0.04, -0.32, 0.1)], [0.05, 0.042, 0.038], shell);
    k.mesh(g, ellipsoid(0.045, 0.04, 0.05), shell, V(s * 0.04, -0.35, 0.11));
    return g;
  });
  // 右手（-x）の武器：甲冑は大きな両刃の斧、彫像は氷の剣
  const weapon = k.pivot(arms[0]!, V(-0.04, -0.35, 0.11));
  weapon.rotation.x = 0.8;
  if (o.weapon === 'axe') {
    k.mesh(weapon, limb(V(0, -0.3, 0), V(0, 0.5, 0), 0.014, 0.014, 8), trim);
    for (const s of [-1, 1]) k.mesh(weapon, ellipsoid(0.1, 0.11, 0.014).translate(s * 0.09, 0, 0), shell, V(0, 0.42, 0));
    k.mesh(weapon, spike(V(0, 0.5, 0), V(0, 0.6, 0), 0.02), trim);
  } else {
    k.mesh(weapon, new THREE.BoxGeometry(0.1, 0.02, 0.03), trim, V(0, 0.04, 0));
    k.mesh(weapon, new THREE.BoxGeometry(0.055, 0.62, 0.012), shell, V(0, 0.36, 0));
    k.mesh(weapon, spike(V(0, 0.66, 0), V(0, 0.76, 0), 0.028), shell);
  }
  return {
    legs,
    height: 1.18,
    shadow: 0.3,
    animate(t, walk, walking) {
      const step = walking ? Math.sin(walk * 7) : 0;
      legs[0]!.rotation.x = step * 0.42;
      legs[1]!.rotation.x = -step * 0.42;
      arms[0]!.rotation.x = -0.2 - step * 0.25;
      arms[1]!.rotation.x = -0.1 + step * 0.25;
      torso.position.y = 0.46 + Math.abs(step) * 0.014;
      helm.rotation.y = walking ? 0 : Math.sin(t * 0.5) * 0.18;
    },
  };
}

// ガーゴイル：灰色の石の羽の生えた魔物。前かがみにうずくまり、角と牙と長い尻尾がある。目だけが橙に光る
function gargoyle(k: Kit, body: THREE.Group): Rig {
  const stone = k.skin(0x6b6a73, { bump: 0.05, shine: 12, specular: 0x222228, flat: true });
  const deep = k.skin(0x3e3d46, { bump: 0.04, flat: true });
  const horn = k.skin(0x25242b, { shine: 24 });
  const wingMat = k.skin(0x55545c, { double: true, bump: 0.04, flat: true });
  const eye = k.glow(0xff7a30);
  const hips = k.pivot(body, V(0, 0.34, 0));
  const torso = k.pivot(hips, V(0, 0.04, 0));
  torso.rotation.x = 0.55; // 前かがみ
  k.mesh(torso, roughen(ellipsoid(0.15, 0.17, 0.12), 0.015, 12), stone, V(0, 0.14, 0));
  k.mesh(torso, roughen(ellipsoid(0.12, 0.1, 0.1), 0.012, 12, 2), stone, V(0, 0, -0.02));
  const head = k.pivot(torso, V(0, 0.34, 0.06));
  head.rotation.x = -0.5; // 前かがみでも前を見る
  k.mesh(head, roughen(ellipsoid(0.09, 0.08, 0.095), 0.01, 22), stone, V(0, 0.03, 0));
  k.mesh(head, ellipsoid(0.065, 0.035, 0.07), deep, V(0, -0.035, 0.05)); // あご
  k.mesh(head, ellipsoid(0.08, 0.02, 0.04), deep, V(0, 0.075, 0.06)); // 眉のでっぱり
  for (const s of [-1, 1]) {
    const h1 = V(s * 0.055, 0.08, -0.01);
    const h2 = V(s * 0.11, 0.14, -0.05);
    const h3 = V(s * 0.09, 0.23, -0.06);
    k.mesh(head, limb(h1, h2, 0.025, 0.017, 8), horn);
    k.mesh(head, spike(h2, h3, 0.017), horn);
    k.mesh(head, spike(V(s * 0.03, -0.045, 0.1), V(s * 0.032, -0.1, 0.105), 0.01), k.skin(0xd8d2c4, { shine: 30 })); // 牙
    k.mesh(head, spike(V(s * 0.085, 0.02, 0), V(s * 0.18, 0.06, -0.04), 0.025), deep); // とがった耳
  }
  k.eyes(head, eye, 0.035, 0.05, 0.085, 0.015, 0.55);
  const legs = ([-1, 1] as const).map((s) => {
    const g = k.pivot(body, V(s * 0.1, 0.3, -0.04));
    chain(k, g, [V(0, 0, 0), V(s * 0.01, -0.14, 0.08), V(s * 0.01, -0.28, 0)], [0.06, 0.045, 0.035], stone);
    k.mesh(g, roughen(ellipsoid(0.045, 0.025, 0.075), 0.004, 30), deep, V(s * 0.01, -0.3, 0.04));
    for (const d of [-0.025, 0, 0.025]) k.mesh(g, spike(V(s * 0.01 + d, -0.3, 0.1), V(s * 0.01 + d, -0.31, 0.15), 0.01), horn);
    return g;
  });
  const arms = ([-1, 1] as const).map((s) => {
    const g = k.pivot(torso, V(s * 0.16, 0.24, 0.02));
    chain(k, g, [V(0, 0, 0), V(s * 0.04, -0.14, 0.08), V(s * 0.04, -0.26, 0.17)], [0.05, 0.04, 0.032], stone);
    for (const d of [-0.02, 0, 0.02]) k.mesh(g, spike(V(s * 0.04 + d, -0.27, 0.18), V(s * 0.04 + d, -0.31, 0.24), 0.01), horn);
    return g;
  });
  const wings = ([-1, 1] as const).map((s) => {
    const w = k.pivot(torso, V(s * 0.07, 0.28, -0.08));
    w.rotation.set(0.4, s * 0.5, s * 0.35);
    k.wing(w, s, 0.5, wingMat, horn);
    return { w, s };
  });
  // 尻尾：先に向かって細くなり、先端がとがる
  const tail = k.pivot(body, V(0, 0.32, -0.12));
  chain(k, tail, [V(0, 0, 0), V(0, -0.06, -0.16), V(0, -0.1, -0.32)], [0.045, 0.03, 0.015], stone, false);
  k.mesh(tail, spike(V(0, -0.1, -0.32), V(0, -0.08, -0.44), 0.016), horn);
  return {
    legs,
    height: 0.86,
    shadow: 0.36,
    animate(t, walk, walking) {
      const step = walking ? Math.sin(walk * 8) : 0;
      legs[0]!.rotation.x = step * 0.5;
      legs[1]!.rotation.x = -step * 0.5;
      arms[0]!.rotation.x = -step * 0.4;
      arms[1]!.rotation.x = step * 0.4;
      hips.position.y = 0.34 + (walking ? Math.abs(step) * 0.02 : 0);
      for (const { w, s } of wings) w.rotation.z = s * (0.35 + Math.sin(t * (walking ? 4 : 1.2)) * (walking ? 0.25 : 0.06)); // 歩くとき羽ばたき、止まると小さく揺れる
      head.rotation.y = walking ? 0 : Math.sin(t * 0.5) * 0.3;
      tail.rotation.y = Math.sin(t * 1.4) * 0.25;
    },
  };
}

/** 術者の模型（呪術師・魔導ゴブリン・炎のまじない師が共有する）の見た目の違い */
type CasterLook = {
  robe: number; // ローブの色
  trim: number; // 縁取りの色
  skin: number; // 肌（顔）の色
  eye: number; // 目の光
  orb: number; // 杖の先の玉の色
  orbCss: string; // 玉のまわりのぼんやりした光
  hat: boolean; // とんがり帽子（ゴブリン。長い耳と鉤鼻も付く）
  flame: boolean; // 頭のまわりと手に炎が揺れる
  scale: number; // 大きさ
};

function caster(k: Kit, body: THREE.Group, o: CasterLook): Rig {
  const robe = k.skin(o.robe, { double: true, bump: 0.03 });
  const trim = k.skin(o.trim, { shine: 40, specular: 0x887744 });
  const skin = k.skin(o.skin, { bump: 0.02 });
  const wood = k.skin(0x3a2818, { bump: 0.03 });
  const dark = k.skin(0x050408);
  const eye = k.glow(o.eye);
  const orbMat = k.glow(o.orb);
  const float = k.pivot(body, V(0, 0.06, 0)); // 地面からすこし浮いて進む
  const hem = new THREE.LatheGeometry([P(0.25, 0), P(0.2, 0.2), P(0.14, 0.45), P(0.1, 0.58)], 26);
  k.mesh(float, tatter(pleat(hem, 0.012, 10), 0.06, 8), robe);
  k.mesh(float, new THREE.TorusGeometry(0.21, 0.01, 6, 28).rotateX(Math.PI / 2), trim, V(0, 0.22, 0)); // 腰の帯
  k.mesh(float, ellipsoid(0.13, 0.12, 0.1), robe, V(0, 0.62, 0)); // 胸
  k.mesh(float, ellipsoid(0.17, 0.05, 0.1), robe, V(0, 0.7, 0)); // 肩
  const head = k.pivot(float, V(0, 0.8, 0.01));
  if (o.hat) {
    // ゴブリン：緑の顔、長い耳、鉤鼻、とんがり帽子
    k.mesh(head, roughen(ellipsoid(0.095, 0.09, 0.095), 0.008, 20), skin, V(0, 0.02, 0));
    k.mesh(head, spike(V(0, 0.02, 0.09), V(0, -0.02, 0.17), 0.024), skin); // 鉤鼻
    for (const s of [-1, 1]) k.mesh(head, spike(V(s * 0.09, 0.03, 0), V(s * 0.22, 0.09, -0.04), 0.03), skin); // 長い耳
    k.eyes(head, eye, 0.035, 0.04, 0.085, 0.014, 0.6);
    const brim = k.mesh(head, new THREE.CylinderGeometry(0.17, 0.17, 0.012, 24), robe, V(0, 0.1, 0));
    brim.rotation.z = 0.08;
    const cone = k.mesh(head, new THREE.ConeGeometry(0.1, 0.3, 18), robe, V(0, 0.26, -0.01));
    cone.rotation.x = -0.18; // 帽子の先が後ろへ折れる
    k.mesh(head, new THREE.TorusGeometry(0.1, 0.01, 6, 24).rotateX(Math.PI / 2), trim, V(0, 0.13, 0));
  } else {
    // フード：顔は暗がりで、目だけが光る
    k.mesh(head, new THREE.SphereGeometry(0.115, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.72), robe, V(0, 0.02, -0.01));
    k.mesh(head, ellipsoid(0.07, 0.08, 0.06), dark, V(0, 0.0, 0.07));
    k.eyes(head, eye, 0.032, 0.01, 0.105, 0.015, 0.5);
    k.mesh(head, spike(V(0, 0.1, -0.02), V(0, 0.22, -0.1), 0.03), robe); // フードの先
    if (o.flame) {
      k.glowSprite(head, 'rgba(255,150,40,0.7)', 0.32, V(0, 0.2, 0)); // 頭の上の炎
      k.glowSprite(head, 'rgba(255,220,120,0.6)', 0.18, V(0, 0.18, 0));
    }
  }
  const arms = ([-1, 1] as const).map((s) => {
    const g = k.pivot(float, V(s * 0.17, 0.7, 0));
    chain(k, g, [V(0, 0, 0), V(s * 0.03, -0.12, 0.05), V(s * 0.03, -0.22, 0.14)], [0.055, 0.05, 0.04], robe, false);
    k.mesh(g, ellipsoid(0.035, 0.03, 0.04), skin, V(s * 0.03, -0.23, 0.16));
    return g;
  });
  // 右手（-x）：杖。先に玉が光る
  const staff = k.pivot(arms[0]!, V(-0.03, -0.23, 0.16));
  k.mesh(staff, limb(V(0, -0.45, 0), V(0, 0.55, 0), 0.015, 0.018, 8), wood);
  k.mesh(staff, new THREE.TorusGeometry(0.04, 0.008, 6, 16).rotateX(Math.PI / 2), trim, V(0, 0.55, 0));
  k.mesh(staff, new THREE.SphereGeometry(0.05, 16, 12), orbMat, V(0, 0.62, 0));
  const staffGlow = k.glowSprite(staff, o.orbCss, 0.3, V(0, 0.62, 0));
  // 左手（+x）の上に浮かぶ小さな玉（炎や闇のかたまり）
  const handOrb = k.pivot(arms[1]!, V(0.03, -0.3, 0.17));
  k.mesh(handOrb, new THREE.SphereGeometry(0.035, 12, 10), orbMat);
  const handGlow = k.glowSprite(handOrb, o.orbCss, 0.22);
  const rig: Rig = {
    height: 1.12,
    shadow: 0.27,
    animate(t, walk, walking) {
      const sway = walking ? Math.sin(walk * 6) : 0;
      float.position.y = 0.06 + Math.sin(t * 2) * 0.015 + (walking ? Math.abs(sway) * 0.02 : 0);
      float.rotation.z = sway * 0.05;
      head.rotation.y = walking ? 0 : Math.sin(t * 0.6) * 0.25;
      arms[0]!.rotation.x = -0.15 - sway * 0.1;
      arms[1]!.rotation.x = -0.5 + Math.sin(t * 1.6) * 0.08;
      staffGlow.scale.setScalar(0.3 * (0.88 + 0.2 * flicker(t, 0)));
      handGlow.scale.setScalar(0.22 * (0.85 + 0.3 * flicker(t, 2)));
      handOrb.position.y = -0.3 + Math.sin(t * 3) * 0.015;
    },
  };
  return o.scale === 1 ? rig : scaled(body, rig, o.scale);
}

export const RESIST_BUILDERS = {
  // 魔法に弱い敵：かたくて、武器では削りにくい
  animated_armor: (k, body) => knight(k, body, { shell: 0x3d4048, trim: 0x8a6a2a, eye: 0xff5a30, ice: false, weapon: 'axe' }),
  ice_statue: (k, body) => knight(k, body, { shell: 0x9fd8f2, trim: 0xe8f8ff, eye: 0xffffff, ice: true, weapon: 'sword' }),
  gargoyle,
  // 物理に弱い敵：ローブの術者。近づいて殴れば倒れやすいが、魔法はあまり効かない
  cultist: (k, body) =>
    caster(k, body, { robe: 0x2a1a3e, trim: 0x7a5aa8, skin: 0x8a8296, eye: 0xd8a0ff, orb: 0xb070ff, orbCss: 'rgba(170,110,255,0.8)', hat: false, flame: false, scale: 1 }),
  goblin_mage: (k, body) =>
    caster(k, body, { robe: 0x3a4a6e, trim: 0xd0b050, skin: 0x5e7a3a, eye: 0xffe060, orb: 0x70d0ff, orbCss: 'rgba(120,210,255,0.8)', hat: true, flame: false, scale: 0.72 }),
  fire_mage: (k, body) =>
    caster(k, body, { robe: 0x7a2a1a, trim: 0xe8a040, skin: 0xc08060, eye: 0xffd040, orb: 0xff8a30, orbCss: 'rgba(255,140,40,0.85)', hat: false, flame: true, scale: 1 }),
} satisfies Record<string, Builder>;
