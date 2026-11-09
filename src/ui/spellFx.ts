// 呪文の演出（3D表示）。唱えたときに1回だけ出して、時間がたつと消える。
// 衝撃波：主人公のまわりに広がる光の輪。矢：主人公から飛んで、当たったところではじける光の玉（属性の色）。
// なぎ払い：向いた方向へ走る光の筋。癒し・再生：主人公のまわりから立ちのぼる光の粒。
// 光を足すと影の計算をやり直して重くなるので、光源は使わず、光って見える（足し合わせて描く）板と玉で表す。
// 霧はかけない（呪文の光は暗がりでも見える）

import * as THREE from 'three';
import type { CastEvent } from '../game/explore';
import type { Pos } from '../game/map';
import type { Element, SpellId } from '../game/types';

// 属性の色（矢・槍の光）
const ELEMENT_COLORS: Record<Element, number> = {
  fire: 0xff7a2a,
  ice: 0x8fd8ff,
  light: 0xfff0a0,
  dark: 0xa070ff,
  neutral: 0xe8e2d0,
};
const BOLT_ELEMENT: Partial<Record<SpellId, Element>> = { fire_bolt: 'fire', ice_bolt: 'ice', light_lance: 'light', dark_bolt: 'dark' };

// 時間（ミリ秒）と大きさ（マス）
const FX = {
  shockwave: { ms: 480, radius: 1.9, color: 0xcfe6ff },
  bolt: { flyMs: 200, burstMs: 260, size: 0.16, burst: 0.55 },
  sweep: { ms: 300, width: 0.5, color: 0xf2ecd8 },
  heal: { ms: 800, sparks: 14, rise: 1.0, color: 0x8dffb4 },
  regen: { ms: 900, sparks: 10, rise: 0.8, color: 0xd8ffa0 },
  height: 0.5, // 演出を出す高さ（主人公の胸のあたり）
} as const;

interface Running {
  start: number;
  ms: number;
  update: (t: number) => void; // t は 0〜1
  dispose: () => void;
}

