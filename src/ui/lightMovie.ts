// 光の場面（記憶の動く場面。docs/memory-movie.md）の、時刻と乱数から決まる部品：上からの光の筋・舞い上がる（崩れると落ちる）光の粒。
// 描くのは lightPainter.ts。乱数の関数は外から渡す（テストでは決まった並びを渡す）。

import type { Rand } from './memoryMovie';

export const LIGHT_CONFIG = {
  // 光の筋：本数・広がり（ラジアン）・出どころ（画面の上の、さらに上。高さに対する割合）・長さ（高さに対する割合）・太さ（幅に対する割合）
  rays: { count: 7, spread: 0.95, originY: -0.15, length: 1.3, width: [0.05, 0.13] as const },
  // 光の粒：上限・舞い上がる速さ(px/秒)・大きさ(px)・寿命(秒)・落ちるときの重さ(px/秒²)
  motes: { max: 200, rise: [16, 52] as const, size: [0.8, 2.6] as const, life: [3, 6] as const, gravity: 150 },
} as const;

const between = (range: readonly [number, number], rand: Rand): number => range[0] + (range[1] - range[0]) * rand();
const countOf = (want: number, rand: Rand): number => Math.floor(want) + (rand() < want - Math.floor(want) ? 1 : 0);

/** 光の筋：向き（真下からのずれ。ラジアン）・太さ（幅に対する割合）・ゆらめきの速さと位相。筋ごとに決まった形 */
export function rayShapes(): { angle: number; width: number; rate: number; phase: number }[] {
  const c = LIGHT_CONFIG.rays;
  const n: number = c.count;
  return Array.from({ length: n }, (_, i) => {
    const k = n === 1 ? 0.5 : i / (n - 1);
    const r = Math.abs((Math.sin((i + 1) * 91.3458) * 47453.5453) % 1);
    return { angle: (k - 0.5) * c.spread + (r - 0.5) * 0.08, width: c.width[0] + (c.width[1] - c.width[0]) * r, rate: 0.6 + r * 0.9, phase: r * Math.PI * 2 };
  });
}

/** 光の筋の濃さ：全体の強さ strength に、筋ごとのゆっくりしたゆらめきをかける（0〜1） */
export function rayAlpha(ray: { rate: number; phase: number }, t: number, strength: number): number {
  return Math.max(0, strength) * (0.7 + 0.3 * Math.sin(ray.phase + t * ray.rate));
}

/** 光の粒（x は 0〜1、y は画面の上から px） */
export interface Mote {
  x: number;
  y: number;
  vx: number; // px/秒
  vy: number; // px/秒（負：上へ）
  size: number;
  age: number;
  life: number;
  phase: number;
}

/**
 * 光の粒を dt 秒だけ進める：画面の下半分から生まれ、ゆっくり舞い上がる。fall が 1 に近いほど重さで落ちる（光が崩れたあと）。
 * rate は1秒に生まれる数。width・height は画面の大きさ（px）。画面の外に出たら消える
 */
export function stepMotes(motes: readonly Mote[], dt: number, rate: number, fall: number, width: number, height: number, rand: Rand): Mote[] {
  const c = LIGHT_CONFIG.motes;
  const alive = motes
    .map((m) => {
      const vy = m.vy + c.gravity * fall * dt;
      return { ...m, age: m.age + dt, vy, x: m.x + (m.vx * dt) / Math.max(1, width), y: m.y + vy * dt };
    })
    .filter((m) => m.age < m.life && m.y > -20 && m.y < height + 20);
  let n = countOf(rate * dt, rand);
  while (n-- > 0 && alive.length < c.max) {
    alive.push({ x: rand(), y: height * (0.5 + 0.5 * rand()), vx: (rand() - 0.5) * 10, vy: -between(c.rise, rand), size: between(c.size, rand), age: 0, life: between(c.life, rand), phase: rand() * Math.PI * 2 });
  }
  return alive;
}

/** 光の粒の見え方：出てすぐと消える前は薄く、ときどききらめく */
export function moteLook(m: Mote, t: number): number {
  const k = m.age / m.life;
  return Math.min(1, k * 5, (1 - k) * 3) * (0.55 + 0.45 * Math.max(0, Math.sin(m.phase + t * 2.3)));
}
