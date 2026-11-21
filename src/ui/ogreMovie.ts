// 鬼の場面（記憶の動く場面。docs/memory-movie.md）の、時刻と乱数から決まる部品：上下から押しつぶす帯・責める打撃の跡・ほこり。
// 描くのは ogrePainter.ts。乱数の関数は外から渡す（テストでは決まった並びを渡す）。

import { valueAt, type Hit, type OgreMovie, type Rand } from './memoryMovie';

export const OGRE_CONFIG = {
  bars: { max: 0.24, jolt: 0.04, joltDecay: 0.18 }, // 押しつぶす帯：いちばん深いとき（画面の高さに対する割合。上下それぞれ）・打撃でぐっと迫る量・戻る時間（秒）
  stamp: { life: 1.5, reach: 0.17, cracks: 7 }, // 打撃の跡：消えるまで（秒）・輪の広がり（画面の高さに対する割合）・ひびの数
  dust: { max: 240, fall: [50, 140] as const, size: [1, 2.6] as const, life: [1.6, 3.2] as const }, // ほこり：上限・落ちる速さ(px/秒)・大きさ(px)・寿命(秒)
} as const;

const between = (range: readonly [number, number], rand: Rand): number => range[0] + (range[1] - range[0]) * rand();
const countOf = (want: number, rand: Rand): number => Math.floor(want) + (rand() < want - Math.floor(want) ? 1 : 0);

/** 時刻 t の、上下から押しつぶす帯の深さ（画面の高さに対する割合。上下それぞれ）：設定の深さに、打撃・衝撃の瞬間にぐっと迫る分を足す */
export function barDepth(movie: OgreMovie, t: number): number {
  const b = OGRE_CONFIG.bars;
  let jolt = 0;
  for (const h of [...movie.hits, ...movie.impacts]) {
    const dt = t - h.at;
    if (dt >= 0 && dt < b.joltDecay * 6) jolt = Math.max(jolt, Math.exp(-dt / b.joltDecay) * h.power);
  }
  return valueAt(movie.press, t) * b.max + jolt * b.jolt;
}

/** 打撃の跡：打撃の瞬間から、輪が広がって薄れ、ひびが残って消える。progress は広がり（0〜1）、alpha は濃さ、power は打撃の強さ */
export function stampsAt(hits: readonly Hit[], t: number): { index: number; progress: number; alpha: number; power: number }[] {
  const s = OGRE_CONFIG.stamp;
  const out: { index: number; progress: number; alpha: number; power: number }[] = [];
  hits.forEach((h, index) => {
    const k = (t - h.at) / s.life;
    if (k < 0 || k >= 1) return;
    out.push({ index, progress: 1 - Math.pow(1 - Math.min(1, k * 3), 3), alpha: Math.pow(1 - k, 1.3) * Math.min(1, h.power), power: h.power });
  });
  return out;
}

/** 打撃の跡のひび（放射状の短い線）：向き（ラジアン）と長さ（輪の広がりに対する割合）。跡ごとに決まった形 */
export function stampCracks(index: number): { angle: number; length: number }[] {
  const n = OGRE_CONFIG.stamp.cracks;
  return Array.from({ length: n }, (_, i) => {
    const r = (Math.sin((index + 1) * 12.9898 + i * 78.233) * 43758.5453) % 1;
    const jitter = Math.abs(r);
    return { angle: (i / n) * Math.PI * 2 + jitter * 0.7, length: 0.45 + jitter * 0.55 };
  });
}

/** ほこり（x は 0〜1、y は画面の上から px） */
export interface Dust {
  x: number;
  y: number;
  vx: number; // px/秒
  vy: number; // px/秒（下へ）
  size: number;
  age: number;
  life: number;
}

/** ほこりを dt 秒だけ進める（上から、細かく落ちる。rate は1秒に出る数。画面の下 height を過ぎたら消える）。width は画面の幅（横の動きを割合にする） */
export function stepDust(dust: readonly Dust[], dt: number, rate: number, width: number, height: number, rand: Rand): Dust[] {
  const c = OGRE_CONFIG.dust;
  const alive = dust
    .map((d) => ({ ...d, age: d.age + dt, x: d.x + (d.vx * dt) / Math.max(1, width), y: d.y + d.vy * dt, vy: d.vy + 60 * dt }))
    .filter((d) => d.age < d.life && d.y < height + 10);
  let n = countOf(rate * dt, rand);
  while (n-- > 0 && alive.length < c.max) {
    alive.push({ x: rand(), y: -4, vx: (rand() - 0.5) * 8, vy: between(c.fall, rand), size: between(c.size, rand), age: 0, life: between(c.life, rand) });
  }
  return alive;
}

/** 打撃・衝撃で、ある点（x は 0〜1、y は上から px）から、ほこりが舞い散る */
export function dustBurst(x: number, y: number, count: number, rand: Rand): Dust[] {
  const c = OGRE_CONFIG.dust;
  return Array.from({ length: count }, () => {
    const a = rand() * Math.PI * 2;
    const speed = 40 + rand() * 160;
    return { x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed * 0.6 - 30, size: between(c.size, rand), age: 0, life: between(c.life, rand) * 0.7 };
  });
}

/** ほこりの見え方：出てすぐと消える前は薄い */
export function dustLook(d: Dust): number {
  const k = d.age / d.life;
  return Math.min(1, k * 6, (1 - k) * 3) * 0.8;
}
