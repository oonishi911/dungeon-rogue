// トロルの立体の模型（試作）。設定画（assets/texture-sources/enemies/troll.jpg）の正面・側面・背面に合わせて体の形を組み、
// 表面には、その設定画から切り抜いた絵（public/textures/enemies/troll-{front,side,back}.png）をそのまま投影して貼る（projectedSkin.ts）。
// 肌のこぶや鎧の傷・さびは絵から、立体の陰影はたいまつの光から付くので、写実的なダークファンタジーの見た目になる。
// 棍棒だけは設定画の体にないので、暗い木と石の色で塗る。
//
// 体の各部の位置は、設定画をマスの大きさに直して決めた（正面の絵で、頭のてっぺんから足元までの640pxを1.2マスとする）。
// まず体全体を作ったときの姿勢（設定画の立ち方）で組み、絵を貼る位置を決めてから、腕・胸・頭を動かせる入れ物に移す。
// 動いても絵は体にくっついたまま。模型は足元が原点で、高さは1.2マス。正面は +z。

import * as THREE from 'three';
import type { Dir } from '../game/explore';
import { bakeRestPose, projectedSkin, type ProjectedViews } from './projectedSkin';

const FACING: Record<Dir, number> = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };
const TURN_SPEED = 8; // 重い体なので、主人公よりゆっくり向きを変える
const BOB = { height: 0.03, sway: 0.05, speed: 6 }; // 歩くときの上下の揺れ（マス）、左右の傾き（ラジアン）、速さ
const BREATH = { speed: 0.35, amount: 0.02 }; // 止まっているときの息（1秒あたりの回数、胸のふくらみ）

/** 設定画から切り抜いた絵と、その中での体の位置（scripts/build-enemy-textures.py が書き出した絵を測った値） */
export const TROLL_VIEWS: ProjectedViews = {
  height: 1.2,
  vFeet: 0.013,
  vTop: 0.987,
  front: { file: 'troll-front.png', footX: 0.5, aspect: 376 / 384 },
  side: { file: 'troll-side.png', footX: 0.47, aspect: 135 / 384 },
  back: { file: 'troll-back.png', footX: 0.49, aspect: 282 / 384 },
};

/** 2点のあいだをつなぐ円柱（腕や脚）。a の太さが ra、b の太さが rb */
function limb(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, segments = 16): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(b, a);
  const geo = new THREE.CylinderGeometry(rb, ra, dir.length(), segments, 4);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  return geo.translate(mid.x, mid.y, mid.z);
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const ellipsoid = (rx: number, ry: number, rz: number, x: number, y: number, z: number) =>
  new THREE.SphereGeometry(1, 24, 16).scale(rx, ry, rz).translate(x, y, z);

export class Troll3D {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group(); // 揺れる部分
  private readonly chest = new THREE.Group(); // 息でふくらむ部分（腰から上）
  private readonly head = new THREE.Group();
  private readonly arms: THREE.Group[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  private facing = 0;
  private time = 0;

  constructor(textures: Record<'front' | 'side' | 'back', THREE.Texture>) {
    const skin = projectedSkin(TROLL_VIEWS, textures);
    const wood = new THREE.MeshPhongMaterial({ color: 0x3e2a1a, shininess: 6, specular: 0x0a0806 });
    const stone = new THREE.MeshPhongMaterial({ color: 0x5c5a55, shininess: 4, specular: 0x0a0a0a, flatShading: true });
    const rope = new THREE.MeshPhongMaterial({ color: 0x5a4a34, shininess: 4, specular: 0x000000 });
    const shadow = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false });
    this.disposables.push(skin, wood, stone, rope, shadow);

    // まずはすべて体の入れ物に、体の高さのままで置く
    const add = (geo: THREE.BufferGeometry, material: THREE.Material = skin) => {
      this.disposables.push(geo);
      const mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = true;
      this.body.add(mesh);
      return mesh;
    };
    const parts = { chest: [] as THREE.Mesh[], head: [] as THREE.Mesh[], arms: [[], []] as THREE.Mesh[][] };

