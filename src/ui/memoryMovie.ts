// 記憶の「動く場面」（ボスを倒した直後の記憶の画面を、時間で動かす）。docs/memory-movie.md
// 文章は story.ts の MEMORIES をそのまま使い、ここでは「いつ・どう動かすか」だけを決める（時間は秒）。
// 画面の揺れ・光・火の粉・フラッシュは、時刻 t から決まる関数にしてある（乱数は使わない。同じ時刻なら同じ絵になる）。
// いまは炎の魔獣だけ。ほかのボスは、これまでの記憶の画面のまま（MOVIES にないボスは作らない）。

export interface Hit {
  at: number; // 大きな声が響く時刻
  power: number; // 強さ（0〜1.2くらい）。画面の揺れと赤いフラッシュの大きさ
}

/** 時間で変わる値：[時刻, 値] の並び。間は直線でつなぐ（前後は端の値のまま） */
export type Keys = readonly (readonly [number, number])[];

export interface MovieDef {
  duration: number; // 場面の長さ（秒）。そのあとも、画面は静かに残る
  /** 記憶の文章が出る時刻（行の順に）。数は、その記憶の行の数と同じ */
  lineAt: readonly number[];
  /** 大きな声で揺れる行（lineAt の番号）。出ているあいだ、文字がふるえる */
  loud: readonly number[];
  /** 書いては消した言葉が出る時刻（取り消し線は、出てから少しあとに引く） */
  crossedAt: number;
  /** 塗りつぶしの帯は、直前の文章から、これだけ遅れて出る */
  blackDelay: number;
  /** 倒したボスの一文が出る時刻 */
  echoAt: number;
  hits: readonly Hit[];
  glow: Keys; // 後ろの赤い光の明るさ（0〜1）
  embers: Keys; // 火の粉が出る勢い（1秒に出る数）
  breath: readonly [number, number] | null; // 息をひそめる場面（始まりと終わりの時刻）。光をゆっくり脈打たせる
}

export const MOVIE_CONFIG = {
  quake: { decay: 0.6, freq: 13, amp: 20, rot: 1.3 }, // 揺れ：減っていく時間（秒）・揺れの速さ（Hz）・大きさ（px）・傾き（度）
  punch: { decay: 0.32, scale: 0.05 }, // 声の瞬間に、画面がぐっと迫る：戻るまでの時間（秒）・拡大の割合（強さ1のとき）
  flash: { decay: 0.4, peak: 0.85 }, // 赤いフラッシュ：消えるまでの時間（秒）・いちばん明るいときの濃さ
  burst: { count: 46, rise: [180, 420] as const, size: [2, 5.5] as const, life: [1, 2.2] as const }, // 声の瞬間に下から噴き上がる火の粉（強さ1のときの数・上る速さ・大きさ・寿命）
  sound: { heartEvery: 0.95, burnCross: 3.4 }, // 音：心音の間隔（秒）／「やめて」が燃えるチリチリの長さ（秒）
  ember: { max: 240, rise: [40, 120] as const, drift: 26, life: [1.6, 3.4] as const, size: [1.6, 4.2] as const }, // 火の粉：上限の数・上る速さ(px/秒)・横ぶれ・寿命(秒)・大きさ(px)
  strikeDelay: 1.1, // 取り消し線が引かれるまで（出てから、秒）
  write: { perChar: 0.075, min: 0.7, max: 1.8, crossedPerChar: 0.12, crossedMin: 0.5, black: 0.45, strike: 0.5 }, // 文字が書かれていく長さ（秒）：1文字あたり・最短・最長／書いては消した言葉（1文字あたり・最短）／塗りつぶしの帯／取り消し線を引く
  breath: { period: 3.2, depth: 0.18 }, // 息づかい：1回の長さ（秒）・光の増減の深さ
} as const;

/** 炎の魔獣：大きな声（家が揺れる）→ 布団の中で息をひそめる → 誰も来ない → 「やめて」と書いては消す */
export const MOVIES: Readonly<Record<string, MovieDef>> = {
  flame_beast: {
    duration: 21,
    lineAt: [1.4, 6.6, 10.2],
    loud: [0],
    crossedAt: 14.6,
    blackDelay: 1.0,
    echoAt: 18.2,
    hits: [
      { at: 1.5, power: 1.0 },
      { at: 3.0, power: 0.8 },
      { at: 4.7, power: 1.2 },
      { at: 11.2, power: 0.45 },
      { at: 12.5, power: 0.6 },
    ],
    glow: [
      [0, 0.0],
      [1.2, 0.55],
      [5.5, 0.7],
      [6.6, 0.18],
      [10, 0.2],
      [12.5, 0.4],
      [14.6, 0.12],
      [18, 0.3],
      [21, 0.25],
    ],
    embers: [
      [0, 0],
      [1.4, 42],
      [5.5, 61],
      [6.8, 6],
      [11, 10],
      [12.5, 29],
      [14.6, 3],
      [18.2, 16],
      [21, 10],
    ],
    breath: [6.6, 10.2],
  },
};

