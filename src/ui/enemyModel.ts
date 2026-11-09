// 絵の輪郭から削り出した、敵の立体の模型（形は scripts/build-enemy-models.py が public/models/enemies/{敵のID}.bin に書き出す）。
// 表面には、その敵の正面・側面・背面の絵を投影して貼る（projectedSkin.ts）。トロルのように腕や頭は分かれていないので、
// 体全体で動く：歩いた向きへ体を回し、歩くあいだは上下に揺れ、止まっているときは息をする。
// 動き方は敵の体つきで変える：歩く（人型）、浮かぶ（レイスのような霊）、弾む（スライム）

import * as THREE from 'three';
import type { Dir } from '../game/explore';
import { projectedSkin, type ProjectedViews } from './projectedSkin';

export type EnemyMotion = 'walk' | 'float' | 'blob';

/** 正面・側面・背面の絵の置き方（src/ui/enemyViews.json の1体分） */
export interface EnemyViewSpec {
  height: number;
  views: Record<'front' | 'side' | 'back', { file: string; aspect: number; footX: number; px: number }>;
}

const FACING: Record<Dir, number> = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };
const TURN_SPEED = 9;
const MOTION = {
  walk: { bob: 0.03, sway: 0.05, speed: 6, breath: 0.015 },
  float: { hover: 0.08, drift: 0.03, speed: 1.6, lean: 0.12 }, // 床から少し浮いて、ゆっくり上下する。進むときは前へ傾く
  blob: { squash: 0.05, speed: 1.4, hop: 0.12, hopSpeed: 7 }, // ぷるぷると伸び縮みし、進むときは弾む
};

/** 模型の形のファイルを読む（頂点の数、番号の数、位置、三角形の頂点番号） */
export function parseEnemyShape(buffer: ArrayBuffer): THREE.BufferGeometry {
  const head = new DataView(buffer);
  const vertices = head.getUint32(0, true);
  const indices = head.getUint32(4, true);
  const position = new Float32Array(buffer, 8, vertices * 3);
  const index = new Uint16Array(buffer, 8 + vertices * 12, indices);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeVertexNormals();
  // 動かす前の姿勢（絵を貼る位置を決める）は、読み込んだ形そのもの
  geometry.setAttribute('restPos', geometry.getAttribute('position'));
  geometry.setAttribute('restNormal', geometry.getAttribute('normal'));
  geometry.computeBoundingBox();
  return geometry;
}

/** 絵を投影して貼る素材。絵の縦全体が体の高さ（足元が絵の下の端） */
export function enemySkin(spec: EnemyViewSpec, textures: Record<'front' | 'side' | 'back', THREE.Texture>): THREE.MeshPhongMaterial {
  const front = spec.views.front.px;
  const view = (v: EnemyViewSpec['views']['front']) => ({ file: v.file, footX: v.footX, aspect: v.aspect, scale: v.px / front });
  const views: ProjectedViews = {
    height: spec.height,
    vFeet: 0,
    vTop: 1,
    front: view(spec.views.front),
    side: view(spec.views.side),
    back: view(spec.views.back),
  };
  return projectedSkin(views, textures);
}

/** 1体分の模型。形と素材は同じ種類の敵で使い回すので、ここでは片付けない */
export class ShapedEnemy {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group(); // 揺れる部分
  private readonly shadow: THREE.Mesh;
  private facing = 0;
  private time = Math.random() * 10; // 同じ種類の敵が並んでも、そろって動かないように
  private walkTime = 0;

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    shadowMaterial: THREE.Material,
    private readonly motion: EnemyMotion,
  ) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    this.body.add(mesh);
    this.root.add(this.body);
    const box = geometry.boundingBox!;
    const radius = Math.max(0.2, Math.min(0.48, Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.45));
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(radius, 24).rotateX(-Math.PI / 2).translate(0, 0.01, 0), shadowMaterial);
    this.root.add(this.shadow);
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
    const b = this.body;
    if (this.motion === 'walk') {
      const m = MOTION.walk;
      const phase = this.walkTime * m.speed;
      const breath = walking ? 0 : Math.sin(this.time * 2.2) * m.breath;
      b.position.y = walking ? Math.abs(Math.sin(phase)) * m.bob : 0;
      b.rotation.z = walking ? Math.sin(phase) * m.sway : 0;
      b.scale.set(1 + breath, 1 + breath * 0.4, 1 + breath);
    } else if (this.motion === 'float') {
      const m = MOTION.float;
      b.position.y = m.hover + Math.sin(this.time * m.speed) * m.drift;
      b.rotation.x += ((walking ? m.lean : 0) - b.rotation.x) * Math.min(1, dt * 6);
      b.rotation.z = Math.sin(this.time * m.speed * 0.7) * 0.03;
      this.shadow.scale.setScalar(1 - Math.sin(this.time * m.speed) * 0.08);
    } else {
      const m = MOTION.blob;
      const hop = walking ? Math.abs(Math.sin(this.walkTime * m.hopSpeed)) : 0;
      const squash = Math.sin(this.time * m.speed * Math.PI * 2) * m.squash * (walking ? 0.5 : 1) + (walking ? (0.5 - hop) * 0.12 : 0);
      b.position.y = hop * m.hop;
      b.scale.set(1 - squash * 0.5, 1 + squash, 1 - squash * 0.5);
    }
  }

  dispose() {
    this.shadow.geometry.dispose();
  }
}
