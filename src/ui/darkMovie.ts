// 闇の場面（記憶の動く場面。docs/memory-movie.md）の、時刻と乱数から決まる部品：夜の粒・墨のように迫る闇・小さな光・墨に溶ける言葉のもや。
// 描くのは darkPainter.ts。乱数の関数は外から渡す（テストでは決まった並びを渡す）。
// 表現の約束（docs/story.md）：消えることを美しく描かない。小さな光は、現れてからは消えず、闇は光のまわりを残す（lightHole）。

import type { Rand } from './memoryMovie';

export const DARK_CONFIG = {
  ink: { clouds: 30, size: [110, 260] as const, sway: 0.25, reach: 0.62 }, // 墨の闇：かたまりの数・大きさ(px)・ゆらぎ・どこまで迫るか（画面の短い辺に対する割合。迫る深さ1のとき）
  motes: { max: 120, speed: [3, 12] as const, size: [0.8, 2.3] as const, life: [5, 9] as const }, // 夜の粒：上限・ただよう速さ(px/秒)・大きさ(px)・寿命(秒)
  light: { x: 0.5, y: 0.76, size: 28, halo: 3.6, breathe: 0.12 }, // 小さな光：位置（画面に対する割合）・大きさ(px)・闇を押し返すまわりの広さ（大きさの倍率）・ゆっくり明るさがゆれる量
  wisp: { count: 26, rise: [14, 40] as const, size: [10, 30] as const, life: [1.4, 2.6] as const, grow: 2.6 }, // 溶ける言葉のもや：数・上る速さ・大きさ・寿命・寿命までに広がる倍率
} as const;

const between = (range: readonly [number, number], rand: Rand): number => range[0] + (range[1] - range[0]) * rand();
const countOf = (want: number, rand: Rand): number => Math.floor(want) + (rand() < want - Math.floor(want) ? 1 : 0);

/** 墨の闇のかたまり：画面のふちのどこから（周りの長さに対する割合 0〜1）、どの大きさで、どの速さでゆらぐか */
export interface InkCloud {
  along: number; // 0〜1（上 → 右 → 下 → 左）
  size: number; // px
  phase: number;
  rate: number;
}

export function inkClouds(rand: Rand): InkCloud[] {
  const c = DARK_CONFIG.ink;
  return Array.from({ length: c.clouds }, (_, i) => ({ along: (i + rand() * 0.8) / c.clouds, size: between(c.size, rand), phase: rand() * Math.PI * 2, rate: 0.15 + rand() * 0.25 }));
}

/** 墨の闇のかたまりの、いまの位置（px）と大きさと濃さ：ふちから、迫る深さ amount のぶん内へ、ゆらぎながら染み込む */
export function inkLook(cloud: InkCloud, w: number, h: number, amount: number, t: number): { x: number; y: number; size: number; alpha: number } {
  const c = DARK_CONFIG.ink;
  const p = cloud.along * 2 * (w + h);
  const [ex, ey, nx, ny] = p < w ? [p, 0, 0, 1] : p < w + h ? [w, p - w, -1, 0] : p < 2 * w + h ? [w - (p - w - h), h, 0, -1] : [0, h - (p - 2 * w - h), 1, 0];
  const reach = amount * c.reach * Math.min(w, h) * (1 + c.sway * Math.sin(cloud.phase + t * cloud.rate));
  return { x: ex + nx * reach, y: ey + ny * reach, size: cloud.size * (0.6 + 0.6 * amount), alpha: Math.min(1, amount * 1.4) };
}

/** 夜の粒（x・y は px） */
export interface NightMote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  age: number;
  life: number;
  phase: number;
}

/** 夜の粒を dt 秒だけ進める（ゆっくり、あてもなく ただよう。rate は1秒に生まれる数） */
export function stepNightMotes(motes: readonly NightMote[], dt: number, rate: number, w: number, h: number, rand: Rand): NightMote[] {
  const c = DARK_CONFIG.motes;
  const alive = motes.map((m) => ({ ...m, age: m.age + dt, x: m.x + m.vx * dt, y: m.y + m.vy * dt })).filter((m) => m.age < m.life);
  let n = countOf(rate * dt, rand);
  while (n-- > 0 && alive.length < c.max) {
    const a = rand() * Math.PI * 2;
    const speed = between(c.speed, rand);
    alive.push({ x: rand() * w, y: rand() * h, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, size: between(c.size, rand), age: 0, life: between(c.life, rand), phase: rand() * Math.PI * 2 });
  }
  return alive;
}

/** 夜の粒の見え方：そっと現れて、そっと消える。かすかにまたたく */
export function nightMoteLook(m: NightMote, t: number): number {
  const k = m.age / m.life;
  return Math.sin(Math.PI * k) * (0.55 + 0.3 * Math.sin(m.phase + t * 1.7));
}

/** 小さな光の、いまの明るさの倍率（ゆっくり、息をするように、ゆれる。消えない：intensity が 0 より大きければ、0 にならない） */
export function smallLightPulse(t: number, intensity: number): number {
  return intensity * (1 + DARK_CONFIG.light.breathe * Math.sin(t * 1.3));
}

/** 墨に溶ける言葉から立ちのぼる、うすいもや（x・y は px） */
export interface Wisp {
  x: number;
  y: number;
  vx: number;
  vy: number; // 負：上へ
  size: number;
  age: number;
  life: number;
}

/** 言葉が溶け始める：言葉の四角（px）の中から、もやが立ちのぼる */
export function wispsFromBox(box: { x0: number; x1: number; y0: number; y1: number }, count: number, rand: Rand): Wisp[] {
  const c = DARK_CONFIG.wisp;
  return Array.from({ length: count }, () => ({
    x: box.x0 + (box.x1 - box.x0) * rand(),
    y: box.y0 + (box.y1 - box.y0) * rand(),
    vx: (rand() - 0.5) * 30,
    vy: -between(c.rise, rand),
    size: between(c.size, rand),
    age: -rand() * 0.8, // 少しずつずれて出る
    life: between(c.life, rand),
  }));
}

export function stepWisps(wisps: readonly Wisp[], dt: number): Wisp[] {
  return wisps.map((p) => (p.age > 0 ? { ...p, age: p.age + dt, x: p.x + p.vx * dt, y: p.y + p.vy * dt } : { ...p, age: p.age + dt })).filter((p) => p.age < p.life);
}

/** もやの見え方：広がりながら、そっと濃くなり、そっと消える（まだ出ていないものは見えない） */
export function wispLook(p: Wisp): { size: number; alpha: number } {
  const k = Math.max(0, p.age) / p.life;
  return { size: p.size * (1 + (DARK_CONFIG.wisp.grow - 1) * k), alpha: p.age <= 0 ? 0 : 0.22 * Math.sin(Math.PI * k) };
}