/** 時間で変わる値を、時刻 t で読む（Keys は時刻の小さい順） */
export function valueAt(keys: Keys, t: number): number {
  const first = keys[0]!;
  if (t <= first[0]) return first[1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i]!;
    if (t <= t1) {
      const [t0, v0] = keys[i - 1]!;
      return t1 === t0 ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return keys[keys.length - 1]![1];
}

export interface Quake {
  x: number; // px
  y: number; // px
  rot: number; // 度
}

/** 時刻 t の、画面の揺れ。大きな声が響いた瞬間に大きく、すぐに減る */
export function quakeAt(hits: readonly Hit[], t: number): Quake {
  const q = MOVIE_CONFIG.quake;
  let x = 0;
  let y = 0;
  let rot = 0;
  for (const h of hits) {
    const dt = t - h.at;
    if (dt < 0 || dt > q.decay * 5) continue;
    const k = Math.exp(-dt / q.decay) * h.power;
    const w = dt * q.freq * 2 * Math.PI;
    x += Math.sin(w + h.at * 7) * k * q.amp;
    y += Math.cos(w * 1.3 + h.at * 3) * k * q.amp * 0.6;
    rot += Math.sin(w * 0.8 + h.at) * k * q.rot;
  }
  return { x, y, rot };
}

/** 時刻 t の、声の瞬間に画面がぐっと迫る倍率（1以上）。すぐ戻る */
export function punchAt(hits: readonly Hit[], t: number): number {
  const p = MOVIE_CONFIG.punch;
  let k = 0;
  for (const h of hits) {
    const dt = t - h.at;
    if (dt >= 0 && dt < p.decay * 5) k = Math.max(k, Math.exp(-dt / p.decay) * h.power);
  }
  return 1 + k * p.scale;
}

/** 時刻 t の、赤いフラッシュの濃さ（0〜）。大きな声が響いた瞬間に光って、すぐ消える */
export function flashAt(hits: readonly Hit[], t: number): number {
  const f = MOVIE_CONFIG.flash;
  let v = 0;
  for (const h of hits) {
    const dt = t - h.at;
    if (dt >= 0 && dt < f.decay * 5) v = Math.max(v, Math.exp(-dt / f.decay) * h.power * f.peak);
  }
  return v;
}

/** 時刻 t の、後ろの光の明るさ（0〜1）。息をひそめる場面（breath）では、ゆっくり脈打つ */
export function glowAt(movie: MovieDef, t: number): number {
  const base = valueAt(movie.glow, t);
  const calm = movie.breath;
  if (!calm || t < calm[0] || t > calm[1]) return base;
  const b = MOVIE_CONFIG.breath;
  return Math.max(0, base + Math.sin(((t - calm[0]) / b.period) * 2 * Math.PI) * b.depth * base);
}

/** 火の粉 */
export interface Ember {
  x: number; // 0〜1（画面の幅に対する位置）
  y: number; // px（画面の下から）
  vy: number; // px/秒
  phase: number; // 横ぶれの位相
  age: number;
  life: number;
  size: number;
}

/** 0〜1 の乱数を返す関数（注入する。テストでは決まった並びを渡す） */
export type Rand = () => number;

/** 火の粉を dt 秒だけ進める（古いものを消し、勢い rate に応じて新しく出す）。新しい配列を返す */
export function stepEmbers(embers: readonly Ember[], dt: number, rate: number, rand: Rand): Ember[] {
  const c = MOVIE_CONFIG.ember;
  const alive = embers.map((e) => ({ ...e, age: e.age + dt, y: e.y + e.vy * dt })).filter((e) => e.age < e.life);
  const want = rate * dt;
  let n = Math.floor(want) + (rand() < want - Math.floor(want) ? 1 : 0);
  while (n-- > 0 && alive.length < c.max) {
    alive.push({
      x: rand(),
      y: -4,
      vy: c.rise[0] + (c.rise[1] - c.rise[0]) * rand(),
      phase: rand() * Math.PI * 2,
      age: 0,
      life: c.life[0] + (c.life[1] - c.life[0]) * rand(),
      size: c.size[0] + (c.size[1] - c.size[0]) * rand(),
    });
  }
  return alive;
}

/** 声の瞬間に、下から噴き上がる火の粉（強さ power のぶん、たくさん・速く） */
export function burstEmbers(power: number, rand: Rand): Ember[] {
  const b = MOVIE_CONFIG.burst;
  return Array.from({ length: Math.round(b.count * power) }, () => ({
    x: rand(),
    y: -4,
    vy: b.rise[0] + (b.rise[1] - b.rise[0]) * rand() * Math.min(1.3, 0.6 + power * 0.5),
    phase: rand() * Math.PI * 2,
    age: 0,
    life: b.life[0] + (b.life[1] - b.life[0]) * rand(),
    size: b.size[0] + (b.size[1] - b.size[0]) * rand(),
  }));
}

/** 火の粉の、いまの横の位置（0〜1）と明るさ（0〜1。出てすぐ明るく、寿命に向けて消える） */
export function emberLook(e: Ember): { x: number; alpha: number } {
  const c = MOVIE_CONFIG.ember;
  const k = e.age / e.life;
  return { x: e.x + (Math.sin(e.phase + e.age * 2.4) * c.drift) / 1000, alpha: Math.min(1, k * 6) * (1 - k) };
}

/**
 * 記憶の文字の絵（scrawl の部品の並び）が、それぞれ出る時刻。
 * 行は lineAt の順、書いては消した言葉は crossedAt、塗りつぶしの帯は、直前の部品から blackDelay だけ遅れる
 */
export function itemTimes(kinds: readonly ('line' | 'crossed' | 'black')[], movie: MovieDef): number[] {
  let line = 0;
  const out: number[] = [];
  for (const kind of kinds) {
    const prev = out[out.length - 1] ?? 0;
    out.push(kind === 'line' ? (movie.lineAt[line++] ?? prev + 1.1) : kind === 'crossed' ? movie.crossedAt : prev + movie.blackDelay);
  }
  return out;
}

/** 場面の音（時刻 at に、kind の音を鳴らす。power は synth.ts の pitch に渡す：roar・heartbeat は強さ、rumble・sizzle・chalk は長さ（秒）） */
export interface SoundCue {
  at: number;
  kind: 'roar' | 'rumble' | 'heartbeat' | 'hush' | 'sizzle' | 'sizzle_soft' | 'chalk' | 'chalk_bold';
  power: number;
}

/** 文字の絵ひとつ。chars は文字数（塗りつぶしの帯は 0） */
export interface Write {
  kind: 'line' | 'crossed' | 'black';
  chars: number;
}

/** 文字の絵ひとつが、書かれていく長さ（秒）。文字数に比例（短い行・長い行で、極端にならないよう範囲を決める）。画面の出方（CSS の --write）と、チョークの音が同じ長さを使う */
export function writeSeconds(w: Write): number {
  const c = MOVIE_CONFIG.write;
  if (w.kind === 'black') return c.black;
  if (w.kind === 'crossed') return Math.max(c.crossedMin, w.chars * c.crossedPerChar);
  return Math.min(c.max, Math.max(c.min, w.chars * c.perChar));
}

/**
 * 場面の音の予定を、時刻の順に作る（乱数は使わない）。
 * 地鳴りが場面のはじめから息をひそめる前まで続き、声が響くたびに roar。
 * 紙が燃えるようなチリチリ（sizzle）が、声のあいだは大きく、息をひそめるあいだは小さく、「やめて」が燃えるときは大きく、最後はそっと続く。
 * 息をひそめるあいだは心音。最後に、静かな低い響き。（「やめて」を書く音・取り消し線を引く音は、乾いた「かかか、かこかこ」に聞こえたので、鳴らさない）
 */
export function soundCues(movie: MovieDef, writes: readonly Write[] = []): SoundCue[] {
  const c = MOVIE_CONFIG.sound;
  const cues: SoundCue[] = [];
  const calmStart = movie.breath?.[0] ?? movie.lineAt[1] ?? movie.duration / 3;
  cues.push({ at: 0.2, kind: 'rumble', power: Math.max(2, calmStart - 0.2) });
  for (const h of movie.hits) cues.push({ at: h.at, kind: 'roar', power: h.power });
  const burnEnd = movie.crossedAt + c.burnCross;
  cues.push({ at: movie.lineAt[0]! - 0.6, kind: 'sizzle', power: calmStart - movie.lineAt[0]! + 0.6 });
  cues.push({ at: calmStart, kind: 'sizzle_soft', power: movie.crossedAt - calmStart });
  cues.push({ at: movie.crossedAt, kind: 'sizzle', power: burnEnd - movie.crossedAt });
  cues.push({ at: movie.echoAt, kind: 'sizzle_soft', power: movie.duration - movie.echoAt });
  if (movie.breath) {
    const [from, to] = movie.breath;
    for (let t = from + 0.3; t < to; t += c.heartEvery) cues.push({ at: t, kind: 'heartbeat', power: 0.45 + 0.35 * ((t - from) / (to - from)) });
  }
  // 文字が書かれていくあいだ、チョークで書く音（声の行は力を込めて、強く。書いては消した言葉・塗りつぶしの帯も強く）。取り消し線は、勢いよく引く
  const times = itemTimes(writes.map((w) => w.kind), movie);
  let line = 0;
  writes.forEach((w, i) => {
    const bold = w.kind !== 'line' || movie.loud.includes(line);
    if (w.kind === 'line') line++;
    cues.push({ at: times[i]!, kind: bold ? 'chalk_bold' : 'chalk', power: writeSeconds(w) });
    if (w.kind === 'crossed') cues.push({ at: times[i]! + MOVIE_CONFIG.strikeDelay, kind: 'chalk_bold', power: MOVIE_CONFIG.write.strike });
  });
  cues.push({ at: movie.echoAt, kind: 'hush', power: 1 });
  return cues.sort((a, b) => a.at - b.at);
}