    // 脚：太いふとももと、革ひもを巻いたブーツ（設定画では足元が肩幅より広い、どっしりした立ち方）
    for (const side of [-1, 1]) {
      add(limb(V(side * 0.1, 0.52, 0), V(side * 0.13, 0.25, 0.015), 0.1, 0.085)); // ふともも
      add(ellipsoid(0.075, 0.07, 0.07, side * 0.135, 0.25, 0.035)); // ひざ
      add(limb(V(side * 0.135, 0.25, 0.01), V(side * 0.16, 0.13, -0.005), 0.08, 0.085)); // すね
      add(new THREE.CylinderGeometry(0.1, 0.11, 0.17, 18, 3).translate(side * 0.163, 0.105, -0.01)); // ブーツ
      add(ellipsoid(0.1, 0.06, 0.14, side * 0.163, 0.04, 0.03)); // 足（前へ張り出したつま先）
    }
    // 腰：鎖かたびらと革の腰布（すそが広がる）と、ベルト
    add(new THREE.CylinderGeometry(0.19, 0.235, 0.27, 24, 4, true).translate(0, 0.45, 0));
    add(new THREE.CylinderGeometry(0.192, 0.192, 0.06, 24, 1).translate(0, 0.585, 0));

    // 上半身
    const ch = (geo: THREE.BufferGeometry) => parts.chest.push(add(geo));
    ch(ellipsoid(0.19, 0.11, 0.155, 0, 0.6, 0.015)); // 腰まわり
    ch(ellipsoid(0.2, 0.14, 0.175, 0, 0.68, 0.03)); // ふくらんだ腹
    ch(ellipsoid(0.245, 0.15, 0.17, 0, 0.82, 0.0)); // 分厚い胸
    ch(ellipsoid(0.17, 0.07, 0.13, 0, 0.94, -0.02)); // 首のつけねの盛り上がった筋肉
    for (const side of [-1, 1]) {
      // 革を重ねた大きな肩当て
      ch(new THREE.SphereGeometry(0.13, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.62).scale(1.05, 0.85, 1.1).translate(side * 0.25, 0.88, -0.02));
    }

    // 腕：肩から外へ開いて垂らし、手はふとももの横（設定画の立ち方）。[0] が右腕（-x）
    const shoulders = [V(-0.22, 0.84, -0.03), V(0.22, 0.84, -0.03)];
    [-1, 1].forEach((side, i) => {
      const ar = (geo: THREE.BufferGeometry) => parts.arms[i]!.push(add(geo));
      const shoulder = shoulders[i]!;
      const elbow = V(side * 0.41, 0.69, -0.04);
      const wrist = V(side * 0.515, 0.57, -0.02);
      ar(limb(shoulder, elbow, 0.085, 0.075)); // 上腕
      ar(ellipsoid(0.07, 0.065, 0.065, elbow.x, elbow.y, elbow.z)); // ひじ
      ar(limb(elbow, wrist, 0.082, 0.08)); // 籠手をはめた前腕
      ar(ellipsoid(0.055, 0.075, 0.065, side * 0.53, 0.5, -0.005)); // 大きな手
      for (const f of [-0.03, 0, 0.03]) ar(limb(V(side * 0.535, 0.46, f), V(side * 0.55, 0.39, f + 0.01), 0.018, 0.012, 8)); // 指
    });

    // 頭：肩のあいだから前へ突き出した頭。あごひげと、後ろへ垂れるドレッドヘア、とがった耳
    const hd = (geo: THREE.BufferGeometry) => parts.head.push(add(geo));
    hd(ellipsoid(0.095, 0.115, 0.1, 0, 1.08, 0.07)); // 頭
    hd(ellipsoid(0.085, 0.055, 0.075, 0, 0.99, 0.11)); // 突き出たあご
    hd(new THREE.ConeGeometry(0.07, 0.14, 12).rotateX(Math.PI).translate(0, 0.92, 0.1)); // あごひげ
    hd(ellipsoid(0.105, 0.14, 0.1, 0, 1.06, 0.0)); // 後ろへ垂れる髪
    for (const side of [-1, 1]) hd(new THREE.ConeGeometry(0.02, 0.09, 8).rotateZ(-side * 1.3).translate(side * 0.11, 1.09, 0.04)); // とがった耳

