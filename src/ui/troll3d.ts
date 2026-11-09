// トロルの立体の模型（試作）。設定画（assets/texture-sources/enemies/troll.jpg）を見て、主人公の模型（hero3d.ts）と同じく、
// 球・円柱・円すいを組み合わせて作る。緑の肌の、前かがみで大きな上半身。長い腕に鉄の籠手、毛皮付きの革の肩当て、
// 牙のあるあご、とがった耳、後ろへ垂れる黒いドレッドヘアとあごひげ。鎖かたびらの腰布と、ぼろぼろの前垂れ、革のブーツ。
// 右手に石の棍棒を持つ。フォンシェーディングで、肌は少しだけ、鉄はやや強く光る。
//
// 模型は足元が原点で、高さは約1.2マス。正面は +z。歩いた向きへ体を回し、歩くときは体を揺らし、止まっているときは息をする。

import * as THREE from 'three';
import type { Dir } from '../game/explore';

const FACING: Record<Dir, number> = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };
const TURN_SPEED = 10;
const BOB = { height: 0.04, sway: 0.06 }; // 歩くときの上下の揺れ（マス）と、左右の傾き（ラジアン）。重いので主人公より小さく
const BREATH = { speed: 1.6, amount: 0.025 }; // 止まっているときの息（1秒あたりの回数、胸のふくらみ）

// 設定画から拾った色
const COLORS = {
  skin: '#4b6334', // くすんだ緑の肌
  skinDark: '#3e522a', // 鼻・耳の影
  leather: '#4a3424', // 肩当て・ブーツ・ベルトの革
  rust: '#5e4a3e', // さびた鉄の板
  iron: '#3e3a36', // 籠手
  fur: '#7a6e5e', // 肩の毛皮
  chain: '#4e4c47', // 鎖かたびら
  cloth: '#4a3426', // ぼろぼろの前垂れ
  rope: '#8a7656', // 腰の縄
  hair: '#24211c', // ドレッドヘアとひげ
  tusk: '#e4d8bc', // 牙
  eye: '#e0a640', // 黄色い目
  wood: '#6b4a2e', // 棍棒の柄
  stone: '#8a8a84', // 棍棒の石
};

