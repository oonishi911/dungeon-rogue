// 氷の場面（記憶の動く場面。docs/memory-movie.md）の、時刻と乱数から決まる部品：降る雪・白い息・氷の欠片・霜の模様。
// 描くのは icePainter.ts。乱数の関数は外から渡す（テストでは決まった並びを渡す）。

import type { Rand } from './memoryMovie';

export const ICE_CONFIG = {
  // 雪：上限の数・落ちる速さ(px/秒。大きい粒ほど速い＝手前)・大きさ(px)・横ぶれ(px)・凍って止まったときのきらめきの速さ
  snow: { max: 260, fall: [18, 70] as const, size: [0.8, 3.2] as const, sway: 16, twinkle: 3.1 },
  // 白い息：1回に出るもやの数・上る速さ・寿命(秒)・大きさ(px)・寿命までに広がる倍率・いちばん濃いとき・横へ散る速さ(px/秒)
  mist: { count: 16, rise: [22, 46] as const, life: [1.8, 3] as const, size: [16, 42] as const, grow: 2.8, alpha: 0.17, spread: 14 },
  // 氷の欠片：重さ（下へ引かれる速さ px/秒²）・大きさ(px)・寿命(秒)・言葉から出る数・巨像が砕けて画面のふちから出る数
  shard: { gravity: 520, size: [3, 13] as const, life: [0.9, 1.8] as const, fromWord: 42, fromEdges: 110 },
  // 霜の模様（シダの葉のような結晶）：幹の数（画面の周りの長さ 1000px あたり）・幹の長さ(px)・1歩(px)・曲がり方・脇枝の間隔(px)・脇枝の長さ（残りの長さに対する割合）
  frost: { branchesPer1000: 150, length: [16, 78] as const, step: 2.5, wobble: 0.28, sideEvery: 6, sideLength: 0.45 },
  // 呼ぶ声の波：広がりきるまでの秒・画面の高さに対する広がり
  ripple: { life: 1.6, reach: 0.55 },
} as const;

const between = (range: readonly [number, number], rand: Rand): number => range[0] + (range[1] - range[0]) * rand();
const countOf = (want: number, rand: Rand): number => Math.floor(want) + (rand() < want - Math.floor(want) ? 1 : 0);

/** 雪のひとひら（y は画面の上から px）。drift は、動いた時間（凍っているあいだは進まない） */
export interface Snowflake {
  x: number; // 0〜1
  y: number; // px（上から）
  vy: number; // px/秒
  size: number; // px
  phase: number;
  drift: number; // 秒
}

/** 雪を dt 秒だけ進める。speed は動きの速さの倍率（0 で宙に止まる）。rate は1秒に降り始める数。画面の下 height を過ぎたら消える */
export function stepSnow(snow: readonly Snowflake[], dt: number, rate: number, speed: number, height: number, rand: Rand): Snowflake[] {
  const c = ICE_CONFIG.snow;
  const alive = snow.map((f) => ({ ...f, y: f.y + f.vy * dt * speed, drift: f.drift + dt * speed })).filter((f) => f.y < height + 10);
  let n = countOf(rate * dt, rand);
  while (n-- > 0 && alive.length < c.max) {
    const size = between(c.size, rand);
    const k = (size - c.size[0]) / (c.size[1] - c.size[0]);
    alive.push({ x: rand(), y: -8, vy: c.fall[0] + (c.fall[1] - c.fall[0]) * k * (0.7 + 0.3 * rand()), size, phase: rand() * Math.PI * 2, drift: 0 });
  }
  return alive;
}

/** 雪の見え方：横に揺れ（手前の大きな粒ほど大きく）、出てすぐは薄い。止まっている（speed が小さい）ほど、ときどききらりと光る（glint：0〜1） */
export function snowLook(f: Snowflake, t: number, speed: number): { dx: number; alpha: number; glint: number } {
  const c = ICE_CONFIG.snow;
  const near = (f.size - c.size[0]) / (c.size[1] - c.size[0]);
  const dx = Math.sin(f.phase + f.drift * 0.9) * c.sway * (0.4 + 0.6 * near);
  const alpha = (0.3 + 0.5 * near) * Math.min(1, f.drift * 2 + (speed < 1 ? 1 - speed : 0));
  const still = Math.max(0, 1 - speed);
  const glint = still * Math.pow(Math.max(0, Math.sin(f.phase * 7 + t * c.twinkle)), 12);
  return { dx, alpha: Math.min(1, alpha), glint };
}

