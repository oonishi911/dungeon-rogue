// 呪文の演出（3D表示）。唱えたときに1回だけ出して、時間がたつと消える。
//
// どの呪文にも共通の「土台」：
// - 唱える溜め：足元に呪文の色の魔法陣が開いて回り、光の柱が一瞬立つ
// - まわりを照らす光：飛ぶ玉やはじける光が、床と壁を呪文の色で照らす（影は作らない軽い光。数を決めて使い回すので、作り直しの重さが出ない）
// - 画面の揺れと閃光：強い呪文ほど大きく揺らし、画面全体を一瞬光らせる（闇は暗くする）。動きを減らす設定では出さない
// - 当たったとき：onImpact で、当たったマスと強さを知らせる（敵を光らせる・のけぞらせるのは explore3d.ts）
// - 相性：弱点なら大きく派手に、効きにくければ小さく、くすんだ色にする（CastEvent の affinity）
//
// 矢の4種類（炎・氷・光・闇）は、それぞれ飛び方と、当たったときの見た目が違う：
// - 炎の矢：揺らめく火の玉が火の粉と煙を散らして飛び、当たると爆発して炎が立ちのぼり、床に焦げ跡が少し残る
// - 氷の矢：回りながら飛ぶ氷のかけらが冷気の尾を引き、当たると床から氷の結晶が突き出して砕け、破片が飛び散る
// - 光の槍：一瞬で届く光の柱が走り、当たると天から光が降りて、十字のきらめきと強い閃光
// - 闇の矢：まわりの光を吸うような黒い玉が闇のもやを引き、当たると渦が開いて閉じ、黒いもやが残る
// 衝撃波・なぎ払い・癒し・再生は、前からの演出に土台（魔法陣・光・揺れ）を足したもの。
//
// 光って見えるものは、足し合わせて描く（AdditiveBlending）板と玉で表す。霧はかけない（呪文の光は暗がりでも見える）
import * as THREE from 'three';
import type { Affinity, CastEvent } from '../game/exploreTypes';
import type { Pos } from '../game/map';
import type { Element, SpellId } from '../game/types';
import { beamTexture, circleTexture, columnTexture, directionOf, easeIn, easeOut, easeOutBack, muted, outerMat, pick, radialTexture, randomUnit, ringTexture, screenQuad, smokeTexture, sparkTexture, spiralTexture, starTexture, streakTexture } from './spellFxKit';

// 属性の色（矢・槍の光）
const ELEMENT_COLORS: Record<Element, number> = {
  fire: 0xff6a1a,
  ice: 0x8fd8ff,
  light: 0xffe680,
  dark: 0xa070ff,
  neutral: 0xe8e2d0,
};

const BOLT_ELEMENT: Partial<Record<SpellId, Element>> = { fire_bolt: 'fire', ice_bolt: 'ice', light_lance: 'light', dark_bolt: 'dark' };

// 相性による強さ（大きさ・粒の数・揺れ・閃光に掛ける）。何にも当たらなかったときは miss
const STRENGTH = { weak: 1.5, normal: 1, resist: 0.55, miss: 0.7 } as const;

// 時間（ミリ秒）と大きさ（マス）
const FX = {
  height: 0.5, // 演出を出す高さ（主人公の胸のあたり）
  circle: { ms: 700, size: 1.7 }, // 唱える溜めの魔法陣
  bolt: { chargeMs: 180, tileMs: 60, minFlyMs: 170, lanceMs: 70 },
  shockwave: { ms: 520, radius: 2.1, color: 0xcfe6ff },
  sweep: { ms: 320, width: 0.55, color: 0xf2ecd8 },
  heal: { ms: 900, sparks: 18, rise: 1.2, color: 0x8dffb4 },
  regen: { ms: 1000, sparks: 14, rise: 0.9, color: 0xd8ffa0 },
  lights: 2, // 照らす光の数（使い回す）
  maxParticles: 320, // 一度に出す粒の上限（重くならないように）
  shake: { amp: 0.42, decay: 2.4 }, // 揺れの大きさ（マス）と、1秒あたりの収まる速さ
} as const;

interface Running {
  start: number;
  ms: number;
  group: THREE.Group;
  update: (t: number, now: number) => void; // t は 0〜1
}

interface Particle {
  obj: THREE.Sprite | THREE.Mesh;
  mat: THREE.Material & { opacity: number };
  start: number;
  life: number;
  vel: THREE.Vector3;
  gravity: number;
  drag: number;
  size: [number, number];
  alpha: number;
  spin: THREE.Vector3 | null;
  bounce: boolean;
}

interface EmitOptions {
  at: THREE.Vector3;
  count: number;
  color: number | (() => number);
  speed: [number, number];
  dir?: THREE.Vector3; // 飛ぶ向きの偏り（なければ全方向）
  spread?: number; // dir からどれだけ散らすか（0〜1）
  up?: number; // 上向きに足す速さ
  flat?: boolean; // 床に沿って広がる（上下には散らさない）
  gravity?: number;
  drag?: number;
  life: [number, number];
  size: [number, number];
  alpha?: number;
  additive?: boolean;
  texture?: 'glow' | 'smoke' | 'spark';
  jitter?: number; // 出す位置のばらつき（マス）
}

type Lit = { light: THREE.PointLight; until: number };

export class SpellEffects {
  /** 当たったとき（敵を光らせる・のけぞらせる）。at は当たったマス、strength は相性の強さ、color は呪文の色 */
  onImpact: ((at: Pos, strength: number, color: number) => void) | null = null;

  private running: Running[] = [];
  private particles: Particle[] = [];
  private timers: { at: number; fn: () => void }[] = [];
  private lastNow = performance.now();
  private trauma = 0; // 揺れの強さ（0〜1）。大きいほど強く揺れ、時間とともに収まる
  private flashLevel = 0;
  private darkLevel = 0;
  /** 今の揺れ（カメラの位置と、見る先に足す） */
  readonly shake = new THREE.Vector3();

