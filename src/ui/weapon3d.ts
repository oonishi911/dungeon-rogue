// 武器の立体の模型（剣・槌・杖）。主人公の模型（hero3d.ts）と同じく、フォンシェーディングでなめらかに塗る。
// 金属（刃・鍔・槌の頭・金具）と宝石は強く光らせ、木や革は弱いツヤにする。
//
// どの模型も、握るところ（手の位置）が原点。刃先・槌の頭・杖の先は +y の向き。高さは主人公（約0.95マス）に合わせる。
// - 剣：鋼の刃（先がとがる）、金色の鍔、革を巻いた柄、柄頭。全長約0.5
// - 槌：鉄の頭（打つ面は少し明るい）、木の柄、握りの革。全長約0.5
// - 杖：木の長い柄（下は床に付くくらい）、先に金色の輪で留めた紫の宝石。全長約0.95
//
// 武器の段階（1〜10）が上がるほど、見た目が立派になる：
// - 剣：刃が長く広くなり、色が鉄→鋼→青みのある銀→金→紫→橙と変わる。鍔が反り返り（3〜）、宝石が付き（5〜）、翼のような鍔（7〜）になる。6〜は刃の縁がほのかに光る
// - 槌：頭が大きくなり、両端に輪が付き（3〜）、柄に金の輪（4〜）、頭の上にとげ（5〜）、光る文様（7〜）、頭が金属の輝き（9〜）になる
// - 杖：宝石が大きくなり、宝石を抱く爪（3〜）、輪が2つに（5〜）、まわりに浮かぶ小さな宝石（7〜）、羽根（9〜）が付く

import * as THREE from 'three';
import type { WeaponType } from '../game/types';
import { asMetal } from './materialLook';

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

/** 段階ごとの刃の色（鉄 → 鋼 → 青みのある銀 → 金 → 紫 → 橙） */
const BLADE_COLORS = ['#9ea4a8', '#c9d1d6', '#c9d1d6', '#d6dde6', '#d6dde6', '#b9dcf2', '#b9dcf2', '#f2e8bd', '#e0c8ff', '#ffd1a0'] as const;
/** 段階ごとの宝石の色 */
const GEM_COLORS = ['#9b6cf0', '#9b6cf0', '#9b6cf0', '#7a8cff', '#5ad0ff', '#5ad0ff', '#ff7a8a', '#ffd25a', '#ff9bff', '#ffffff'] as const;

/** 武器の模型。tier は段階（1〜10）。dispose で、作った形と色をすべて片付ける */
export class Weapon3D {
  readonly root = new THREE.Group();
  private readonly disposables: { dispose(): void }[] = [];

  constructor(readonly type: WeaponType, readonly tier = 1) {
    this.tier = Math.min(10, Math.max(1, Math.round(tier)));
    if (type === 'sword') this.sword();
    else if (type === 'hammer') this.hammer();
    else this.staff();
  }

  private mat(color: string, emissive?: string, glow = 0.6) {
    const metal = METALS.has(color) || this.metals.has(color);
    const shine = metal ? { shininess: 80, specular: 0xffffff } : { shininess: 18, specular: 0x2a2622 };
    const m = new THREE.MeshPhongMaterial({ color, ...shine, ...(emissive ? { emissive, emissiveIntensity: glow } : {}) });
    if (metal) asMetal(m); // 金属は、周りの景色が映り込み、自分の色で光る（materialLook.ts）
    this.disposables.push(m);
    return m;
  }
  private readonly metals = new Set<string>([...BLADE_COLORS, ...GEM_COLORS]);

  private add(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) {
    this.disposables.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    this.root.add(mesh);
    return mesh;
  }