/** 白い息のもや（y は画面の下から px） */
export interface Mist {
  x: number; // 0〜1
  y: number; // px（下から）
  vx: number; // px/秒（横へ散る）
  vy: number;
  size: number;
  phase: number;
  age: number;
  life: number;
}

/** 息を1回吐く：画面の下の真ん中から、白いもやが、いくつか出る */
export function mistPuff(rand: Rand): Mist[] {
  const c = ICE_CONFIG.mist;
  return Array.from({ length: c.count }, () => ({
    x: 0.5 + (rand() - 0.5) * 0.14,
    y: 60 + rand() * 50,
    vx: (rand() - 0.5) * 2 * c.spread,
    vy: between(c.rise, rand),
    size: between(c.size, rand),
    phase: rand() * Math.PI * 2,
    age: -rand() * 0.35, // 少しずつずれて出る
    life: between(c.life, rand),
  }));
}

/** もやを dt 秒だけ進める（ゆっくり上り、横へ散り、広がって、消える）。width は画面の幅（px。横の動きを割合にする） */
export function stepMist(mist: readonly Mist[], dt: number, width: number): Mist[] {
  return mist
    .map((m) => (m.age > 0 ? { ...m, age: m.age + dt, y: m.y + m.vy * dt, x: m.x + (m.vx * dt) / Math.max(1, width) } : { ...m, age: m.age + dt }))
    .filter((m) => m.age < m.life);
}

/** もやの見え方：広がりながら、そっと濃くなり、そっと消える（まだ出ていないものは見えない） */
export function mistLook(m: Mist): { x: number; size: number; alpha: number } {
  const c = ICE_CONFIG.mist;
  const k = Math.max(0, m.age) / m.life;
  return { x: m.x + Math.sin(m.phase + m.age * 0.7) * 0.02, size: m.size * (1 + (c.grow - 1) * k), alpha: m.age <= 0 ? 0 : c.alpha * Math.pow(Math.sin(Math.PI * k), 0.8) };
}

/** 氷の欠片（px。y は画面の上から） */
export interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  size: number;
  age: number;
  life: number;
  corners: number[]; // 角の向きのずれ（3〜4つ。とがった、ふぞろいな形）
}

const shardOf = (x: number, y: number, vx: number, vy: number, rand: Rand): Shard => {
  const c = ICE_CONFIG.shard;
  return {
    x,
    y,
    vx,
    vy,
    rot: rand() * Math.PI * 2,
    spin: (rand() - 0.5) * 14,
    size: between(c.size, rand),
    age: 0,
    life: between(c.life, rand),
    corners: Array.from({ length: rand() < 0.5 ? 3 : 4 }, () => 0.55 + rand() * 0.6),
  };
};

/** 言葉が砕ける：言葉の四角（px。画面の上から）の中から、欠片が四方へはじけ、落ちていく */
export function shardsFromBox(box: { x0: number; x1: number; y0: number; y1: number }, count: number, rand: Rand): Shard[] {
  return Array.from({ length: count }, () => {
    const x = box.x0 + (box.x1 - box.x0) * rand();
    const y = box.y0 + (box.y1 - box.y0) * rand();
    const cx = (box.x0 + box.x1) / 2;
    return shardOf(x, y, (x - cx) * 2.2 + (rand() - 0.5) * 120, -60 - rand() * 160, rand);
  });
}

/** 氷の巨像が砕ける：画面のふち（霜のあった所）から、大きめの欠片が、内へはじけて落ちる */
export function shardsFromEdges(w: number, h: number, count: number, rand: Rand): Shard[] {
  return Array.from({ length: count }, () => {
    const side = Math.floor(rand() * 4);
    const along = rand();
    const [x, y] = side === 0 ? [along * w, 0] : side === 1 ? [w, along * h] : side === 2 ? [along * w, h * 0.9] : [0, along * h];
    const s = shardOf(x, y, (w / 2 - x) * (0.4 + rand() * 0.5), (h / 2 - y) * (0.2 + rand() * 0.3) - 80, rand);
    return { ...s, size: s.size * 1.5 };
  });
}

