// 階段の立体の模型。ダンジョンの特性ごとに、石の色と飾りを変える。
//
// - 下り階段：床に開いた四角い穴の中へ、奥（-z、画面の上）へ向かって下りていく石段。
//   穴の縁は床より少し高い石の枠。下の段ほど暗く、下り切った奥の壁には、さらに下へ続く暗い通路の口が開いている
//   （特性によっては、その奥からかすかに光が漏れる）
// - 上り階段：両脇に壁のある、奥へ向かって上っていく石段。上り切った先の奥に、柱と梁で囲んだ暗い入口がある
//
// どちらもマスの中心が原点。カメラは手前（+z）の斜め上から見下ろすので、段の踏み面と、穴の奥の壁が見える。
// 特性ごとの飾り：
// - 無属性：すり減った灰茶色の石。段の高さと幅が少しずつ不ぞろい
// - 炎：黒い玄武岩。段の角に溶岩の割れ目が光り、穴の底は赤く燃える
// - 氷：青白い氷。段の角は白く霜がつき、穴の縁からつららが下がる
// - 光：白い大理石。段の角に金の縁取り、穴の底から暖かい光
// - 闇：黒紫の石。穴の縁にとげのような岩が並び、底から紫の光がかすかに漏れる

import * as THREE from 'three';
import type { TraitId } from '../game/types';

type Style = {
  stone: number; // 段の石の色
  rim: number; // 穴の縁・上り階段の脇の壁の色
  nosing: number; // 段の角（踏み面の手前の縁）の色
  nosingGlow?: number; // 段の角が光るときの色
  bottomGlow?: number; // 穴の底から漏れる光の色（なければ真っ暗）
  rough: number; // 段の高さ・幅の不ぞろいさ（0〜1）
  detail: 'none' | 'icicles' | 'spikes';
};

const STYLES: Record<TraitId, Style> = {
  neutral: { stone: 0x8f8676, rim: 0x6c6457, nosing: 0x9d9483, rough: 1, detail: 'none' },
  fire: { stone: 0x3b2d29, rim: 0x2c211e, nosing: 0x8a3a1c, nosingGlow: 0xff6a1f, bottomGlow: 0xd8451a, rough: 0.6, detail: 'none' },
  ice: { stone: 0xa9d3e6, rim: 0x86b8d0, nosing: 0xf1fbff, rough: 0.3, detail: 'icicles' },
  light: { stone: 0xe6e0d0, rim: 0xcfc6b0, nosing: 0xd9b14a, bottomGlow: 0xffe7a8, rough: 0, detail: 'none' },
  dark: { stone: 0x2f2937, rim: 0x231e2a, nosing: 0x463d52, bottomGlow: 0x6a35c8, rough: 0.5, detail: 'spikes' },
};

const DOWN = { opening: 0.86, steps: 5, tread: 0.15, rise: 0.13, depth: 0.95, rimHeight: 0.04, rimWidth: 0.07, passage: 0.55 };
const UP = { width: 0.66, steps: 4, tread: 0.19, rise: 0.13, wall: 0.08, door: 0.5 };

/** 決まった値の、0〜1の揺らぎ（作り直しても同じ形になるように） */
const wobble = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** 特性ごとの階段の模型を作って持っておく（同じものを何度も使い回す） */
export class Stairs3D {
  private readonly built = new Map<string, THREE.Group>();
  private readonly disposables: { dispose(): void }[] = [];

  /** prepare は、作った素材すべてに1回だけかける処理（霧をかけるなど） */
  constructor(private readonly prepare: (m: THREE.Material) => void) {}

  get(kind: 'down' | 'up', trait: TraitId): THREE.Group {
    const key = `${kind}:${trait}`;
    let group = this.built.get(key);
    if (!group) {
      group = kind === 'down' ? this.down(STYLES[trait]) : this.up(STYLES[trait]);
      this.built.set(key, group);
    }
    return group;
  }