    // 作ったときの姿勢で、絵を貼る位置を決めておく
    this.root.add(this.body);
    const shadowMesh = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24).rotateX(-Math.PI / 2).translate(0, 0.01, 0), shadow);
    this.disposables.push(shadowMesh.geometry);
    this.root.add(shadowMesh);
    bakeRestPose(this.body, skin);

    // 動かす部分を、軸の位置に置いた入れ物へ移す（attach は見た目の位置を変えずに入れ物を移す）
    const pivot = (group: THREE.Group, parent: THREE.Object3D, at: THREE.Vector3, meshes: THREE.Mesh[]) => {
      parent.add(group);
      group.position.copy(parent === this.body ? at : at.clone().sub(new THREE.Vector3().setFromMatrixPosition(parent.matrixWorld)));
      group.updateMatrixWorld(true);
      for (const m of meshes) group.attach(m);
    };
    this.root.updateMatrixWorld(true);
    pivot(this.chest, this.body, V(0, 0.56, 0), parts.chest);
    this.chest.updateMatrixWorld(true);
    pivot(this.head, this.chest, V(0, 0.95, 0.0), parts.head);
    for (let i = 0; i < 2; i++) {
      const arm = new THREE.Group();
      pivot(arm, this.chest, shoulders[i]!, parts.arms[i]!);
      this.arms.push(arm);
    }

    // 右手（-x）の石の棍棒：先を前へ、少し外へ向けて持つ（上から見ても棍棒の長さがわかる）
    const club = new THREE.Group();
    club.position.set(-0.53 - shoulders[0]!.x, 0.5 - shoulders[0]!.y, -0.005 - shoulders[0]!.z);
    club.rotation.set(-0.75, 0, -0.3);
    this.arms[0]!.add(club);
    const clubPart = (geo: THREE.BufferGeometry, material: THREE.Material) => {
      this.disposables.push(geo);
      const mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = true;
      club.add(mesh);
    };
    clubPart(limb(V(0, -0.06, 0), V(0, 0.4, 0), 0.026, 0.036, 10), wood);
    clubPart(new THREE.TorusGeometry(0.032, 0.008, 6, 14).rotateX(Math.PI / 2), rope);
    clubPart(new THREE.DodecahedronGeometry(0.1, 1).scale(1, 1.4, 0.85).translate(0, 0.5, 0), stone);
  }

  /** 毎フレーム呼ぶ。x, z はマスの位置、walking は歩いているか、dt は前のフレームからの秒数 */
  update(x: number, z: number, dir: Dir, walking: boolean, dt: number) {
    this.time += dt;
    this.root.position.set(x, 0, z);
    let diff = FACING[dir] - this.facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.facing += diff * Math.min(1, dt * TURN_SPEED);
    this.root.rotation.y = this.facing;
    const phase = this.time * BOB.speed;
    this.body.position.y = walking ? Math.abs(Math.sin(phase)) * BOB.height : 0;
    this.body.rotation.z = walking ? Math.sin(phase) * BOB.sway : 0;
    // 歩くときは腕を前後に振り、止まっているときは息で胸がふくらみ、頭が少し上下する
    const swing = walking ? Math.sin(phase) * 0.35 : 0;
    this.arms[0]!.rotation.x = swing;
    this.arms[1]!.rotation.x = -swing;
    const breath = walking ? 0 : Math.sin(this.time * BREATH.speed * Math.PI * 2);
    this.chest.scale.set(1 + breath * BREATH.amount, 1 + breath * BREATH.amount * 0.5, 1 + breath * BREATH.amount);
    this.head.rotation.x = breath * 0.04;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}