export class SpellEffects {
  private running: Running[] = [];
  // ぼんやり光る丸（中心が明るく、外へ向かって透ける）。玉・はじける光・光の粒に使う
  private readonly glowTexture = radialTexture();
  // なぎ払いの光の筋（進む先が明るく、後ろへ向かって消え、上下の縁はぼける）
  private readonly streakTexture = streakTexture();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly reduceMotion: boolean,
  ) {}

  /** 呪文の演出を始める。from は唱えた主人公のマス */
  start(cast: CastEvent, from: Pos) {
    const now = performance.now();
    switch (cast.spell) {
      case 'shockwave':
        this.shockwave(now, from);
        break;
      case 'sweep':
        this.sweep(now, from, cast.path);
        break;
      case 'heal':
      case 'regen':
        this.sparkles(now, from, cast.spell);
        break;
      default:
        this.bolt(now, from, cast.path, ELEMENT_COLORS[BOLT_ELEMENT[cast.spell] ?? 'neutral']);
    }
  }

  /** 毎フレーム呼ぶ。動いていれば true（もう1フレーム描く必要がある） */
  update(now: number): boolean {
    for (let k = this.running.length - 1; k >= 0; k--) {
      const fx = this.running[k]!;
      const t = Math.min(1, (now - fx.start) / fx.ms);
      if (t >= 1) {
        fx.dispose();
        this.running.splice(k, 1);
      } else fx.update(t);
    }
    return this.running.length > 0;
  }

  dispose() {
    for (const fx of this.running) fx.dispose();
    this.running = [];
    this.glowTexture.dispose();
    this.streakTexture.dispose();
  }

  private add(start: number, ms: number, objects: THREE.Object3D[], update: (t: number) => void) {
    for (const o of objects) this.scene.add(o);
    const fx: Running = {
      start,
      ms: this.reduceMotion ? ms * 0.6 : ms,
      update,
      dispose: () => {
        for (const o of objects) {
          this.scene.remove(o);
          o.traverse((c) => {
            if (c instanceof THREE.Mesh) c.geometry.dispose();
            if (c instanceof THREE.Mesh || c instanceof THREE.Sprite) (c.material as THREE.Material).dispose();
          });
        }
      },
    };
    this.running.push(fx);
    fx.update(0);
  }

  /** ぼんやり光る丸（いつもカメラの方を向く板）。size はマス */
  private orb(color: number, size: number): THREE.Sprite {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.glowTexture, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    sprite.scale.setScalar(size);
    sprite.renderOrder = 16;
    return sprite;
  }

  private glow(color: number, opacity = 1): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  }

  /** 床すれすれに広がる光の輪と、少し遅れて追いかける薄い輪 */
  private shockwave(now: number, at: Pos) {
    const rings = [0, 0.18].map((delay) => {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), this.glow(FX.shockwave.color));
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
  }

  /** 光の玉が path の終わりまで飛び（後ろに尾を引く）、そこではじける。path が空なら、主人公の目の前ではじける */
  private bolt(now: number, from: Pos, path: Pos[], color: number) {
    const end = path.at(-1) ?? from;
    const core = this.orb(0xffffff, FX.bolt.size * 2.2);
    const ball = this.orb(color, FX.bolt.size * 6);
    const tail = [0.35, 0.22, 0.12].map((a) => ({ sprite: this.orb(color, FX.bolt.size * 4), alpha: a }));
    const burst = this.orb(color, 1);
    const flash = this.orb(0xffffff, 1);
    const fly = (FX.bolt.flyMs * Math.max(1, path.length)) / 3;
    const total = fly + FX.bolt.burstMs;
    const at = (u: number) => ({ x: from.x + (end.x - from.x) * u, z: from.y + (end.y - from.y) * u });
    this.add(now, total, [ball, core, ...tail.map((t) => t.sprite), burst, flash], (t) => {
      const ms = t * total;
      const u = Math.min(1, ms / fly);
      const flying = ms < fly;
      const p = at(u);
      for (const o of [ball, core]) {
        o.visible = flying;
        o.position.set(p.x, FX.height, p.z);
      }
      tail.forEach(({ sprite, alpha }, i) => {
        const q = at(Math.max(0, u - (i + 1) * 0.12));
        sprite.visible = flying;
        sprite.position.set(q.x, FX.height, q.z);
        sprite.material.opacity = alpha;
      });
      const b = flying ? 0 : (ms - fly) / FX.bolt.burstMs;
      for (const [o, size, alpha] of [
        [burst, FX.bolt.burst * 2.4, 1],
        [flash, FX.bolt.burst * 1.1, 0.9],
      ] as const) {
        o.visible = !flying;
        o.position.set(end.x, FX.height, end.y);
        o.scale.setScalar(0.2 + size * (1 - (1 - b) ** 2));
        o.material.opacity = (1 - b) * alpha;
      }
    });
  }

  /** 向いた方向へ、主人公から path の終わりまで光の筋が走り、消える */
  private sweep(now: number, from: Pos, path: Pos[]) {
    const end = path.at(-1);
    if (!end) return;
    const dist = Math.hypot(end.x - from.x, end.y - from.y);
    const dx = (end.x - from.x) / dist;
    const dz = (end.y - from.y) / dist;
    const full = dist + 0.2; // 主人公の少し前から、最後のマスの奥まで
    const material = this.glow(FX.sweep.color);
    material.map = this.streakTexture;
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
  }

  /** 主人公のまわりから、光の粒が立ちのぼって消える */
  private sparkles(now: number, at: Pos, spell: 'heal' | 'regen') {
    const cfg = FX[spell];
    const sparks = Array.from({ length: cfg.sparks }, (_, i) => {
      const mesh = this.orb(cfg.color, 0.22);
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
  }
}

/** 中心が白く、外へ向かってなめらかに透ける丸のテクスチャ */
function radialTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** 右（進む先）ほど明るく、左へ消えていき、上下の縁がぼける筋のテクスチャ */
function streakTexture(): THREE.Texture {
  const w = 128;
  const h = 32;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const along = ctx.createLinearGradient(0, 0, w, 0);
  along.addColorStop(0, 'rgba(255,255,255,0)');
  along.addColorStop(0.7, 'rgba(255,255,255,0.7)');
  along.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = along;
  ctx.fillRect(0, 0, w, h);
  // 上下の縁をぼかす（真ん中の細い線だけ明るく残す）
  ctx.globalCompositeOperation = 'destination-in';
  const across = ctx.createLinearGradient(0, 0, 0, h);
  across.addColorStop(0, 'rgba(0,0,0,0)');
  across.addColorStop(0.5, 'rgba(0,0,0,1)');
  across.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = across;
  ctx.fillRect(0, 0, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