/** 欠片を dt 秒だけ進める（重さで落ち、回る。寿命が来たら消える） */
export function stepShards(shards: readonly Shard[], dt: number): Shard[] {
  const g = ICE_CONFIG.shard.gravity;
  return shards.map((s) => ({ ...s, x: s.x + s.vx * dt, y: s.y + s.vy * dt, vy: s.vy + g * dt, rot: s.rot + s.spin * dt, age: s.age + dt })).filter((s) => s.age < s.life);
}

/** 欠片の見え方：はじめは明るく、寿命に向けて消える。回るたびに、きらりと光る（glint：0〜1） */
export function shardLook(s: Shard): { alpha: number; glint: number } {
  const k = s.age / s.life;
  return { alpha: Math.min(1, (1 - k) * 1.6), glint: Math.pow(Math.max(0, Math.cos(s.rot * 2)), 6) };
}

/**
 * 霜の模様：画面の四方のふちから内へ伸びる、シダの葉のような結晶。幹から、左右かわるがわる60度の向きに脇枝が出て、先へ行くほど短くなる（脇枝からも、もう一段）。
 * 点は px。線の太さと濃さも持つ。同じ乱数なら、同じ模様
 */
export function frostBranches(w: number, h: number, rand: Rand): { points: [number, number][]; width: number; alpha: number }[] {
  const c = ICE_CONFIG.frost;
  const out: { points: [number, number][]; width: number; alpha: number }[] = [];
  const grow = (x: number, y: number, angle: number, length: number, depth: number) => {
    const points: [number, number][] = [[x, y]];
    let a = angle;
    let side = rand() < 0.5 ? -1 : 1;
    let next = c.sideEvery * (0.5 + rand());
    for (let d = 0; d < length; d += c.step) {
      a += (rand() - 0.5) * c.wobble * (depth === 0 ? 1 : 0.6);
      x += Math.cos(a) * c.step;
      y += Math.sin(a) * c.step;
      points.push([x, y]);
      if (depth < 2 && d >= next) {
        const rest = length - d;
        if (rest > 4) grow(x, y, a + side * (Math.PI / 3), rest * c.sideLength * (0.6 + 0.4 * rand()), depth + 1);
        side = -side;
        next = d + c.sideEvery * (depth === 0 ? 1 : 0.8) * (0.7 + 0.6 * rand());
      }
    }
    out.push({ points, width: depth === 0 ? 1.1 : depth === 1 ? 0.75 : 0.5, alpha: depth === 0 ? 0.5 : depth === 1 ? 0.36 : 0.24 });
  };
  const n = Math.round(((2 * (w + h)) / 1000) * c.branchesPer1000);
  for (let i = 0; i < n; i++) {
    const p = rand() * 2 * (w + h);
    // ふちの点と、内向きの向き
    const [x, y, inward] = p < w ? [p, 0, Math.PI / 2] : p < w + h ? [w, p - w, Math.PI] : p < 2 * w + h ? [p - w - h, h, -Math.PI / 2] : [0, p - 2 * w - h, 0];
    grow(x, y, inward + (rand() - 0.5) * 1.3, between(c.length, rand), 0);
  }
  return out;
}

/** 呼ぶ声の波：声の瞬間に、画面の真ん中から、細い輪が静かに広がり、どこにも届かずに消える。progress は広がり（0〜1）、alpha は濃さ */
export function ripplesAt(hits: readonly { at: number; power: number }[], t: number): { progress: number; alpha: number }[] {
  const r = ICE_CONFIG.ripple;
  const out: { progress: number; alpha: number }[] = [];
  for (const h of hits) {
    const k = (t - h.at) / r.life;
    if (k < 0 || k >= 1) continue;
    out.push({ progress: 1 - Math.pow(1 - k, 2.2), alpha: 0.5 * h.power * Math.pow(1 - k, 1.4) });
  }
  return out;
}
