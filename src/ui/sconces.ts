// 部屋の壁掛けたいまつ。部屋の奥（画面の上）の壁の、部屋側の面に、鉄の金具で留めたたいまつを掛ける。
// - 置き場所はマップから決まる（部屋の幅が狭ければ1つ、広ければ2つ。奥の壁を等分した位置）。乱数は使わない
// - 一度見た壁にだけ出す。今見えていれば炎は明るく、一度見ただけなら暗く（霧と同じ考え方）
// - 光（点光源）は、主人公に近い、見えているたいまつ SCONCE.lights 個にだけ灯す。光の数を変えると three.js が描き方を
//   作り直して重くなるので、光は最初に決まった数だけ作っておき、使わないものは明るさを0にする
// - 炎と光は、たいまつのように小さくちらつく（「動きを減らす」設定では止める）
// 数値は explore3dConfig.ts の SCONCE。

import * as THREE from 'three';
import type { ExploreState } from '../game/exploreTypes';
import type { FloorMap, Pos } from '../game/map';
import { SCONCE } from './explore3dConfig';
import { asMetal } from './materialLook';

interface Mounted {
  wall: Pos; // 掛けた壁のマス
  group: THREE.Group;
  flame: THREE.Sprite;
  lit: boolean; // 今見えているか
}

/** 壁掛けたいまつを掛ける壁のマス：部屋の奥の壁（部屋の1つ上の行）で、すぐ下が部屋の床のところ */
export function sconceSpots(map: FloorMap): Pos[] {
  const spots: Pos[] = [];
  const isWall = (x: number, y: number) => x >= 0 && y >= 0 && x < map.width && y < map.height && map.tiles[y * map.width + x] === 'wall';
  for (const room of map.rooms) {
    const n = room.width >= SCONCE.wideRoom ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const x = room.x + Math.round(((i + 1) * (room.width - 1)) / (n + 1));
      const y = room.y - 1;
      if (isWall(x, y) && !isWall(x, room.y)) spots.push({ x, y });
    }
  }
  return spots;
}

export class Sconces {
  readonly root = new THREE.Group();
  private readonly lights: THREE.PointLight[] = [];
  private readonly flameMat: THREE.SpriteMaterial;
  private readonly flameTexture: THREE.Texture;
  private readonly ironMat: THREE.Material;
  private readonly woodMat: THREE.Material;
  private readonly bracket: THREE.BufferGeometry;
  private readonly stick: THREE.BufferGeometry;
  private map: FloorMap | null = null;
  private mounted: Mounted[] = [];
  private time = 0;
  /** 灯っている（光を灯した）たいまつの炎の位置。火の粉を出すのに使う（particles.ts） */
  readonly flames: THREE.Vector3[] = [];

