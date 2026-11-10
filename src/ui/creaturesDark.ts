// 闇のダンジョンの敵の模型：闇コウモリ・影・亡霊・大ネズミ・闇の王（アイスインプは creaturesWorld.ts の小鬼）。

import * as THREE from 'three';
import { type Builder, ellipsoid, limb, P, pleat, roughen, spike, tatter, V } from './creatureKit';

export const DARK_BUILDERS: Record<'dark_bat' | 'shadow' | 'phantom' | 'giant_rat' | 'dark_lord', Builder> = {
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
    const aura = k.glowSprite(float, 'rgba(150,90,230,0.55)', 1.3, V(0, 0.7, -0.05));
    const auraMat = aura.material;
    const orbHalo = k.glowSprite(orb, 'rgba(200,150,255,0.9)', 0.22);
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
