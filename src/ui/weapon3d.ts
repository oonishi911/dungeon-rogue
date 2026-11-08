// 武器の立体の模型（剣・槌・杖）。主人公の模型（hero3d.ts）と同じく、フォンシェーディングでなめらかに塗る。
// 金属（刃・鍔・槌の頭・金具）と宝石は強く光らせ、木や革は弱いツヤにする。
//
// どの模型も、握るところ（手の位置）が原点。刃先・槌の頭・杖の先は +y の向き。高さは主人公（約0.95マス）に合わせる。
// - 剣：鋼の刃（先がとがる）、金色の鍔、革を巻いた柄、柄頭。全長約0.5
// - 槌：鉄の頭（打つ面は少し明るい）、木の柄、握りの革。全長約0.5
// - 杖：木の長い柄（下は床に付くくらい）、先に金色の輪で留めた紫の宝石。全長約0.95

import * as THREE from 'three';
import type { WeaponType } from '../game/types';

const COLORS = {
  steel: '#c9d1d6',
  steelDark: '#8d989f',
  gold: '#d9b14a',
  leather: '#5a3a24',
  wood: '#8a5a32',
  woodDark: '#6b4325',
  iron: '#6f767c',
  ironLight: '#9aa2a8',
  gem: '#9b6cf0',
} as const;

/** 強く光らせる素材（金属と宝石） */
const METALS = new Set<string>([COLORS.steel, COLORS.steelDark, COLORS.gold, COLORS.iron, COLORS.ironLight, COLORS.gem]);

/** 武器の模型。dispose で、作った形と色をすべて片付ける */
export class Weapon3D {
  readonly root = new THREE.Group();
  private readonly disposables: { dispose(): void }[] = [];

  constructor(readonly type: WeaponType) {
    if (type === 'sword') this.sword();
    else if (type === 'hammer') this.hammer();
    else this.staff();
  }

  private mat(color: string, emissive?: string) {
    const shine = METALS.has(color) ? { shininess: 80, specular: 0xffffff } : { shininess: 18, specular: 0x2a2622 };
    const m = new THREE.MeshPhongMaterial({ color, ...shine, ...(emissive ? { emissive, emissiveIntensity: 0.6 } : {}) });
    this.disposables.push(m);
    return m;
  }

  private add(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) {
    this.disposables.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    this.root.add(mesh);
    return mesh;
  }

  private sword() {
    const leather = this.mat(COLORS.leather);
    const gold = this.mat(COLORS.gold);
    const steel = this.mat(COLORS.steel);
    // 柄（握るところが原点）と柄頭
    this.add(new THREE.CylinderGeometry(0.018, 0.02, 0.1, 10), leather, 0, 0, 0);
    this.add(new THREE.SphereGeometry(0.026, 10, 8), gold, 0, -0.06, 0);
    // 鍔
    this.add(new THREE.BoxGeometry(0.13, 0.024, 0.034), gold, 0, 0.06, 0);
    // 刃：平たい箱と、とがった先（刃の幅に合わせた四角すいを平たくつぶす）
    this.add(new THREE.BoxGeometry(0.046, 0.28, 0.012), steel, 0, 0.21, 0);
    this.add(new THREE.ConeGeometry(0.033, 0.07, 4).rotateY(Math.PI / 4).scale(1, 1, 0.26), steel, 0, 0.385, 0);
    // 刃の中央の溝（少し暗い線）
    this.add(new THREE.BoxGeometry(0.008, 0.24, 0.014), this.mat(COLORS.steelDark), 0, 0.2, 0);
  }

  private hammer() {
    const wood = this.mat(COLORS.wood);
    const iron = this.mat(COLORS.iron);
    const face = this.mat(COLORS.ironLight);
    // 柄：握るところから上へ長く、下へ少し
    this.add(new THREE.CylinderGeometry(0.018, 0.021, 0.46, 10), wood, 0, 0.13, 0);
    this.add(new THREE.CylinderGeometry(0.024, 0.024, 0.1, 10), this.mat(COLORS.leather), 0, 0, 0);
    // 頭：横長の鉄の塊。両端の打つ面は少し明るい
    this.add(new THREE.BoxGeometry(0.17, 0.09, 0.09), iron, 0, 0.36, 0);
    this.add(new THREE.BoxGeometry(0.02, 0.1, 0.1), face, -0.095, 0.36, 0);
    this.add(new THREE.BoxGeometry(0.02, 0.1, 0.1), face, 0.095, 0.36, 0);
    // 頭と柄をつなぐ金具
    this.add(new THREE.BoxGeometry(0.05, 0.03, 0.05), face, 0, 0.3, 0);
  }

  private staff() {
    const wood = this.mat(COLORS.wood);
    // 柄：握るところ（原点）から、下は床の近くまで、上は頭より高く
    this.add(new THREE.CylinderGeometry(0.017, 0.022, 0.92, 10), wood, 0, 0.17, 0);
    // 先：金色の輪で宝石を留める。宝石はかすかに光る
    const gold = this.mat(COLORS.gold);
    this.add(new THREE.CylinderGeometry(0.03, 0.022, 0.05, 10), this.mat(COLORS.woodDark), 0, 0.64, 0);
    this.add(new THREE.TorusGeometry(0.045, 0.011, 6, 16), gold, 0, 0.71, 0);
    this.add(new THREE.OctahedronGeometry(0.04).scale(0.9, 1.4, 0.9), this.mat(COLORS.gem, '#5a2fb0'), 0, 0.72, 0);
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}
