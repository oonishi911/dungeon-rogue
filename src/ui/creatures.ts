// すべての敵の、形も色もプログラムで組んだ立体の模型。
// 組み立て方は敵ごとに creaturesDark.ts（闇のダンジョン）、creaturesWorld.ts（ほかのダンジョン）、
// creaturesSheet.ts（以前は設定画から作っていた7体）にあり、
// 道具（形の部品、凹凸、光る目、素材）は creatureKit.ts。ここでは、組んだ模型を向かせ、動かす。

import * as THREE from 'three';
import type { Dir } from '../game/explore';
import { type Builder, Kit, type Rig, type Wrap } from './creatureKit';
import { DARK_BUILDERS } from './creaturesDark';
import { SHEET_BUILDERS } from './creaturesSheet';
import { WORLD_BUILDERS } from './creaturesWorld';

const BUILDERS = { ...DARK_BUILDERS, ...WORLD_BUILDERS, ...SHEET_BUILDERS } satisfies Record<string, Builder>;
export type CreatureId = keyof typeof BUILDERS;
export const CREATURE_IDS = Object.keys(BUILDERS) as CreatureId[];

const FACING: Record<Dir, number> = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };
const TURN_SPEED = 9;

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
