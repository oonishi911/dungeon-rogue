// 主人公の立体の模型。ドット絵（sprites/data.ts の hero）と同じ色・同じ形の要素で組み立てる：
// フード付きのマント（装備した防具の色）、フードの前の開きから見える肌色の顔と焦げ茶色の長めの髪、
// マントの前の開きから見える服とベルト、開きから前へ出した腕（服の袖と手）、茶色の靴。
// フォンシェーディング（MeshPhongMaterial）で、陰影をなめらかにし、うっすらツヤを出す（武器の金属は強く光る。weapon3d.ts）。
//
// 模型は足元が原点で、高さは約0.95マス。正面は +z（画面の手前）。歩いた向きへ体を回す。
// 攻撃のときは、左腕を肩から回して武器を振る（武器ごとに振り方が違う。SWINGS）。

import * as THREE from 'three';
import type { Dir } from '../game/exploreTypes';
import type { WeaponType } from '../game/types';
import { CLOAKS, PALETTE } from '../sprites/data';
import { Weapon3D } from './weapon3d';

export type CloakId = keyof typeof CLOAKS;

// 向きごとの体の回転（y軸まわり）。正面（+z）が下向き（画面の手前）
const FACING: Record<Dir, number> = {
  down: 0,
  right: Math.PI / 2,
  up: Math.PI,
  left: -Math.PI / 2,
};

// 左手（主人公から見て左、+x の側）に持った武器の傾き（ラジアン）。
// 刃先を少し後ろへ倒し（back）、少し外へ開く（outward）。ゲームのカメラは斜め上の手前から見下ろすので、
// 前へ倒すとカメラの方を向いて短く見えてしまう。後ろへ倒すと、上から見ても武器の長さがわかる
const WEAPON_GRIP = { back: 0.45, outward: 0.25 };

// 攻撃で武器を振る動き。腕（肩が軸）と武器（手首が軸）の角度、体の前への傾きと踏み込みを、3つの姿勢のあいだで動かす：
// 構え（rest、ふだんの持ち方）→ 振りかぶる（windup）→ 振り下ろす（strike）→ 構えに戻る。
// armX：腕を前へ上げる角度（マイナスで上がる。-1.6 で前へ水平、-2.4 で頭の上）。armZ：腕を体の外（マイナス）・内（プラス）へ開く角度。
// gripX：武器の先を前へ倒す角度（構えの WEAPON_GRIP.back からのずれ。腕を上げた分だけ武器の先も後ろへ倒れるので、その分も足す）。lean：体を前へ傾ける角度。lunge：前へ踏み込む距離（マス）。
// 振り下ろし切るのは SWING.strikeAt（秒）。攻撃の音（scripts/build-sounds.py の STRIKE_AT）も同じ時間で当たる音が鳴る
type SwingPose = { armX: number; armZ: number; gripX: number; lean: number; lunge: number };
const REST_POSE: SwingPose = { armX: 0, armZ: 0, gripX: 0, lean: 0, lunge: 0 };
type SwingKind = WeaponType | 'fist';
const SWINGS: Record<SwingKind, { windup: SwingPose; strike: SwingPose }> = {
  // 剣：肩の上へ振りかぶり、体の外から内へ斜めに斬り下ろす
  sword: {
    windup: { armX: -2.3, armZ: -0.5, gripX: -0.5, lean: -0.08, lunge: 0 },
    strike: { armX: 0.1, armZ: 0.45, gripX: 2.1, lean: 0.18, lunge: 0.1 },
  },
  // 槌：頭の上まで大きく振りかぶり、真下へたたきつける
  hammer: {
    windup: { armX: -2.7, armZ: -0.15, gripX: -0.9, lean: -0.15, lunge: 0 },
    strike: { armX: -0.2, armZ: 0.05, gripX: 2.6, lean: 0.28, lunge: 0.12 },
  },
  // 杖：少し引いてから、先の宝石を敵へ向けて突き出す
  staff: {
    windup: { armX: 0.35, armZ: 0, gripX: -0.3, lean: -0.05, lunge: -0.03 },
    strike: { armX: -1.25, armZ: 0.1, gripX: 2.7, lean: 0.12, lunge: 0.1 },
  },
  // 武器なし：こぶしを引いて、前へ突き出す
  fist: {
    windup: { armX: 0.4, armZ: -0.1, gripX: 0, lean: -0.04, lunge: -0.03 },
    strike: { armX: -1.45, armZ: 0.15, gripX: 0, lean: 0.12, lunge: 0.1 },
  },
};
// 振る動きの時間（秒）：strikeAt で振り下ろし切り、hold までその姿勢を少し保ち、end で構えに戻る
export const SWING = { strikeAt: 0.1, hold: 0.16, end: 0.36 } as const;
const SWING_WINDUP_END = 0.055; // 振りかぶり切る時間（秒）。そこから strikeAt までが一気に振り下ろす速い動き

