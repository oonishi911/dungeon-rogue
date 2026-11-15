// すべての敵の、形も色もプログラムで組んだ立体の模型。
// 組み立て方は敵ごとに creaturesDark.ts（闇のダンジョン）、creaturesWorld.ts（ほかのダンジョン）、
// creaturesSheet.ts（以前は設定画から作っていた7体）にあり、
// 道具（形の部品、凹凸、光る目、素材）は creatureKit.ts。ここでは、組んだ模型を向かせ、動かす。

import * as THREE from 'three';
import type { Dir } from '../game/exploreTypes';
import { addKnee, type Builder, Kit, mergeStatic, type Rig, type Wrap } from './creatureKit';
import { DARK_BUILDERS } from './creaturesDark';
import { SHEET_BUILDERS } from './creaturesSheet';
import { WORLD_BUILDERS } from './creaturesWorld';

const BUILDERS = { ...DARK_BUILDERS, ...WORLD_BUILDERS, ...SHEET_BUILDERS } satisfies Record<string, Builder>;
export type CreatureId = keyof typeof BUILDERS;
export const CREATURE_IDS = Object.keys(BUILDERS) as CreatureId[];

const FACING: Record<Dir, number> = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };
const TURN_SPEED = 9;
// 歩き方：脚を前へ振り出すあいだ、ひざを曲げて足を持ち上げる（振り出す速さ × bend。max まで）。follow は曲げ伸ばしの速さ
const KNEE = { bend: 0.2, max: 0.9, follow: 14 };
// 待っているあいだ：体がわずかにふくらんで縮む（息づかい）と、ときどき左右を見回す（ラジアン）。blend は歩く・止まるの切り替えの速さ
const IDLE = { breath: 0.018, breathSpeed: 2.2, look: 0.28, lookSpeed: 0.42, blend: 4 };

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
  private idle = 1; // 待っている度合い（0〜1）
  private readonly knees: { leg: THREE.Object3D; knee: THREE.Group; last: number }[] = [];

  constructor(id: CreatureId, wrap: Wrap = (m) => m) {
    this.kit = new Kit(wrap);
    this.rig = BUILDERS[id](this.kit, this.body);
    this.height = this.rig.height;
    // 脚にひざを作る（動かさない部品をまとめる前に、ひざから下を分けておく）
    for (const leg of this.rig.legs ?? []) {
      const knee = addKnee(leg);
      if (knee) this.knees.push({ leg, knee, last: leg.rotation.x });
    }
    this.root.add(this.body);
    // 動かさない部品をまとめて、描く回数を減らす。時間と歩き方を変えて動かしてみて、動いた部品だけを残す
    this.rig.animate(this.time, 0, false, 0);
    const probes: [number, number, boolean][] = [[0.83, 0.37, true], [1.71, 0.9, true], [2.6, 0, false]];
    mergeStatic(this.body, (i) => this.rig.animate(this.time + probes[i]![0], probes[i]![1], probes[i]![2], 0.016), probes.length, this.kit.disposables);
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
    // ひざ：脚を前へ振り出している（腰の角度が減っている）あいだ曲げ、後ろへ蹴るときは伸ばす
    for (const k of this.knees) {
      const swing = dt > 0 ? (k.last - k.leg.rotation.x) / dt : 0;
      k.last = k.leg.rotation.x;
      const target = walking ? Math.min(KNEE.max, Math.max(0, swing * KNEE.bend)) : 0;
      k.knee.rotation.x += (target - k.knee.rotation.x) * Math.min(1, dt * KNEE.follow);
    }
    // 待っているあいだの息づかいと見回し（歩き出すと、なめらかに止める）
    this.idle += ((walking ? 0 : 1) - this.idle) * Math.min(1, dt * IDLE.blend);
    const look = Math.sin(this.time * IDLE.lookSpeed);
    this.body.scale.y = 1 + Math.sin(this.time * IDLE.breathSpeed) * IDLE.breath * this.idle;
    this.body.rotation.y = look * look * look * IDLE.look * this.idle; // 3乗して、正面を向いている時間を長くする
  }

  dispose() {
    for (const d of this.kit.disposables) d.dispose();
  }
}