  private readonly tex = {
    glow: radialTexture(),
    streak: streakTexture(),
    circle: circleTexture(),
    star: starTexture(),
    spiral: spiralTexture(),
    smoke: smokeTexture(),
    spark: sparkTexture(),
    ring: ringTexture(),
    beam: beamTexture(),
    column: columnTexture(),
  };
  private readonly lights: Lit[] = [];
  // 画面全体の閃光（足し合わせる）と、暗くする幕。どちらも画面に直接描く板
  private readonly flashQuad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly darkQuad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private flashColor = new THREE.Color(0xffffff);
  private readonly shared = {
    plane: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), // 床に寝かせた板
    shard: new THREE.OctahedronGeometry(0.5, 0).scale(0.28, 0.28, 1), // 細長い氷のかけら（z の向きに長い）
    chip: new THREE.TetrahedronGeometry(0.07, 0), // 砕けた氷の破片
    spike: new THREE.ConeGeometry(0.16, 1, 5, 1).translate(0, 0.5, 0), // 床から突き出す氷の結晶（根元が原点）
    column: new THREE.CylinderGeometry(1, 1, 1, 28, 1, true).translate(0, 0.5, 0), // 光の柱（根元が原点）
  };

  constructor(
    private readonly scene: THREE.Scene,
    private readonly reduceMotion: boolean,
  ) {
    for (let i = 0; i < FX.lights; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 7, 1.3);
      light.castShadow = false;
      scene.add(light);
      this.lights.push({ light, until: 0 });
    }
    this.flashQuad = screenQuad(THREE.AdditiveBlending, false);
    this.darkQuad = screenQuad(THREE.NormalBlending, true);
    this.darkQuad.material.uniforms.color!.value = new THREE.Color(0x07020f);
    scene.add(this.flashQuad, this.darkQuad);
  }

  /**
   * 呪文の演出を始める。from は唱えた主人公のマス、affinity は当たった敵への相性（null は何にも当たらなかった。ふつうは cast のまま）。
   * 返す値は、唱えてから当たるまでのミリ秒（ダメージの数字を当たったときに出すため）。当たる演出のない呪文は 0
   */
  start(cast: CastEvent, from: Pos, affinity: Affinity | null = cast.affinity): number {
    const now = performance.now();
    const element = BOLT_ELEMENT[cast.spell];
    if (element) return this.bolt(now, cast, from, element, affinity);
    switch (cast.spell) {
      case 'shockwave':
        this.castCircle(now, from, FX.shockwave.color, 0.8);
        this.shockwave(now, from);
        break;
      case 'sweep':
        this.castCircle(now, from, FX.sweep.color, 0.7);
        this.sweep(now, from, cast.path);
        break;
      case 'heal':
      case 'regen':
        this.castCircle(now, from, FX[cast.spell].color, 0.9);
        this.sparkles(now, from, cast.spell);
        break;
    }
    return 0;
  }

  /** 毎フレーム呼ぶ。動いていれば true（もう1フレーム描く必要がある） */
  update(now: number): boolean {
    const dt = Math.min(0.05, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;
    // 時間になった出来事（当たる、など）
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= now);
      this.timers = this.timers.filter((t) => t.at > now);
      for (const t of due) t.fn();
    }
    for (let k = this.running.length - 1; k >= 0; k--) {
      const fx = this.running[k]!;
      if (now < fx.start) {
        fx.group.visible = false;
        continue;
      }
      const t = Math.min(1, (now - fx.start) / fx.ms);
      if (t >= 1) {
        this.disposeGroup(fx.group);
        this.running.splice(k, 1);
      } else {
        fx.group.visible = true;
        fx.update(t, now);
      }
    }
    this.updateParticles(now, dt);
    for (const l of this.lights) if (now > l.until) l.light.intensity = 0;
    // 揺れ：強さの2乗で揺らす（小さな揺れは目立たず、大きな揺れだけがはっきり出る）
    this.trauma = Math.max(0, this.trauma - FX.shake.decay * dt);
    const k = this.trauma * this.trauma * FX.shake.amp;
    const s = now / 1000;
    this.shake.set(k * (Math.sin(s * 71) * 0.6 + Math.sin(s * 37) * 0.4), 0, k * (Math.sin(s * 59 + 1.3) * 0.6 + Math.sin(s * 23 + 0.7) * 0.4));
    // 閃光と暗くする幕は、なめらかに戻す
    this.flashLevel = Math.max(0, this.flashLevel - dt * 2.8);
    this.darkLevel = Math.max(0, this.darkLevel - dt * 1.1);
    this.flashQuad.material.uniforms.opacity!.value = this.flashLevel;
    this.flashQuad.material.uniforms.color!.value = this.flashColor;
    this.flashQuad.visible = this.flashLevel > 0.001;
    this.darkQuad.material.uniforms.opacity!.value = Math.min(0.75, this.darkLevel);
    this.darkQuad.visible = this.darkLevel > 0.001;
    return this.running.length > 0 || this.particles.length > 0 || this.timers.length > 0 || this.trauma > 0 || this.flashLevel > 0 || this.darkLevel > 0;
  }

  dispose() {
    for (const fx of this.running) this.disposeGroup(fx.group);
    this.running = [];
    for (const p of this.particles) this.removeParticle(p);
    this.particles = [];
    this.timers = [];
    for (const l of this.lights) this.scene.remove(l.light);
    for (const q of [this.flashQuad, this.darkQuad]) {
      this.scene.remove(q);
      q.geometry.dispose();
      q.material.dispose();
    }
    for (const t of Object.values(this.tex)) t.dispose();
    for (const g of Object.values(this.shared)) g.dispose();
  }

  // ===== 土台 =====

  /** 画面を揺らす。amount は 0〜1 */
  private shakeBy(amount: number) {
    if (this.reduceMotion) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** 画面全体を、一瞬その色で光らせる。amount は明るさ（0〜1） */
  private flash(color: number, amount: number) {
    if (this.reduceMotion) return;
    this.flashColor = new THREE.Color(color);
    this.flashLevel = Math.max(this.flashLevel, amount);
  }

  /** 画面のまわりを暗くする（闇の呪文） */
  private darken(amount: number) {
    if (this.reduceMotion) return;
    this.darkLevel = Math.max(this.darkLevel, amount);
  }

  /** 照らす光を1つ借りて、ms のあいだ光らせる。where(t) で位置、curve(t) で明るさ（0〜1）を決める */
  private lightUp(start: number, ms: number, color: number, peak: number, where: (t: number) => THREE.Vector3, curve: (t: number) => number) {
    const lit = this.lights.reduce((a, b) => (a.until <= b.until ? a : b));
    lit.until = start + ms;
    lit.light.color.setHex(color);
    lit.light.intensity = 0;
    this.add(start, ms, [], (t) => {
      if (lit.until !== start + ms) return; // あとから別の光に使われた
      lit.light.position.copy(where(t));
      lit.light.intensity = peak * curve(t);
    });
  }

  /** 唱える溜め：足元に魔法陣が開いて回り、光の柱が一瞬立ち、光の粒が立ちのぼる */
  private castCircle(now: number, at: Pos, color: number, size = 1) {
    const ms = FX.circle.ms;
    const outer = this.floorPlane(this.tex.circle, color, 0.035);
    const inner = this.floorPlane(this.tex.circle, 0xffffff, 0.04);
    const pillar = new THREE.Mesh(this.shared.column, this.glowMaterial(color, this.tex.column));
    pillar.position.set(at.x, 0, at.y);
    pillar.renderOrder = 15;
    for (const o of [outer, inner]) o.position.set(at.x, o.position.y, at.y);
    this.add(now, ms, [outer, inner, pillar], (t) => {
      const open = easeOutBack(Math.min(1, t / 0.28));
      const r = FX.circle.size * size * open;
      outer.scale.set(Math.max(0.001, r), 1, Math.max(0.001, r));
      inner.scale.set(Math.max(0.001, r * 0.62), 1, Math.max(0.001, r * 0.62));
      outer.rotation.y = t * 2.4;
      inner.rotation.y = -t * 3.6;
      const fade = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
      outerMat(outer).opacity = 0.95 * fade;
      outerMat(inner).opacity = 0.55 * fade;
      const p = Math.min(1, t / 0.2);
      pillar.scale.set(0.42 * size * (1 - t * 0.5), 2.4 * size * p, 0.42 * size * (1 - t * 0.5));
      outerMat(pillar).opacity = t < 0.2 ? p * 0.8 : 0.8 * Math.max(0, 1 - (t - 0.2) / 0.45);
    });
    this.emit({
      at: new THREE.Vector3(at.x, 0.05, at.y),
      count: Math.round(14 * size),
      color,
      speed: [0.2, 0.6],
      flat: true,
      up: 1.6,
      gravity: -0.4,
      drag: 1.5,
      life: [450, 800],
      size: [0.16, 0.04],
      jitter: 0.55 * size,
      additive: true,
    });
    this.lightUp(now, ms, color, 7 * size, () => new THREE.Vector3(at.x, 0.6, at.y), (t) => (t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8));
  }

  // ===== 矢と槍 =====

  /** 矢・槍：溜めてから放ち、path の終わりまで飛んで当たる。返す値は、当たるまでのミリ秒 */
  private bolt(now: number, cast: CastEvent, from: Pos, element: Element, affinity: Affinity | null): number {
    const strength = STRENGTH[affinity ?? 'miss'];
    const base = ELEMENT_COLORS[element];
    const color = affinity === 'resist' ? muted(base, 0.55) : base;
    const dir = directionOf(cast, from);
    // 何にも当たらなければ、壁の手前（path の終わり）か、目の前で消える
    const last = cast.path.at(-1);
    const end = last ? new THREE.Vector3(last.x, FX.height, last.y) : new THREE.Vector3(from.x + dir.x * 0.6, FX.height, from.y + dir.z * 0.6);
    const begin = new THREE.Vector3(from.x + dir.x * 0.35, FX.height, from.y + dir.z * 0.35);
    const charge = this.reduceMotion ? 60 : FX.bolt.chargeMs;
    const tiles = Math.max(1, cast.path.length);
    const fly = element === 'light' ? FX.bolt.lanceMs : Math.max(FX.bolt.minFlyMs, FX.bolt.tileMs * tiles);
    const launch = now + charge;
    const hit = launch + fly;
    this.castCircle(now, from, color, element === 'light' ? 1.1 : 1);
    if (element === 'dark') this.darken(0.35);
    if (element === 'light') this.flash(0xfff6d0, 0.18);

    switch (element) {
      case 'fire':
        this.fireBolt(launch, fly, begin, end, color);
        break;
      case 'ice':
        this.iceBolt(launch, fly, begin, end, color, dir);
        break;
      case 'light':
        this.lightLance(launch, fly, begin, end, color, dir);
        break;
      default:
        this.darkBolt(launch, fly, begin, end, color);
    }
    const at = last ?? from;
    this.later(hit, () => {
      switch (element) {
        case 'fire':
          this.fireImpact(end, color, strength);
          break;
        case 'ice':
          this.iceImpact(end, color, strength);
          break;
        case 'light':
          this.lightImpact(end, color, strength);
          break;
        default:
          this.darkImpact(end, color, strength);
      }
      if (affinity === 'weak') this.weakBurst(end, color);
      if (affinity && last) {
        this.hitSpark(end, strength);
        this.onImpact?.(at, strength, color);
      }
    });
    return hit - now;
  }

  /** 当たった敵が一瞬白く光る */
  private hitSpark(at: THREE.Vector3, s: number) {
    const spark = this.orb(0xffffff, 1);
    spark.position.copy(at).setY(FX.height + 0.05);
    this.add(performance.now(), 220, [spark], (t) => {
      spark.scale.setScalar(1.3 * s * (0.7 + 0.5 * t));
      spark.material.opacity = 0.9 * (1 - t);
    });
  }

  /** 弱点を突いたときに足す、二重の輪と白い閃光 */
  private weakBurst(at: THREE.Vector3, color: number) {
    const now = performance.now();
    for (const [delay, c] of [
      [0, 0xffffff],
      [90, color],
    ] as const) {
      const ring = this.floorPlane(this.tex.ring, c, 0.07);
      ring.position.set(at.x, 0.07, at.z);
      this.add(now + delay, 420, [ring], (t) => {
        const r = 0.3 + 2.8 * easeOut(t);
        ring.scale.set(r, 1, r);
        outerMat(ring).opacity = 1 - t;
      });
    }
    this.flash(0xffffff, 0.3);
    this.shakeBy(0.25);
  }

  /** 炎の矢：揺らめく火の玉が、火の粉と煙を散らしながら飛ぶ */
  private fireBolt(start: number, fly: number, begin: THREE.Vector3, end: THREE.Vector3, color: number) {
    const core = this.orb(0xfff4d0, 0.3);
    const mid = this.orb(0xffa040, 0.65);
    const outer = this.orb(color, 1.1);
    const pos = new THREE.Vector3();
    let lastEmit = start;
    this.add(start, fly, [outer, mid, core], (t, now) => {
      pos.lerpVectors(begin, end, t);
      const flicker = 1 + Math.sin(now * 0.07) * 0.12 + Math.sin(now * 0.13) * 0.08;
      for (const [o, size] of [
        [core, 0.3],
        [mid, 0.65],
        [outer, 1.1],
      ] as const) {
        o.position.copy(pos);
        o.scale.setScalar(size * flicker);
      }
      // 飛んだ距離に合わせて、火の粉と煙を後ろに残す
      const n = Math.floor((now - lastEmit) / 14);
      if (n > 0) {
        lastEmit = now;
        this.emit({ at: pos, count: 3 * n, color: () => pick([0xffd060, 0xff8a2a, color]), speed: [0.2, 0.9], up: 0.5, gravity: 1.2, drag: 1, life: [250, 520], size: [0.16, 0.03], jitter: 0.12, additive: true, texture: 'spark' });
        this.emit({ at: pos, count: n, color: 0x2a1d18, speed: [0.05, 0.25], up: 0.6, gravity: -0.3, drag: 1, life: [500, 800], size: [0.25, 0.6], alpha: 0.45, jitter: 0.08, texture: 'smoke' });
      }
    });
    this.lightUp(start, fly, 0xff8a3a, 14, () => pos.clone(), () => 1);
  }

  /** 炎の矢が当たった：爆発、立ちのぼる炎、飛び散る火の粉、もくもくの煙、床の焦げ跡 */
  private fireImpact(at: THREE.Vector3, color: number, s: number) {
    const now = performance.now();
    const blast = this.orb(0xffffff, 1);
    const fireball = this.orb(color, 1);
    blast.position.copy(at);
    fireball.position.copy(at);
    this.add(now, 380, [fireball, blast], (t) => {
      blast.scale.setScalar((0.4 + 1.8 * easeOut(Math.min(1, t * 2.2))) * s);
      blast.material.opacity = Math.max(0, 1 - t * 2.2);
      fireball.scale.setScalar((0.5 + 2.9 * easeOut(t)) * s);
      fireball.material.opacity = 1 - t;
    });
    // 床を走る炎の輪
    const ring = this.floorPlane(this.tex.ring, 0xffa040, 0.06);
    ring.position.set(at.x, 0.06, at.z);
    this.add(now, 450, [ring], (t) => {
      const r = (0.3 + 2.6 * easeOut(t)) * s;
      ring.scale.set(r, 1, r);
      outerMat(ring).opacity = 1 - t;
    });
    // 立ちのぼる炎（縦に伸ばした光の玉を、少しずつずらして重ねる）
    const flames = Array.from({ length: 7 }, (_, i) => ({ o: this.orb(pick([0xffc050, 0xff7a2a, color]), 1), dx: (Math.random() - 0.5) * 0.5, dz: (Math.random() - 0.5) * 0.5, delay: i * 0.05 }));
    this.add(
      now,
      800,
      flames.map((f) => f.o),
      (t) => {
        for (const f of flames) {
          const u = Math.max(0, (t - f.delay) / (1 - f.delay));
          f.o.position.set(at.x + f.dx, 0.15 + u * 1.7 * s, at.z + f.dz);
          f.o.scale.set(0.55 * s * (1 - u * 0.6), 0.95 * s * (1 - u * 0.4), 1);
          f.o.material.opacity = u <= 0 ? 0 : Math.sin(Math.min(1, u * 1.15) * Math.PI) * 0.95;
        }
      },
    );
    this.emit({ at, count: Math.round(46 * s), color: () => pick([0xfff0a0, 0xffb040, 0xff6a1a, color]), speed: [1.4, 4.2], up: 1.4, gravity: 5.5, drag: 0.6, life: [450, 900], size: [0.2, 0.04], additive: true, texture: 'spark', jitter: 0.1 });
    this.emit({ at, count: Math.round(10 * s), color: 0x241a16, speed: [0.2, 0.7], up: 0.9, gravity: -0.6, drag: 1.2, life: [900, 1500], size: [0.5, 1.3], alpha: 0.55, texture: 'smoke', jitter: 0.3 });
    // 焦げ跡：少しのあいだ床に残る
    const scorch = this.floorPlane(this.tex.glow, 0x000000, 0.025, false);
    scorch.position.set(at.x, 0.025, at.z);
    scorch.scale.set(1.5 * s, 1, 1.5 * s);
    this.add(now, 2600, [scorch], (t) => {
      outerMat(scorch).opacity = 0.7 * (t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9);
    });
    this.lightUp(now, 700, 0xff7a2a, 26 * s, () => at.clone().setY(0.9), (t) => (1 - t) ** 1.5);
    this.flash(0xff8a3a, 0.28 * s);
    this.shakeBy(0.5 * s);
  }

  /** 氷の矢：回りながら飛ぶ氷のかけらが、冷気の尾ときらめきを残す */
  private iceBolt(start: number, fly: number, begin: THREE.Vector3, end: THREE.Vector3, color: number, dir: THREE.Vector3) {
    const shard = new THREE.Mesh(this.shared.shard, new THREE.MeshBasicMaterial({ color: 0xeafaff, transparent: true, opacity: 0.95 }));
    const halo = this.orb(color, 0.9);
    shard.lookAt(dir); // かけらの長い向き（z）を、飛ぶ向きへ
    shard.scale.setScalar(0.62);
    shard.renderOrder = 16;
    const holder = new THREE.Group();
    holder.add(shard);
    const pos = new THREE.Vector3();
    let lastEmit = start;
    this.add(start, fly, [holder, halo], (t, now) => {
      pos.lerpVectors(begin, end, t);
      holder.position.copy(pos);
      halo.position.copy(pos);
      shard.rotateZ(0.35);
      const n = Math.floor((now - lastEmit) / 14);
      if (n > 0) {
        lastEmit = now;
        this.emit({ at: pos, count: n, color: 0xd8f2ff, speed: [0.05, 0.25], drag: 2, life: [450, 750], size: [0.25, 0.75], alpha: 0.35, jitter: 0.06, texture: 'smoke' });
        this.emit({ at: pos, count: 2 * n, color: () => pick([0xffffff, color]), speed: [0.1, 0.5], gravity: 0.6, life: [300, 600], size: [0.12, 0.02], jitter: 0.15, additive: true, texture: 'spark' });
      }
    });
    this.lightUp(start, fly, 0xa8e4ff, 12, () => pos.clone(), () => 1);
  }

  /** 氷の矢が当たった：床から氷の結晶が突き出し、少し止まってから砕けて、破片が飛び散る */
  private iceImpact(at: THREE.Vector3, color: number, s: number) {
    const now = performance.now();
    const n = Math.round(9 * Math.min(1.4, s));
    const iceMat = new THREE.MeshPhongMaterial({ color: 0xcff2ff, emissive: 0x2f7fa8, specular: 0xffffff, shininess: 120, transparent: true, opacity: 0.88, flatShading: true });
    const spikes = Array.from({ length: n }, (_, i) => {
      const m = new THREE.Mesh(this.shared.spike, iceMat);
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const r = i === 0 ? 0 : 0.28 + Math.random() * 0.35;
      m.position.set(at.x + Math.cos(a) * r * s, 0, at.z + Math.sin(a) * r * s);
      m.rotation.set((Math.random() - 0.5) * 0.7, Math.random() * 6, (Math.random() - 0.5) * 0.7);
      const h = (i === 0 ? 1.15 : 0.45 + Math.random() * 0.5) * s;
      return { m, h, delay: i === 0 ? 0 : 0.03 + Math.random() * 0.12 };
    });
    const grow = 0.25; // 突き出すまで（全体の割合）
    const shatterAt = 0.55; // 砕けるとき
    this.add(
      now,
      700,
      spikes.map((p) => p.m),
      (t) => {
        for (const p of spikes) {
          const u = Math.max(0, Math.min(1, (t - p.delay) / grow));
          p.m.visible = t < shatterAt && u > 0;
          p.m.scale.set(1.1 * s, Math.max(0.001, p.h * easeOutBack(u)), 1.1 * s);
        }
      },
    );
    this.later(now + 700 * shatterAt, () => {
      for (const p of spikes) {
        const top = p.m.position.clone().setY(p.h * 0.5);
        this.emit({ at: top, count: 6, color: () => pick([0xeafaff, 0xbfe9ff, color]), speed: [1.4, 3.6], up: 1.8, gravity: 7, drag: 0.4, life: [600, 1000], size: [1, 0.6], alpha: 0.95, jitter: p.h * 0.4, shards: true });
      }
      this.emit({ at, count: Math.round(14 * s), color: 0xe8f8ff, speed: [0.6, 1.6], flat: true, drag: 2.2, life: [600, 1000], size: [0.4, 1.1], alpha: 0.45, texture: 'smoke', jitter: 0.3 });
      this.emit({ at, count: Math.round(24 * s), color: () => pick([0xffffff, color]), speed: [0.8, 2.6], up: 0.8, gravity: 1.5, life: [300, 700], size: [0.16, 0.03], additive: true, texture: 'spark' });
      this.flash(0xc8f0ff, 0.25 * s);
      this.shakeBy(0.35 * s);
    });
    // 床に広がる霜の輪
    const frost = this.floorPlane(this.tex.ring, 0xd8f4ff, 0.03);
    frost.position.set(at.x, 0.03, at.z);
    const frostIn = this.floorPlane(this.tex.glow, color, 0.028);
    frostIn.position.set(at.x, 0.028, at.z);
    this.add(now, 1800, [frost, frostIn], (t) => {
      const r = (0.4 + 1.6 * easeOut(Math.min(1, t * 3))) * s;
      frost.scale.set(r, 1, r);
      frostIn.scale.set(r * 0.9, 1, r * 0.9);
      const a = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
      outerMat(frost).opacity = 0.8 * a;
      outerMat(frostIn).opacity = 0.5 * a;
    });
    this.lightUp(now, 800, 0x9fe0ff, 18 * s, () => at.clone().setY(0.8), (t) => (t < 0.55 ? 0.7 : 1 - (t - 0.55) / 0.45));
    this.flash(0xa8e4ff, 0.15 * s);
    this.shakeBy(0.15 * s);
    this.later(now + 800, () => iceMat.dispose());
  }

  /** 光の槍：主人公から当たるところまで、一瞬で光の柱が走る。少し残って、細くなって消える */
  private lightLance(start: number, fly: number, begin: THREE.Vector3, end: THREE.Vector3, color: number, dir: THREE.Vector3) {
    const length = Math.max(0.6, begin.distanceTo(end) + 0.3);
    const angle = -Math.atan2(dir.z, dir.x);
    const outer = this.floorPlane(this.tex.beam, color, FX.height);
    const core = this.floorPlane(this.tex.beam, 0xffffff, FX.height + 0.01);
    const ms = fly + 520;
    this.add(start, ms, [outer, core], (t) => {
      const shot = Math.min(1, (t * ms) / fly); // 伸びていく途中
      const len = length * easeOut(shot);
      const center = begin.clone().add(dir.clone().multiplyScalar(len / 2 - 0.15));
      const after = Math.max(0, (t * ms - fly) / (ms - fly));
      const pulse = 1 + Math.sin(t * 40) * 0.08;
      for (const [o, width, alpha] of [
        [outer, 0.95, 0.9],
        [core, 0.32, 1],
      ] as const) {
        o.position.set(center.x, o.position.y, center.z);
        o.rotation.y = angle;
        o.scale.set(Math.max(0.001, len), 1, Math.max(0.001, width * pulse * (1 - after * 0.85)));
        outerMat(o).opacity = alpha * (1 - after ** 1.5);
      }
    });
    // 通ったところに残るきらめき
    this.later(start + fly, () => {
      const steps = Math.max(2, Math.round(length * 4));
      for (let i = 0; i < steps; i++) {
        const p = begin.clone().lerp(end, i / steps);
        this.emit({ at: p, count: 2, color: () => pick([0xffffff, color]), speed: [0.1, 0.5], up: 0.7, gravity: -0.3, life: [400, 800], size: [0.16, 0.03], jitter: 0.12, additive: true, texture: 'spark' });
      }
    });
    this.lightUp(start, ms, 0xfff2c0, 16, () => begin.clone().lerp(end, 0.5).setY(0.9), (t) => (t < 0.15 ? t / 0.15 : (1 - t) ** 1.2));
  }

  /** 光の槍が当たった：天から光の柱が降り、十字のきらめきが回って、画面が白く光る */
  private lightImpact(at: THREE.Vector3, color: number, s: number) {
    const now = performance.now();
    const pillar = new THREE.Mesh(this.shared.column, this.glowMaterial(0xfff6d8, this.tex.column));
    pillar.position.set(at.x, 0, at.z);
    pillar.renderOrder = 15;
    this.add(now, 650, [pillar], (t) => {
      const w = 0.6 * s * (1 - t * 0.85);
      pillar.scale.set(w, 6, w);
      outerMat(pillar).opacity = t < 0.08 ? t / 0.08 : 1 - (t - 0.08) / 0.92;
    });
    const star = this.orb(0xffffff, 1, this.tex.star);
    const star2 = this.orb(color, 1, this.tex.star);
    const glow = this.orb(color, 1);
    for (const o of [star, star2, glow]) o.position.copy(at).setY(FX.height + 0.1);
    this.add(now, 600, [glow, star2, star], (t) => {
      const grow = easeOut(Math.min(1, t * 3));
      star.scale.setScalar((0.5 + 2.6 * grow) * s);
      star2.scale.setScalar((0.6 + 3.4 * grow) * s);
      star.material.rotation = t * 1.4;
      star2.material.rotation = -t * 0.9 + Math.PI / 4;
      glow.scale.setScalar((0.6 + 2.4 * grow) * s);
      star.material.opacity = 1 - t;
      star2.material.opacity = 0.8 * (1 - t);
      glow.material.opacity = 0.9 * (1 - t);
    });
    const ring = this.floorPlane(this.tex.ring, color, 0.06);
    ring.position.set(at.x, 0.06, at.z);
    this.add(now, 480, [ring], (t) => {
      const r = (0.3 + 3.2 * easeOut(t)) * s;
      ring.scale.set(r, 1, r);
      outerMat(ring).opacity = 1 - t;
    });
    this.emit({ at, count: Math.round(34 * s), color: () => pick([0xffffff, 0xfff0b0, color]), speed: [0.8, 3], up: 1.2, gravity: 0.6, drag: 1.2, life: [500, 1000], size: [0.2, 0.03], additive: true, texture: 'spark' });
    // 天から降りるきらめき
    this.emit({ at: at.clone().setY(3.2), count: Math.round(16 * s), color: 0xfff6d8, speed: [0.05, 0.2], gravity: 6, life: [450, 650], size: [0.18, 0.05], jitter: 0.35, additive: true, texture: 'spark' });
    this.lightUp(now, 650, 0xfff4d0, 30 * s, () => at.clone().setY(1.2), (t) => (1 - t) ** 2);
    this.flash(0xffffff, Math.min(0.5, 0.36 * s));
    this.shakeBy(0.6 * s);
  }

  /** 闇の矢：光を吸う黒い玉のまわりを紫の光が回り、闇のもやを引いて飛ぶ */
  private darkBolt(start: number, fly: number, begin: THREE.Vector3, end: THREE.Vector3, color: number) {
    const rim = this.orb(color, 1.15);
    const core = this.orb(0x05000a, 0.55, this.tex.glow, false);
    core.renderOrder = 17;
    const sparks = [0, 1, 2].map(() => this.orb(0xd8b8ff, 0.22));
    const pos = new THREE.Vector3();
    let lastEmit = start;
    this.add(start, fly, [rim, core, ...sparks], (t, now) => {
      pos.lerpVectors(begin, end, t);
      rim.position.copy(pos);
      core.position.copy(pos);
      const beat = 1 + Math.sin(now * 0.05) * 0.15;
      rim.scale.setScalar(1.15 * beat);
      core.material.opacity = 0.95;
      sparks.forEach((sp, i) => {
        const a = now * 0.025 + (i * Math.PI * 2) / 3;
        sp.position.set(pos.x + Math.cos(a) * 0.32, pos.y + Math.sin(a * 1.3) * 0.18, pos.z + Math.sin(a) * 0.32);
      });
      const n = Math.floor((now - lastEmit) / 14);
      if (n > 0) {
        lastEmit = now;
        this.emit({ at: pos, count: 2 * n, color: 0x0c0414, speed: [0.05, 0.3], up: 0.2, drag: 1.5, life: [500, 900], size: [0.3, 0.8], alpha: 0.6, jitter: 0.1, texture: 'smoke' });
        this.emit({ at: pos, count: n, color, speed: [0.1, 0.4], drag: 1.5, life: [400, 700], size: [0.3, 0.05], alpha: 0.6, jitter: 0.12, additive: true });
      }
    });
    this.lightUp(start, fly, color, 8, () => pos.clone(), () => 1);
  }

  /** 闇の矢が当たった：床に渦が開いて、まわりの粒を吸いこんで閉じ、はじけて黒いもやが残る */
  private darkImpact(at: THREE.Vector3, color: number, s: number) {
    const now = performance.now();
    const hole = this.floorPlane(this.tex.glow, 0x000000, 0.03, false);
    const vortex = this.floorPlane(this.tex.spiral, color, 0.04);
    const vortex2 = this.floorPlane(this.tex.spiral, 0xe0c8ff, 0.045);
    for (const o of [hole, vortex, vortex2]) o.position.set(at.x, o.position.y, at.z);
    const ms = 900;
    this.add(now, ms, [hole, vortex, vortex2], (t) => {
      // 開いて（〜0.3）、回りながら閉じる（〜0.75）
      const open = t < 0.3 ? easeOutBack(t / 0.3) : t < 0.75 ? 1 - easeIn((t - 0.3) / 0.45) : 0;
      const r = Math.max(0.001, 2.6 * s * open);
      hole.scale.set(r * 1.1, 1, r * 1.1);
      vortex.scale.set(r, 1, r);
      vortex2.scale.set(r * 0.6, 1, r * 0.6);
      vortex.rotation.y = -t * 14;
      vortex2.rotation.y = -t * 20;
      outerMat(hole).opacity = 0.85 * Math.min(1, open * 1.5);
      outerMat(vortex).opacity = Math.min(1, open * 1.5);
      outerMat(vortex2).opacity = 0.7 * Math.min(1, open * 1.5);
    });
    // まわりから吸いこまれる粒
    for (let i = 0; i < Math.round(22 * s); i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.3 + Math.random() * 0.9;
      const from = new THREE.Vector3(at.x + Math.cos(a) * r, 0.15 + Math.random() * 0.9, at.z + Math.sin(a) * r);
      const vel = new THREE.Vector3(at.x - from.x, FX.height - from.y, at.z - from.z).multiplyScalar(1 / 0.55);
      this.spawn(from, vel, { color: pick([color, 0xe0c8ff]), life: 550, gravity: 0, drag: 0, size: [0.2, 0.06], alpha: 1, additive: true, texture: 'spark' });
    }
    // 閉じたところで、はじける
    this.later(now + ms * 0.75, () => {
      const burst = this.orb(color, 1);
      burst.position.copy(at);
      const ring = this.floorPlane(this.tex.ring, color, 0.06);
      ring.position.set(at.x, 0.06, at.z);
      this.add(performance.now(), 450, [burst, ring], (t) => {
        burst.scale.setScalar((0.4 + 2.4 * easeOut(t)) * s);
        burst.material.opacity = 1 - t;
        const rr = (0.3 + 3 * easeOut(t)) * s;
        ring.scale.set(rr, 1, rr);
        outerMat(ring).opacity = 1 - t;
      });
      this.emit({ at, count: Math.round(30 * s), color: () => pick([color, 0xe0c8ff, 0x7a3cff]), speed: [1, 3.4], up: 0.6, gravity: 0.8, drag: 1, life: [400, 800], size: [0.2, 0.03], additive: true, texture: 'spark' });
      // 残る黒いもや
      this.emit({ at, count: Math.round(14 * s), color: 0x0a0312, speed: [0.1, 0.4], up: 0.3, gravity: -0.15, drag: 1, life: [1100, 1700], size: [0.5, 1.2], alpha: 0.6, jitter: 0.35, texture: 'smoke' });
      this.flash(color, 0.2 * s);
      this.darken(0.55 * s);
      this.shakeBy(0.5 * s);
    });
    this.lightUp(now, ms, color, 16 * s, () => at.clone().setY(0.9), (t) => (t < 0.75 ? 0.6 : 1.4 * (1 - (t - 0.75) / 0.25)));
    this.darken(0.45 * s);
  }

  // ===== そのほかの呪文 =====

  /** 床すれすれに広がる光の輪と、少し遅れて追いかける薄い輪。ちりが舞い、画面が揺れる */
  private shockwave(now: number, at: Pos) {
    const rings = [0, 0.18].map((delay) => {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), this.plainGlow(FX.shockwave.color));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(at.x, 0.08, at.y);
      mesh.renderOrder = 15;
      return { mesh, delay };
    });
    this.add(
      now,
      FX.shockwave.ms,
      rings.map((r) => r.mesh),
      (t) => {
        for (const { mesh, delay } of rings) {
          const u = Math.max(0, Math.min(1, (t - delay) / (1 - delay)));
          const r = 0.2 + FX.shockwave.radius * (1 - (1 - u) ** 2);
          mesh.scale.set(r, r, r);
          (mesh.material as THREE.MeshBasicMaterial).opacity = u <= 0 ? 0 : (1 - u) * (delay ? 0.5 : 0.95);
        }
      },
    );
    this.emit({ at: new THREE.Vector3(at.x, 0.1, at.y), count: 24, color: 0x9a9284, speed: [1.2, 2.6], flat: true, up: 0.5, gravity: 1.2, drag: 1.6, life: [500, 900], size: [0.3, 0.8], alpha: 0.4, jitter: 0.3, texture: 'smoke' });
    this.flash(FX.shockwave.color, 0.2);
    this.shakeBy(0.55);
  }

  /** 向いた方向へ、主人公から path の終わりまで光の筋が走り、消える */
  private sweep(now: number, from: Pos, path: Pos[]) {
    const end = path.at(-1);
    if (!end) return;
    const dist = Math.hypot(end.x - from.x, end.y - from.y);
    const dx = (end.x - from.x) / dist;
    const dz = (end.y - from.y) / dist;
    const full = dist + 0.2; // 主人公の少し前から、最後のマスの奥まで
    const material = this.plainGlow(FX.sweep.color);
    material.map = this.tex.streak;
    const blade = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    blade.rotation.x = -Math.PI / 2;
    blade.rotation.z = -Math.atan2(dz, dx);
    blade.renderOrder = 15;
    this.add(now, FX.sweep.ms, [blade], (t) => {
      const len = full * Math.min(1, t / 0.35); // 前へ走って伸びる
      const center = 0.3 + len / 2;
      blade.position.set(from.x + dx * center, FX.height * 0.7, from.y + dz * center);
      blade.scale.set(Math.max(0.001, len), FX.sweep.width * (1 - t * 0.6), 1);
      (blade.material as THREE.MeshBasicMaterial).opacity = t < 0.35 ? 0.95 : 0.95 * (1 - (t - 0.35) / 0.65);
    });
    this.shakeBy(0.2);
  }

  /** 主人公のまわりから、光の粒が立ちのぼって消える */
  private sparkles(now: number, at: Pos, spell: 'heal' | 'regen') {
    const cfg = FX[spell];
    const sparks = Array.from({ length: cfg.sparks }, (_, i) => {
      const mesh = this.orb(cfg.color, 0.24);
      const angle = (i / cfg.sparks) * Math.PI * 2;
      const radius = 0.22 + (i % 3) * 0.08;
      return { mesh, angle, radius, delay: (i % 4) * 0.08 };
    });
    this.add(
      now,
      cfg.ms,
      sparks.map((s) => s.mesh),
      (t) => {
        for (const s of sparks) {
          const u = Math.max(0, Math.min(1, (t - s.delay) / (1 - s.delay)));
          const a = s.angle + u * 1.6;
          s.mesh.position.set(at.x + Math.cos(a) * s.radius, 0.1 + u * cfg.rise, at.y + Math.sin(a) * s.radius);
          s.mesh.material.opacity = u <= 0 ? 0 : Math.sin(u * Math.PI);
        }
      },
    );
    this.flash(cfg.color, 0.12);
  }

  // ===== 部品 =====

  private add(start: number, ms: number, objects: THREE.Object3D[], update: (t: number, now: number) => void) {
    const group = new THREE.Group();
    for (const o of objects) group.add(o);
    this.scene.add(group);
    const fx: Running = { start, ms: this.reduceMotion ? ms * 0.6 : ms, group, update };
    this.running.push(fx);
    const now = performance.now();
    if (now >= start) fx.update(0, now);
    else group.visible = false;
  }

  /** when（performance.now() の時刻）になったら fn を呼ぶ */
  private later(when: number, fn: () => void) {
    this.timers.push({ at: when, fn });
  }

  private disposeGroup(group: THREE.Group) {
    this.scene.remove(group);
    group.traverse((c) => {
      if (c instanceof THREE.Mesh && !(Object.values(this.shared) as THREE.BufferGeometry[]).includes(c.geometry)) c.geometry.dispose();
      if (c instanceof THREE.Mesh || c instanceof THREE.Sprite) {
        const m = c.material as THREE.Material;
        if (!(m instanceof THREE.MeshPhongMaterial)) m.dispose(); // 氷の結晶の素材は、まとめて片付ける
      }
    });
  }

  /** ぼんやり光る丸（いつもカメラの方を向く板）。size はマス */
  private orb(color: number, size: number, map: THREE.Texture = this.tex.glow, additive = true): THREE.Sprite {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map, color, transparent: true, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false }),
    );
    sprite.scale.setScalar(size);
    sprite.renderOrder = 16;
    return sprite;
  }

  /** 床に寝かせた板（魔法陣・輪・焦げ跡など）。y は床からの高さ */
  private floorPlane(map: THREE.Texture, color: number, y: number, additive = true): THREE.Mesh {
    const mesh = new THREE.Mesh(this.shared.plane, this.glowMaterial(color, map, additive));
    mesh.position.y = y;
    mesh.renderOrder = 15;
    return mesh;
  }

  private glowMaterial(color: number, map: THREE.Texture, additive = true): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color,
      map,
      transparent: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  private plainGlow(color: number, opacity = 1): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  }

  /** 粒をまとめて出す */
  private emit(o: EmitOptions & { shards?: boolean }) {
    const count = this.reduceMotion ? Math.ceil(o.count / 2) : o.count;
    for (let i = 0; i < count; i++) {
      const at = o.at.clone();
      if (o.jitter) at.add(new THREE.Vector3((Math.random() - 0.5) * 2 * o.jitter, (Math.random() - 0.5) * o.jitter, (Math.random() - 0.5) * 2 * o.jitter));
      const speed = o.speed[0] + Math.random() * (o.speed[1] - o.speed[0]);
      let v: THREE.Vector3;
      if (o.flat) {
        const a = Math.random() * Math.PI * 2;
        v = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      } else {
        v = randomUnit();
        if (o.dir) v.lerp(o.dir.clone().normalize(), 1 - (o.spread ?? 0.5)).normalize();
      }
      v.multiplyScalar(speed);
      if (o.up) v.y += o.up * (0.5 + Math.random() * 0.5);
      this.spawn(at, v, {
        color: typeof o.color === 'function' ? o.color() : o.color,
        life: o.life[0] + Math.random() * (o.life[1] - o.life[0]),
        gravity: o.gravity ?? 0,
        drag: o.drag ?? 0,
        size: o.size,
        alpha: o.alpha ?? 1,
        additive: o.additive ?? false,
        texture: o.texture ?? 'glow',
        shard: o.shards ?? false,
      });
    }
  }

  private spawn(
    at: THREE.Vector3,
    vel: THREE.Vector3,
    o: { color: number; life: number; gravity: number; drag: number; size: [number, number]; alpha: number; additive: boolean; texture: 'glow' | 'smoke' | 'spark'; shard?: boolean },
  ) {
    if (this.particles.length >= FX.maxParticles) this.removeParticle(this.particles.shift()!);
    let obj: THREE.Sprite | THREE.Mesh;
    let mat: THREE.Material & { opacity: number };
    if (o.shard) {
      mat = new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: o.alpha });
      obj = new THREE.Mesh(this.shared.chip, mat);
      obj.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    } else {
      const sprite = this.orb(o.color, o.size[0], this.tex[o.texture], o.additive);
      sprite.material.rotation = Math.random() * Math.PI * 2;
      obj = sprite;
      mat = sprite.material;
    }
    obj.position.copy(at);
    obj.renderOrder = o.additive ? 16 : 14;
    this.scene.add(obj);
    this.particles.push({
      obj,
      mat,
      start: performance.now(),
      life: this.reduceMotion ? o.life * 0.6 : o.life,
      vel,
      gravity: o.gravity,
      drag: o.drag,
      size: o.size,
      alpha: o.alpha,
      spin: o.shard ? new THREE.Vector3(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6) : null,
      bounce: !!o.shard,
    });
  }

  private updateParticles(now: number, dt: number) {
    for (let k = this.particles.length - 1; k >= 0; k--) {
      const p = this.particles[k]!;
      const t = (now - p.start) / p.life;
      if (t >= 1) {
        this.removeParticle(p);
        this.particles.splice(k, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      if (p.drag) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.obj.position.addScaledVector(p.vel, dt);
      if (p.bounce && p.obj.position.y < 0.04) {
        p.obj.position.y = 0.04;
        p.vel.y = Math.abs(p.vel.y) * 0.3;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
      }
      if (p.spin) {
        p.obj.rotation.x += p.spin.x * dt;
        p.obj.rotation.y += p.spin.y * dt;
      }
      const size = p.size[0] + (p.size[1] - p.size[0]) * t;
      p.obj.scale.setScalar(size);
      // 出てすぐに明るくなり、ゆっくり消える
      p.mat.opacity = p.alpha * (t < 0.12 ? t / 0.12 : (1 - (t - 0.12) / 0.88) ** 1.3);
    }
  }

  private removeParticle(p: Particle) {
    this.scene.remove(p.obj);
    p.mat.dispose();
  }
}