  /** fog：霧をかける素材の手直し（金具とたいまつの柄は、壁と同じ霧をかける） */
  constructor(fog: <T extends THREE.Material>(m: T) => T) {
    this.ironMat = fog(asMetal(new THREE.MeshPhongMaterial({ color: 0x2b2b2e, shininess: 40, specular: 0x555555 })));
    this.woodMat = fog(new THREE.MeshPhongMaterial({ color: 0x4a3020, shininess: 4, specular: 0x111111 }));
    // 金具：壁に付ける板と、前へ出した腕
    this.bracket = new THREE.BoxGeometry(0.1, 0.16, 0.03);
    this.stick = new THREE.CylinderGeometry(0.022, 0.016, 0.24, 8).rotateX(0.5).translate(0, 0.08, 0.07);
    this.flameTexture = flameTexture();
    this.flameMat = new THREE.SpriteMaterial({ map: this.flameTexture, color: SCONCE.flameColor, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    for (let i = 0; i < SCONCE.lights; i++) {
      const light = new THREE.PointLight(SCONCE.color, 0, SCONCE.distance, SCONCE.decay);
      this.lights.push(light);
      this.root.add(light);
    }
  }

  /** 状態が変わったとき：階が変わったら掛け直し、一度見た壁のたいまつだけを出す */
  update(state: ExploreState, visible: Set<number>) {
    const { map, seen } = state;
    if (map !== this.map) this.mount(map);
    for (const m of this.mounted) {
      const i = m.wall.y * map.width + m.wall.x;
      const front = (m.wall.y + 1) * map.width + m.wall.x; // 掛けた面の前の床
      m.group.visible = !!seen[i] || !!seen[front];
      m.lit = visible.has(front) || visible.has(i);
      m.flame.material.opacity = m.lit ? 1 : SCONCE.remembered;
    }
  }

  /** 毎フレーム：主人公に近い、見えているたいまつに光を灯し、炎をちらつかせる */
  tick(player: Pos, dt: number, reduceMotion: boolean) {
    if (!reduceMotion) this.time += dt;
    const near = this.mounted
      .filter((m) => m.group.visible && m.lit)
      .map((m) => ({ m, d: Math.hypot(m.wall.x - player.x, m.wall.y - player.y) }))
      .filter((x) => x.d <= SCONCE.reach)
      .sort((a, b) => a.d - b.d);
    this.flames.length = 0;
    this.lights.forEach((light, i) => {
      const hit = near[i];
      if (!hit) {
        light.intensity = 0;
        return;
      }
      const { wall } = hit.m;
      this.flames.push(new THREE.Vector3(wall.x, SCONCE.height + 0.26, wall.y + 0.5 + SCONCE.out + 0.015));
      const f = this.flicker(wall);
      light.position.set(wall.x, SCONCE.height + 0.1, wall.y + 0.5 + SCONCE.out);
      light.intensity = SCONCE.intensity * (1 + SCONCE.flicker * f);
    });
    for (const m of this.mounted) {
      const s = SCONCE.flameSize * (1 + SCONCE.flicker * 0.8 * this.flicker(m.wall));
      m.flame.scale.set(s * 0.75, s, 1);
    }
  }

  /** たいまつごとに少しずつずらした、炎のちらつき（-1〜1） */
  private flicker(wall: Pos): number {
    if (this.time === 0) return 0;
    const t = this.time + wall.x * 1.7 + wall.y * 2.9;
    return 0.5 * Math.sin(t * 8.1) + 0.3 * Math.sin(t * 13.7 + 1.3) + 0.2 * Math.sin(t * 21.3 + 2.2);
  }

  private mount(map: FloorMap) {
    for (const m of this.mounted) this.root.remove(m.group);
    this.map = map;
    this.mounted = sconceSpots(map).map((wall) => {
      const group = new THREE.Group();
      // 奥の壁の、部屋側の面（+z）に掛ける
      group.position.set(wall.x, SCONCE.height, wall.y + 0.5 + 0.015);
      group.add(new THREE.Mesh(this.bracket, this.ironMat), new THREE.Mesh(this.stick, this.woodMat));
      const flame = new THREE.Sprite(this.flameMat.clone());
      flame.position.set(0, 0.24, SCONCE.out);
      group.add(flame);
      this.root.add(group);
      return { wall, group, flame, lit: false };
    });
  }

  dispose() {
    for (const m of this.mounted) m.flame.material.dispose();
    for (const d of [this.flameMat, this.flameTexture, this.ironMat, this.woodMat, this.bracket, this.stick]) d.dispose();
  }
}

/** 炎の絵：下が丸く、上がとがった、中心ほど白い光 */
function flameTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size * 0.62, 0, size / 2, size * 0.62, size * 0.42);
  g.addColorStop(0, 'rgba(255,255,240,1)');
  g.addColorStop(0.35, 'rgba(255,200,110,0.9)');
  g.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(size / 2, size * 0.08);
  ctx.quadraticCurveTo(size * 0.86, size * 0.55, size / 2, size * 0.96);
  ctx.quadraticCurveTo(size * 0.14, size * 0.55, size / 2, size * 0.08);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