const TURN_SPEED = 14; // 体を回す速さ（大きいほど速く向きが変わる）
const BOB = { height: 0.05, sway: 0.08 }; // 歩くときの上下の揺れ（マス）と、左右の傾き（ラジアン）

/** 2点のあいだをつなぐ円柱（腕など）。a の太さが ra、b の太さが rb */
function limb(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(b, a);
  const geo = new THREE.CylinderGeometry(rb, ra, dir.length(), 10);
  // 円柱は y 軸向きなので、a から b の向きへ回して、真ん中に置く
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  return geo.translate(mid.x, mid.y, mid.z);
}

// 体の素材：フォンシェーディングで、なめらかな陰影と、うっすらしたツヤ（布や肌なので弱く、色も暗め）
const PHONG = { shininess: 18, specular: 0x2a2622 } as const;
const phong = (color: string, side: THREE.Side = THREE.FrontSide) => new THREE.MeshPhongMaterial({ color, side, ...PHONG });

/** 振り始めてから t 秒の姿勢。振りかぶりと戻りはなめらかに、振り下ろしは速く */
function swingPose(swing: { windup: SwingPose; strike: SwingPose }, t: number): SwingPose {
  const ease = (u: number) => u * u * (3 - 2 * u);
  if (t < SWING_WINDUP_END) return mixPose(REST_POSE, swing.windup, ease(t / SWING_WINDUP_END));
  if (t < SWING.strikeAt) {
    const u = (t - SWING_WINDUP_END) / (SWING.strikeAt - SWING_WINDUP_END);
    return mixPose(swing.windup, swing.strike, u * u); // だんだん速く振り下ろす
  }
  if (t < SWING.hold) return swing.strike;
  return mixPose(swing.strike, REST_POSE, ease((t - SWING.hold) / (SWING.end - SWING.hold)));
}

function mixPose(a: SwingPose, b: SwingPose, u: number): SwingPose {
  const m = (x: number, y: number) => x + (y - x) * u;
  return { armX: m(a.armX, b.armX), armZ: m(a.armZ, b.armZ), gripX: m(a.gripX, b.gripX), lean: m(a.lean, b.lean), lunge: m(a.lunge, b.lunge) };
}

export class Hero3D {
  /** シーンに置く入れ物。位置と向きはこれで決まる */
  readonly root = new THREE.Group();
  /** タップの当たり判定用の見えない箱。体より少し大きくして、指で押しやすくする */
  readonly hitBox: THREE.Mesh;

  private readonly body = new THREE.Group(); // 歩く揺れを付ける部分
  private readonly cloakMats: Record<'H' | 'C' | 'c', THREE.MeshPhongMaterial>;
  private readonly disposables: { dispose(): void }[] = [];
  private cloak: CloakId | null = null;
  private readonly leftHand = new THREE.Group(); // 左手の位置。持っている武器をここに付ける
  private weapon: Weapon3D | null = null;
  private readonly leftArm = new THREE.Group(); // 左腕（肩が軸）。攻撃のときに、これを回して武器を振る
  private swingAt: number | null = null; // 振り始めてからの秒数（振っていなければ null）
  private facing = 0;