/** 2点のあいだをつなぐ円柱（腕や脚）。a の太さが ra、b の太さが rb */
function limb(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, segments = 12): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(b, a);
  const geo = new THREE.CylinderGeometry(rb, ra, dir.length(), segments);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  return geo.translate(mid.x, mid.y, mid.z);
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export class Troll3D {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group(); // 揺れる部分
  private readonly chest = new THREE.Group(); // 息でふくらむ部分
  private readonly disposables: { dispose(): void }[] = [];
  private facing = 0;
  private time = 0;

  constructor() {
    const mat = (color: string, shininess = 14, specular = 0x1e1c18, side: THREE.Side = THREE.FrontSide) =>
      new THREE.MeshPhongMaterial({ color, shininess, specular, side });
    const m = {
      skin: mat(COLORS.skin, 12, 0x161a10),
      skinDark: mat(COLORS.skinDark),
      leather: mat(COLORS.leather, 24, 0x2a2018),
      rust: mat(COLORS.rust, 40, 0x3a3028),
      iron: mat(COLORS.iron, 60, 0x55504a),
      fur: mat(COLORS.fur, 4, 0x000000),
      chain: mat(COLORS.chain, 50, 0x34322e),
      cloth: mat(COLORS.cloth, 6, 0x000000, THREE.DoubleSide),
      rope: mat(COLORS.rope, 6, 0x000000),
      hair: mat(COLORS.hair, 10, 0x141210),
      tusk: mat(COLORS.tusk, 40, 0x3a3830),
      eye: new THREE.MeshBasicMaterial({ color: COLORS.eye }), // 暗がりでも光って見える目
      wood: mat(COLORS.wood, 10, 0x1a1410),
      stone: mat(COLORS.stone, 8, 0x1a1a18),
      shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false }),
    };
    this.disposables.push(...Object.values(m));
    const add = (geo: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = this.body) => {
      this.disposables.push(geo);
      const mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const ellipsoid = (rx: number, ry: number, rz: number, x: number, y: number, z: number, material: THREE.Material, parent?: THREE.Object3D) =>
      add(new THREE.SphereGeometry(1, 20, 14).scale(rx, ry, rz).translate(x, y, z), material, parent);

    // 足元の影
    add(new THREE.CircleGeometry(0.34, 20).rotateX(-Math.PI / 2).translate(0, 0.01, 0), m.shadow, this.root).castShadow = false;

    for (const side of [-1, 1]) {
      const x = side * 0.14;
      // ブーツ（つま先から緑の指がのぞく）と、すねに巻いた革ひも
      add(new THREE.BoxGeometry(0.16, 0.1, 0.24).translate(x, 0.05, 0.03), m.leather);
      add(new THREE.CylinderGeometry(0.095, 0.1, 0.18, 12).translate(x, 0.16, 0), m.leather);
      add(new THREE.TorusGeometry(0.098, 0.012, 6, 16).rotateX(Math.PI / 2).translate(x, 0.2, 0), m.rope);
      for (const t of [-0.045, 0, 0.045]) ellipsoid(0.028, 0.022, 0.035, x + t, 0.03, 0.155, m.skin);
      // すね・ふともも（太く短い脚）
      add(limb(V(x, 0.22, 0), V(x * 0.95, 0.36, 0), 0.075, 0.085), m.skin);
      add(limb(V(x * 0.95, 0.34, 0), V(x * 0.8, 0.52, -0.01), 0.09, 0.11), m.skin);
      ellipsoid(0.07, 0.06, 0.06, x * 0.95, 0.35, 0.03, m.skin); // ひざ
    }

    // 腰：鎖かたびらの腰布、ぼろぼろの前垂れ、ベルトと縄
    add(new THREE.CylinderGeometry(0.2, 0.25, 0.2, 18, 1, true).translate(0, 0.46, 0), m.chain);
    const flap = (w: number, h: number, z: number, tilt: number) => {
      const g = new THREE.PlaneGeometry(w, h, 6, 1);
      const pos = g.getAttribute('position');
      // 下の端をぎざぎざにする（破れた布）
      for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0) pos.setY(i, pos.getY(i) - (i % 2 === 0 ? 0.04 : 0));
      g.rotateX(tilt).translate(0, 0.44, z);
      add(g, m.cloth);
    };
    flap(0.22, 0.26, 0.23, -0.12);
    flap(0.26, 0.22, -0.24, 0.12);
    add(new THREE.TorusGeometry(0.215, 0.032, 8, 24).rotateX(Math.PI / 2).translate(0, 0.57, 0.01), m.leather);
    add(new THREE.TorusGeometry(0.225, 0.012, 6, 24).rotateX(Math.PI / 2).translate(0, 0.54, 0.01), m.rope);

    // 胴：前かがみで、ふくらんだ腹と分厚い胸
    this.chest.position.set(0, 0.62, 0);
    this.body.add(this.chest);
    ellipsoid(0.25, 0.2, 0.22, 0, 0.12, 0.03, m.skin, this.chest); // 腹
    ellipsoid(0.31, 0.2, 0.24, 0, 0.27, 0.0, m.skin, this.chest); // 胸
    // 胸を斜めに横切る革帯
    add(new THREE.BoxGeometry(0.055, 0.48, 0.02).rotateZ(0.85).translate(0, 0.22, 0.235), m.leather, this.chest);
    add(new THREE.BoxGeometry(0.055, 0.48, 0.02).rotateZ(-0.85).translate(0, 0.22, -0.235), m.leather, this.chest);

    for (const side of [-1, 1]) {
      const sx = side * 0.31;
      // 肩：毛皮の襟と、革の肩当て（さびた鉄の板を重ねる）
      ellipsoid(0.15, 0.08, 0.16, sx * 0.9, 0.31, 0, m.fur, this.chest);
      add(new THREE.SphereGeometry(0.15, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.05, 0.8, 1.1).translate(sx, 0.27, 0), m.leather, this.chest);
      add(new THREE.SphereGeometry(0.12, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.6).scale(1.1, 0.75, 1.15).translate(sx * 1.05, 0.32, 0), m.rust, this.chest);
      // 長い腕：肩から下へ垂らし、手はひざの高さ
      const shoulder = V(sx * 1.05, 0.86, 0.0);
      const elbow = V(side * 0.42, 0.66, 0.03);
      const wrist = V(side * 0.45, 0.42, 0.1);
      add(limb(shoulder, elbow, 0.085, 0.075), m.skin);
      add(limb(elbow, wrist, 0.075, 0.07), m.skin);
      // 鉄の籠手（前腕）
      add(limb(V(side * 0.43, 0.6, 0.05), V(side * 0.45, 0.45, 0.095), 0.092, 0.088), m.iron);
      add(new THREE.TorusGeometry(0.09, 0.012, 6, 16).rotateX(Math.PI / 2).translate(side * 0.44, 0.52, 0.075), m.rope);
      // 大きな手と、とがった爪
      ellipsoid(0.075, 0.07, 0.065, side * 0.455, 0.37, 0.11, m.skin);
      for (const f of [-0.035, 0, 0.035]) {
        add(limb(V(side * 0.455 + f, 0.33, 0.13), V(side * 0.46 + f * 1.2, 0.27, 0.15), 0.018, 0.01), m.skin);
        add(new THREE.ConeGeometry(0.01, 0.03, 6).rotateX(Math.PI).translate(side * 0.46 + f * 1.2, 0.25, 0.15), m.tusk);
      }
    }

    // 首と頭：肩のあいだから前へ突き出した、大きな頭。上から見下ろすカメラでも顔が見えるよう、少し上を向ける
    add(limb(V(0, 0.86, 0.02), V(0, 1.0, 0.11), 0.11, 0.1), m.skin);
    const head = new THREE.Group();
    head.position.set(0, 1.09, 0.14);
    head.rotation.x = -0.18;
    this.body.add(head);
    ellipsoid(0.135, 0.135, 0.13, 0, 0.02, 0, m.skin, head); // 頭
    add(new THREE.BoxGeometry(0.22, 0.045, 0.07).translate(0, 0.05, 0.1), m.skin, head); // 張り出した眉
    ellipsoid(0.115, 0.075, 0.1, 0, -0.075, 0.06, m.skin, head); // 突き出たあご
    ellipsoid(0.035, 0.04, 0.04, 0, 0.0, 0.135, m.skinDark, head); // 大きな鼻
    for (const side of [-1, 1]) {
      ellipsoid(0.022, 0.016, 0.012, side * 0.05, 0.025, 0.122, m.eye, head); // 黄色い目
      add(new THREE.ConeGeometry(0.017, 0.07, 6).translate(side * 0.052, -0.045, 0.14), m.tusk, head); // 下あごから上へ伸びる牙
      add(new THREE.ConeGeometry(0.032, 0.13, 6).rotateZ(-side * 1.2).translate(side * 0.17, 0.04, -0.01), m.skinDark, head); // とがった耳
    }
    // あごひげ（下へ垂れる）
    add(new THREE.ConeGeometry(0.065, 0.17, 8).rotateX(Math.PI).translate(0, -0.17, 0.08), m.hair, head);
    // ドレッドヘア：頭のてっぺんから後ろをおおい（顔は出す）、後ろと肩へ太い房が垂れる
    ellipsoid(0.142, 0.138, 0.13, 0, 0.035, -0.035, m.hair, head);
    for (let i = 0; i < 11; i++) {
      const a = Math.PI * (0.05 + (i / 10) * 0.9); // 頭の後ろ半分に並べる
      const x = Math.cos(a) * 0.12;
      const z = -Math.sin(a) * 0.11;
      const len = 0.3 + (i % 3) * 0.06;
      // 背中にめり込まないよう、後ろへ大きく張り出して垂らす
      add(limb(V(x, 0.06, z), V(x * 1.5, 0.06 - len * 0.8, z * 1.5 - 0.4), 0.024, 0.018, 6), m.hair, head);
    }

    // 右手（-x）の石の棍棒：太い木の柄に、ごつごつした石の頭
    const club = new THREE.Group();
    club.position.set(-0.455, 0.37, 0.11);
    club.rotation.set(-0.9, 0, -0.35); // 先を前へ、少し外へ向けて持つ（上から見ても棍棒の長さがわかる）
    this.body.add(club);
    add(limb(V(0, -0.08, 0), V(0, 0.42, 0), 0.03, 0.04, 8), m.wood, club);
    add(new THREE.TorusGeometry(0.034, 0.009, 6, 12).rotateX(Math.PI / 2).translate(0, 0.0, 0), m.rope, club);
    add(new THREE.TorusGeometry(0.036, 0.009, 6, 12).rotateX(Math.PI / 2).translate(0, 0.05, 0), m.rope, club);
    add(new THREE.DodecahedronGeometry(0.12, 0).scale(1, 1.35, 0.9).translate(0, 0.52, 0), m.stone, club);

    this.root.add(this.body);
  }

  /** 毎フレーム呼ぶ。x, z はマスの位置、walking は歩いているか、dt は前のフレームからの秒数 */
  update(x: number, z: number, dir: Dir, walking: boolean, dt: number) {
    this.time += dt;
    this.root.position.set(x, 0, z);
    // 向き：一番近い回り方で回す
    let diff = FACING[dir] - this.facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.facing += diff * Math.min(1, dt * TURN_SPEED);
    this.root.rotation.y = this.facing;
    // 歩く揺れと、止まっているときの息
    const phase = this.time * 7;
    this.body.position.y = walking ? Math.abs(Math.sin(phase)) * BOB.height : 0;
    this.body.rotation.z = walking ? Math.sin(phase) * BOB.sway : 0;
    this.chest.scale.setScalar(1 + (walking ? 0 : Math.sin(this.time * BREATH.speed * Math.PI * 2) * BREATH.amount));
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}