  private mat(color: number, emissive?: number, intensity = 1) {
    const m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...(emissive !== undefined ? { emissive, emissiveIntensity: intensity } : {}) });
    this.prepare(m);
    this.disposables.push(m);
    return m;
  }

  private mesh(group: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) {
    this.disposables.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    group.add(m);
    return m;
  }

  private down(st: Style): THREE.Group {
    const g = new THREE.Group();
    const half = DOWN.opening / 2;
    const bottom = -DOWN.steps * DOWN.rise; // いちばん下の段の高さ
    // 穴の壁（内側を向いた面）。奥の壁と左右の壁が見える。深いところほど暗い色にする
    const bands = 4;
    for (let b = 0; b < bands; b++) {
      const top = (-DOWN.depth * b) / bands;
      const h = DOWN.depth / bands;
      const mat = this.mat(darken(st.rim, 0.8 - b * 0.22));
      this.mesh(g, new THREE.PlaneGeometry(DOWN.opening, h).rotateY(Math.PI / 2), mat, -half, top - h / 2, 0); // 左
      this.mesh(g, new THREE.PlaneGeometry(DOWN.opening, h).rotateY(-Math.PI / 2), mat, half, top - h / 2, 0); // 右
      // 奥の壁：いちばん下には、さらに下へ続く通路の口を開ける（口のまわりだけ壁を張る）
      const mouthTop = bottom + DOWN.passage;
      if (top - h >= mouthTop) this.mesh(g, new THREE.PlaneGeometry(DOWN.opening, h), mat, 0, top - h / 2, -half);
      else if (top > mouthTop) this.mesh(g, new THREE.PlaneGeometry(DOWN.opening, top - mouthTop), mat, 0, (top + mouthTop) / 2, -half);
    }
    // 通路の口：真っ暗か、奥からかすかに光が漏れる（下ほど明るい光の板を2枚重ねる）
    const mouth = st.bottomGlow !== undefined ? this.mat(0x000000, darken(st.bottomGlow, 0.16), 1) : this.mat(0x020203);
    this.mesh(g, new THREE.PlaneGeometry(DOWN.opening * 0.8, DOWN.passage), mouth, 0, bottom + DOWN.passage / 2, -half - 0.02);
    if (st.bottomGlow !== undefined) {
      this.mesh(g, new THREE.PlaneGeometry(DOWN.opening * 0.8, DOWN.passage * 0.3), this.mat(0x000000, st.bottomGlow, 0.38), 0, bottom + DOWN.passage * 0.15, -half - 0.015);
    }
    // 通路の口の左右と上の縁（口の大きさに合わせて、穴の壁から張り出す）
    const jamb = this.mat(darken(st.rim, 0.45));
    const side = (DOWN.opening - DOWN.opening * 0.8) / 2;
    for (const sx of [-1, 1]) this.mesh(g, new THREE.PlaneGeometry(side, DOWN.passage), jamb, sx * (half - side / 2), bottom + DOWN.passage / 2, -half);
    // 底：真っ暗
    this.mesh(g, new THREE.PlaneGeometry(DOWN.opening, DOWN.opening).rotateX(-Math.PI / 2), this.mat(0x030304), 0, -DOWN.depth, 0);
    // 段：手前（+z）の縁から、奥へ下りていく。下の段ほど暗い
    const nosingMat = st.nosingGlow !== undefined ? this.mat(st.nosing, st.nosingGlow, 0.9) : this.mat(st.nosing);
    for (let k = 0; k < DOWN.steps; k++) {
      const shade = 0.95 - (k / (DOWN.steps - 1)) * 0.72;
      const top = -(k + 1) * DOWN.rise + (wobble(k, 1) - 0.5) * 0.02 * st.rough;
      const zFront = half - k * DOWN.tread;
      const width = DOWN.opening - 0.02 - wobble(k, 2) * 0.04 * st.rough;
      const height = DOWN.depth + top; // 段の上面から穴の底まで
      const tread = k === DOWN.steps - 1 ? zFront + half : DOWN.tread; // いちばん下の段は、奥の壁まで続く踊り場
      this.mesh(g, new THREE.BoxGeometry(width, height, tread), this.mat(darken(st.stone, shade)), (wobble(k, 3) - 0.5) * 0.02 * st.rough, top - height / 2, zFront - tread / 2);
      // 段の角
      this.mesh(g, new THREE.BoxGeometry(width + 0.005, 0.022, 0.03), nosingMat, 0, top - 0.008, zFront - 0.015);
    }
    // 穴の縁：床より少し高い石の枠（4辺）
    const rim = this.mat(st.rim);
    const w = DOWN.rimWidth;
    const outer = DOWN.opening + w * 2;
    const ry = DOWN.rimHeight / 2;
    this.mesh(g, new THREE.BoxGeometry(outer, DOWN.rimHeight, w), rim, 0, ry, -half - w / 2);
    this.mesh(g, new THREE.BoxGeometry(outer, DOWN.rimHeight, w), rim, 0, ry, half + w / 2);
    this.mesh(g, new THREE.BoxGeometry(w, DOWN.rimHeight, DOWN.opening), rim, -half - w / 2, ry, 0);
    this.mesh(g, new THREE.BoxGeometry(w, DOWN.rimHeight, DOWN.opening), rim, half + w / 2, ry, 0);
    if (st.detail === 'icicles') this.icicles(g, -half + 0.01, 0, DOWN.opening);
    if (st.detail === 'spikes') this.spikes(g, st, half + w / 2);
    return g;
  }

  private up(st: Style): THREE.Group {
    const g = new THREE.Group();
    const nosingMat = st.nosingGlow !== undefined ? this.mat(st.nosing, st.nosingGlow, 0.9) : this.mat(st.nosing);
    const half = 0.45;
    const sideMat = this.mat(st.rim);
    for (let k = 0; k < UP.steps; k++) {
      const top = (k + 1) * UP.rise + (wobble(k, 4) - 0.5) * 0.02 * st.rough;
      const zFront = half - k * UP.tread;
      const width = UP.width - wobble(k, 5) * 0.04 * st.rough;
      this.mesh(g, new THREE.BoxGeometry(width, top, UP.tread), this.mat(darken(st.stone, 0.95 - k * 0.1)), 0, top / 2, zFront - UP.tread / 2);
      this.mesh(g, new THREE.BoxGeometry(width + 0.005, 0.022, 0.03), nosingMat, 0, top - 0.008, zFront - 0.015);
    }
    // 両脇の壁：段の上へ斜めに上がる石の壁（手前は低く、奥は入口の柱につながる）
    const run = UP.steps * UP.tread;
    const zBack = half - run;
    for (const sx of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(half, 0);
      shape.lineTo(half, 0.12);
      shape.lineTo(zBack, UP.steps * UP.rise + 0.16);
      shape.lineTo(zBack, 0);
      shape.lineTo(half, 0);
      // 形は z（横）と y（縦）で描き、厚みを x の向きに出す
      const geo = new THREE.ExtrudeGeometry(shape, { depth: UP.wall, bevelEnabled: false }).rotateY(-Math.PI / 2);
      this.mesh(g, geo, sideMat, sx * (UP.width / 2) + (sx > 0 ? UP.wall : 0), 0, 0);
    }
    // 上り切った先の入口：奥の柱と梁と、その奥の暗がり（特性によってはかすかな光）
    const top = UP.steps * UP.rise;
    const doorTop = top + UP.door;
    const frame = this.mat(darken(st.rim, 1.1));
    for (const sx of [-1, 1]) this.mesh(g, new THREE.BoxGeometry(UP.wall * 1.2, doorTop, UP.wall * 1.4), frame, sx * (UP.width / 2 + UP.wall * 0.6), doorTop / 2, zBack - UP.wall * 0.7);
    this.mesh(g, new THREE.BoxGeometry(UP.width + UP.wall * 2.4, 0.08, UP.wall * 1.4), frame, 0, doorTop - 0.04, zBack - UP.wall * 0.7);
    const dark = st.bottomGlow !== undefined ? this.mat(0x000000, darken(st.bottomGlow, 0.14), 1) : this.mat(0x020203);
    this.mesh(g, new THREE.PlaneGeometry(UP.width, UP.door - 0.08), dark, 0, top + (UP.door - 0.08) / 2, zBack - 0.06);
    if (st.detail === 'icicles') this.icicles(g, zBack - UP.wall * 0.7 + 0.06, doorTop - 0.08, UP.width, true);
    if (st.detail === 'spikes') {
      // 入口の梁の上に、とげのような岩
      const rock = this.mat(darken(st.rim, 1.25));
      for (let i = 0; i < 4; i++) {
        const len = 0.06 + wobble(i, 11) * 0.06;
        this.mesh(g, new THREE.ConeGeometry(0.022, len, 4), rock, -UP.width / 2 + (UP.width * (i + 0.5)) / 4, doorTop + len / 2, zBack - UP.wall * 0.7);
      }
    }
    return g;
  }

  /** つらら：縁に沿って、長さの違う細い氷の円すいを並べる（先が下） */
  private icicles(g: THREE.Group, z: number, y: number, span: number, front = false) {
    const ice = this.mat(0xe4f6ff, 0x9fd6ef, 0.25);
    const count = 7;
    for (let i = 0; i < count; i++) {
      const len = 0.06 + wobble(i, 7) * 0.12;
      const x = -span / 2 + (span * (i + 0.5)) / count;
      const cone = this.mesh(g, new THREE.ConeGeometry(0.018, len, 5), ice, x, y - len / 2, front ? z : z + 0.012);
      cone.rotation.x = Math.PI; // 先を下へ
    }
  }

  /** とげのような岩：穴の縁の手前以外の3辺に、黒い岩の円すいを並べる（先が上） */
  private spikes(g: THREE.Group, st: Style, edge: number) {
    const rock = this.mat(darken(st.rim, 1.25));
    const spots: [number, number][] = [];
    for (let i = 0; i < 5; i++) spots.push([-edge + (edge * 2 * (i + 0.5)) / 5, -edge]);
    for (let i = 0; i < 3; i++) {
      const z = -edge + (edge * 2 * (i + 0.5)) / 3.5;
      spots.push([-edge, z], [edge, z]);
    }
    spots.forEach(([x, z], i) => {
      const len = 0.07 + wobble(i, 9) * 0.08;
      const cone = this.mesh(g, new THREE.ConeGeometry(0.025, len, 4), rock, x, DOWN.rimHeight + len / 2, z);
      cone.rotation.z = (wobble(i, 10) - 0.5) * 0.4;
    });
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.built.clear();
  }
}

function darken(color: number, k: number): number {
  const c = new THREE.Color(color).multiplyScalar(k);
  return c.getHex();
}