  constructor() {
    const mats = {
      skin: phong(PALETTE.s!),
      tunic: phong(PALETTE.t!),
      belt: phong(PALETTE.b!),
      boots: phong(PALETTE.B!),
      eyes: phong(PALETTE.k!),
      hair: phong(PALETTE.h!, THREE.DoubleSide), // ドット絵の前髪と同じ焦げ茶色
      shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
      hit: new THREE.MeshBasicMaterial({ visible: false }),
    };
    // マントとフードは開いた円柱・球なので、内側の面も塗る
    this.cloakMats = {
      H: phong(CLOAKS.none.H, THREE.DoubleSide),
      C: phong(CLOAKS.none.C, THREE.DoubleSide),
      c: phong(CLOAKS.none.c, THREE.DoubleSide),
    };
    this.disposables.push(...Object.values(mats), ...Object.values(this.cloakMats));

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.body) => {
      this.disposables.push(geo);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };

    // 足元の影
    add(new THREE.CircleGeometry(0.28, 16).rotateX(-Math.PI / 2), mats.shadow, 0, 0.01, 0, this.root).renderOrder = 1;

    // 靴
    add(new THREE.BoxGeometry(0.1, 0.08, 0.14), mats.boots, -0.07, 0.04, 0.02);
    add(new THREE.BoxGeometry(0.1, 0.08, 0.14), mats.boots, 0.07, 0.04, 0.02);

    // 服（マントの内側）とベルト
    add(new THREE.CylinderGeometry(0.13, 0.17, 0.42, 16), mats.tunic, 0, 0.29, 0);
    add(new THREE.CylinderGeometry(0.155, 0.16, 0.04, 16), mats.belt, 0, 0.3, 0);

    // マント：前（+z）を開けて、中の服が見えるようにする。裾は濃い色。
    // three.js の円柱は、角度0が +z の向き（x = sin、z = cos）なので、角度0を中心に開ける
    const gap = 0.9; // 前の開きの角度（ラジアン）
    const cloakGeo = new THREE.CylinderGeometry(0.17, 0.27, 0.5, 20, 1, true, gap / 2, Math.PI * 2 - gap);
    add(cloakGeo, this.cloakMats.C, 0, 0.3, 0);
    add(new THREE.CylinderGeometry(0.27, 0.275, 0.05, 20, 1, true, gap / 2, Math.PI * 2 - gap), this.cloakMats.c, 0, 0.075, 0);