  private sword() {
    const tier = this.tier;
    const leather = this.mat(COLORS.leather);
    const gold = this.mat(COLORS.gold);
    const blade = BLADE_COLORS[tier - 1] ?? COLORS.steel;
    const steel = this.mat(blade, tier >= 6 ? blade : undefined, 0.22);
    const len = 0.28 * (1 + 0.04 * (tier - 1)); // 刃の長さ
    const wide = 0.046 * (1 + 0.035 * (tier - 1)); // 刃の広さ
    // 柄（握るところが原点）と柄頭。段階が上がると柄頭が大きくなり、7〜は宝石になる
    this.add(new THREE.CylinderGeometry(0.018, 0.02, 0.1, 12), leather, 0, 0, 0);
    for (const y of [-0.025, 0.01]) this.add(new THREE.TorusGeometry(0.02, 0.004, 5, 12).rotateX(Math.PI / 2), gold, 0, y, 0); // 柄の金の輪
    const gem = this.mat(GEM_COLORS[tier - 1] ?? '#9b6cf0', GEM_COLORS[tier - 1], 0.6);
    this.add(new THREE.SphereGeometry(0.026 + 0.003 * Math.floor(tier / 3), 14, 10), tier >= 7 ? gem : gold, 0, -0.06, 0);
    // 鍔：段階1〜2は真っすぐな棒、3〜は両端が反り返り、7〜は翼のように広がる。5〜は真ん中に宝石
    const guardW = 0.13 + 0.012 * (tier - 1);
    this.add(new THREE.BoxGeometry(guardW, 0.024, 0.034), gold, 0, 0.06, 0);
    if (tier >= 3) {
      for (const side of [-1, 1]) {
        const horn = this.add(new THREE.ConeGeometry(0.014, 0.05 + 0.006 * tier, 8), gold, side * (guardW / 2), 0.075, 0);
        horn.rotation.z = -side * 0.35;
      }
    }
    if (tier >= 5) this.add(new THREE.OctahedronGeometry(0.02).scale(1, 1.3, 0.8), gem, 0, 0.062, 0.02);
    if (tier >= 7) {
      for (const side of [-1, 1]) {
        const wing = this.add(new THREE.BoxGeometry(0.07, 0.012, 0.03), gold, side * (guardW / 2 + 0.03), 0.04, 0);
        wing.rotation.z = side * 0.45;
      }
    }
    // 刃：平たい箱と、とがった先（刃の幅に合わせた四角すいを平たくつぶす）
    this.add(new THREE.BoxGeometry(wide, len, 0.012 + 0.0012 * tier), steel, 0, 0.07 + len / 2, 0);
    this.add(new THREE.ConeGeometry(wide * 0.72, 0.07, 4).rotateY(Math.PI / 4).scale(1, 1, 0.26 + 0.01 * tier), steel, 0, 0.07 + len + 0.035, 0);
    // 刃の中央の溝（少し暗い線）
    const dark = this.mat(tier >= 6 ? blade : COLORS.steelDark, tier >= 6 ? blade : undefined, 0.5);
    this.add(new THREE.BoxGeometry(0.008, len * 0.86, 0.014 + 0.0012 * tier), dark, 0, 0.07 + len * 0.5, 0);
  }