    // 腕：肩からマントの前の開きを通って、体の前に手を出す（服の袖と、肌色の手）
    // 左腕（武器を持つ方）は肩を軸にした入れ物に入れ、攻撃のときに肩から回して振る
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Vector3(side * 0.12, 0.5, 0.02);
      const hand = new THREE.Vector3(side * 0.14, 0.31, 0.19);
      const parent = side === 1 ? this.leftArm : this.body;
      const origin = side === 1 ? shoulder : new THREE.Vector3();
      add(limb(shoulder.clone().sub(origin), hand.clone().sub(origin), 0.04, 0.035), mats.tunic, 0, 0, 0, parent);
      add(new THREE.SphereGeometry(0.048, 10, 8), mats.skin, hand.x - origin.x, hand.y - origin.y, hand.z - origin.z, parent);
      if (side === 1) {
        this.leftArm.position.copy(shoulder);
        this.leftHand.position.copy(hand).sub(shoulder);
      }
    }
    this.leftHand.rotation.set(-WEAPON_GRIP.back, 0, -WEAPON_GRIP.outward);
    this.leftArm.add(this.leftHand);
    this.body.add(this.leftArm);

    // 頭とフード。フードは顔の前（+z）を開ける
    // （three.js の球は、横の角度 phi が π/2 のところが +z。phi 0.2π〜0.8π を開けると、顔の前が開く）
    add(new THREE.SphereGeometry(0.14, 16, 12), mats.skin, 0, 0.7, 0.01);
    add(new THREE.SphereGeometry(0.175, 16, 12, Math.PI * 0.8, Math.PI * 1.4), this.cloakMats.H, 0, 0.72, -0.01);

    // 髪（長め）：フードの開きから見える前髪と、顔の両横から胸まで垂れる髪、フードの下から背中へ流れる髪
    // 前髪：頭の球に少し大きい球の上の前側だけをかぶせる（目の上まで）
    add(new THREE.SphereGeometry(0.148, 16, 8, Math.PI * 0.15, Math.PI * 0.7, 0, Math.PI * 0.42), mats.hair, 0, 0.7, 0.012);
    for (const side of [-1, 1]) {
      // 顔の横の髪：こめかみから、あごの下を通って胸まで
      add(limb(new THREE.Vector3(side * 0.112, 0.74, 0.065), new THREE.Vector3(side * 0.125, 0.47, 0.11), 0.032, 0.022), mats.hair, 0, 0, 0);
    }
    // 背中の髪：フードの下から、マントに沿って背中へ流れる3つの房（毛先を細く、真ん中の房をいちばん長く）
    for (const [x, end] of [[-0.055, 0.38], [0, 0.33], [0.055, 0.38]] as const) {
      add(limb(new THREE.Vector3(x, 0.63, -0.15), new THREE.Vector3(x * 1.25, end, -0.205), 0.042, 0.016), mats.hair, 0, 0, 0);
    }
    add(new THREE.CylinderGeometry(0.1, 0.17, 0.12, 20), this.cloakMats.H, 0, 0.57, 0); // 肩にかかるフードの裾

    // 目
    add(new THREE.BoxGeometry(0.03, 0.045, 0.02), mats.eyes, -0.05, 0.7, 0.14);
    add(new THREE.BoxGeometry(0.03, 0.045, 0.02), mats.eyes, 0.05, 0.7, 0.14);

    this.root.add(this.body);

    const hitGeo = new THREE.BoxGeometry(0.7, 1, 0.7).translate(0, 0.5, 0);
    this.disposables.push(hitGeo);
    this.hitBox = new THREE.Mesh(hitGeo, mats.hit);
    this.root.add(this.hitBox);
  }

  /** 左手に持つ武器（null なら何も持たない）。同じ武器なら作り直さない */
  setWeapon(type: WeaponType | null) {
    if ((this.weapon?.type ?? null) === type) return;
    if (this.weapon) {
      this.leftHand.remove(this.weapon.root);
      this.weapon.dispose();
      this.weapon = null;
    }
    if (type) {
      this.weapon = new Weapon3D(type);
      this.leftHand.add(this.weapon.root);
    }
  }

  /** 攻撃で武器を振り始める（振っている途中なら、振り直す） */
  swing() {
    this.swingAt = 0;
  }

  /** マントとフードの色を、装備した防具の色にする */
  setCloak(cloak: CloakId) {
    if (cloak === this.cloak) return;
    this.cloak = cloak;
    const colors = CLOAKS[cloak];
    this.cloakMats.H.color.set(colors.H);
    this.cloakMats.C.color.set(colors.C);
    this.cloakMats.c.color.set(colors.c);
  }

  /**
   * 毎フレームの位置と向き。dir は最後に歩いた向き、progress は1歩の動きの途中（0〜1、1なら止まっている）。
   * dt は前のフレームからの秒数。reduceMotion なら揺らさず、すぐ向きを変える
   */
  update(x: number, z: number, dir: Dir, progress: number, dt: number, reduceMotion: boolean) {
    this.root.position.set(x, 0, z);
    const goal = FACING[dir];
    // いちばん近い回り方で向きを変える
    let diff = goal - this.facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.facing = reduceMotion ? goal : this.facing + diff * Math.min(1, dt * TURN_SPEED);
    this.root.rotation.y = this.facing;

    const walking = progress < 1 && !reduceMotion;
    const phase = Math.sin(progress * Math.PI);
    this.body.position.y = walking ? phase * BOB.height : 0;
    this.body.rotation.z = walking ? Math.sin(progress * Math.PI * 2) * BOB.sway : 0;

    // 武器を振る動き（動きを減らす設定では振らない）
    let pose = REST_POSE;
    if (this.swingAt !== null) {
      this.swingAt += dt;
      if (reduceMotion || this.swingAt >= SWING.end) this.swingAt = null;
      else pose = swingPose(SWINGS[this.weapon?.type ?? 'fist'], this.swingAt);
    }
    this.leftArm.rotation.set(pose.armX, 0, -pose.armZ); // 左腕は +x の側なので、z まわりのマイナスが体の内へ
    this.leftHand.rotation.x = -WEAPON_GRIP.back + pose.gripX;
    this.body.rotation.x = pose.lean;
    this.body.position.z = pose.lunge;
  }

  dispose() {
    this.weapon?.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