  private hammer() {
    const tier = this.tier;
    const wood = this.mat(COLORS.wood);
    const iron = this.mat(tier >= 9 ? '#c9d1d6' : COLORS.iron);
    const face = this.mat(COLORS.ironLight);
    const gold = this.mat(COLORS.gold);
    const k = 1 + 0.06 * (tier - 1); // 頭の大きさ
    // 柄：握るところから上へ長く、下へ少し
    this.add(new THREE.CylinderGeometry(0.018, 0.021, 0.46, 12), wood, 0, 0.13, 0);
    this.add(new THREE.CylinderGeometry(0.024, 0.024, 0.1, 12), this.mat(COLORS.leather), 0, 0, 0);
    if (tier >= 4) for (const y of [0.1, 0.2]) this.add(new THREE.TorusGeometry(0.02, 0.005, 5, 12).rotateX(Math.PI / 2), gold, 0, y, 0); // 柄の金の輪
    // 頭：横長の鉄の塊。両端の打つ面は少し明るい。段階が上がるほど大きい
    const hw = 0.17 * k, hh = 0.09 * k, hd = 0.09 * k;
    this.add(new THREE.BoxGeometry(hw, hh, hd), iron, 0, 0.36 + (hh - 0.09) / 2, 0);
    this.add(new THREE.BoxGeometry(0.02, hh * 1.1, hd * 1.1), face, -(hw / 2 + 0.01), 0.36 + (hh - 0.09) / 2, 0);
    this.add(new THREE.BoxGeometry(0.02, hh * 1.1, hd * 1.1), face, hw / 2 + 0.01, 0.36 + (hh - 0.09) / 2, 0);
    // 頭と柄をつなぐ金具
    this.add(new THREE.BoxGeometry(0.05, 0.03, 0.05), face, 0, 0.3, 0);
    if (tier >= 3) for (const side of [-1, 1]) this.add(new THREE.CylinderGeometry(hh * 0.62, hh * 0.62, 0.012, 14).rotateZ(Math.PI / 2), gold, side * (hw / 2 - 0.012), 0.36 + (hh - 0.09) / 2, 0); // 両端の金の輪
    if (tier >= 5) {
      // 頭の上のとげ
      const n = tier >= 8 ? 3 : 2;
      for (let i = 0; i < n; i++) this.add(new THREE.ConeGeometry(0.014, 0.05 + 0.004 * tier, 8), face, (i - (n - 1) / 2) * hw * 0.3, 0.36 + hh * 0.5 + 0.03, 0);
    }
    if (tier >= 7) {
      // 頭の前後の面に、光る文様
      const rune = this.mat('#ffb36a', '#ff7a2a', 1.2);
      for (const z of [-1, 1]) {
        this.add(new THREE.BoxGeometry(hw * 0.55, 0.008, 0.004), rune, 0, 0.36 + (hh - 0.09) / 2, z * (hd / 2 + 0.002));
        this.add(new THREE.BoxGeometry(0.008, hh * 0.5, 0.004), rune, 0, 0.36 + (hh - 0.09) / 2, z * (hd / 2 + 0.002));
      }
    }
  }

  private staff() {
    const tier = this.tier;
    const wood = this.mat(COLORS.wood);
    // 柄：握るところ（原点）から、下は床の近くまで、上は頭より高く
    this.add(new THREE.CylinderGeometry(0.017, 0.022, 0.92, 12), wood, 0, 0.17, 0);
    // 先：金色の輪で宝石を留める。宝石はかすかに光る。段階が上がるほど宝石が大きく、明るくなる
    const gold = this.mat(COLORS.gold);
    const gemColor = GEM_COLORS[tier - 1] ?? '#9b6cf0';
    const gem = this.mat(gemColor, gemColor, 0.5 + 0.06 * tier);
    const gs = 0.04 * (1 + 0.07 * (tier - 1)); // 宝石の大きさ
    this.add(new THREE.CylinderGeometry(0.03, 0.022, 0.05, 12), this.mat(COLORS.woodDark), 0, 0.64, 0);
    this.add(new THREE.TorusGeometry(0.045, 0.011, 6, 18), gold, 0, 0.71, 0);
    this.add(new THREE.OctahedronGeometry(gs).scale(0.9, 1.4, 0.9), gem, 0, 0.72 + (gs - 0.04) * 0.8, 0);
    if (tier >= 3) {
      // 宝石を抱く爪
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const claw = this.add(new THREE.ConeGeometry(0.008, 0.07, 6), gold, Math.cos(a) * 0.05, 0.75, Math.sin(a) * 0.05);
        claw.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
      }
    }
    if (tier >= 5) this.add(new THREE.TorusGeometry(0.055, 0.008, 6, 20), gold, 0, 0.66, 0).rotation.x = 0.35; // 二つ目の輪
    if (tier >= 7) {
      // まわりに浮かぶ小さな宝石
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        this.add(new THREE.OctahedronGeometry(0.014).scale(0.9, 1.3, 0.9), gem, Math.cos(a) * 0.085, 0.76 + (i % 2) * 0.04, Math.sin(a) * 0.085);
      }
    }
    if (tier >= 9) {
      // 羽根（左右に反った細長い板）
      const feather = this.mat('#f4eefc');
      for (const side of [-1, 1]) {
        const f = this.add(new THREE.BoxGeometry(0.1, 0.012, 0.03).translate(side * 0.05, 0, 0), feather, 0, 0.68, 0);
        f.rotation.z = side * 0.5;
      }
    }
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}
