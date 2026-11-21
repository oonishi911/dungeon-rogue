// 記憶の「動く場面」（ボスを倒した直後の記憶の画面を、時間で動かす）。docs/memory-movie.md
// 文章は story.ts の MEMORIES をそのまま使い、ここでは「いつ・どう動かすか」だけを決める（時間は秒）。
// 画面の揺れ・光・炎の勢い・闇・音のこもり方は、時刻 t から決まる関数にしてある（乱数は使わない。同じ時刻なら同じ絵になる）。
// 炎・煙・火の粉・灰の粒だけは、乱数で出す（乱数の関数は外から渡す。テストでは決まった並びを渡す）。
// 場面には型がある（style）：炎（炎の魔獣）と氷（氷の巨像）。型ごとに、描き方（flamePainter.ts・icePainter.ts）と音が違う。
// MOVIES にないボスは、これまでの記憶の画面のまま。
// 表現の約束（docs/story.md）：家の中の場面や人物は描かない。感情の形を、光・炎・闇・揺れ・文字・音で表す。

export interface Hit {
  at: number; // 大きな声が響く時刻
  power: number; // 強さ（0〜1.2くらい）。画面の揺れと赤いフラッシュの大きさ
}

/** 時間で変わる値：[時刻, 値] の並び。間は直線でつなぐ（前後は端の値のまま） */
export type Keys = readonly (readonly [number, number])[];

/** 心音：from〜to のあいだ、間隔が every[0] から every[1] へ、強さが power[0] から power[1] へ変わる（炎：速く強く。氷：遅く弱く） */
export interface HeartDef {
  from: number;
  to: number;
  every: readonly [number, number];
  power: readonly [number, number];
}

/** どの型の場面にもある設定 */
interface MovieBase {
  duration: number; // 場面の長さ（秒）。そのあとも、画面は静かに残る
  /** 記憶の文章が出る時刻（行の順に）。数は、その記憶の行の数と同じ */
  lineAt: readonly number[];
  /** 大きな声で揺れる行（lineAt の番号）。出ているあいだ、文字がふるえる */
  loud: readonly number[];
  /** 書いては消した言葉が出る時刻（取り消し線は、出てから少しあとに引く） */
  crossedAt: number;
  /** 書いては消した言葉が、壊れ始める時刻と、壊れきるまでの長さ（秒）。炎は燃え尽き、氷は砕け散る */
  breakAt: number;
  breakFor: number;
  /** 塗りつぶしの帯は、直前の文章から、これだけ遅れて出る */
  blackDelay: number;
  /** 倒したボスの一文が出る時刻（ここから、いまに戻る） */
  echoAt: number;
  /** 声（炎：大きな声。揺れ・赤いフラッシュ。氷：あの子が呼ぶ声。揺らさない） */
  hits: readonly Hit[];
  /** 声のほかの、衝撃（小さく揺れる。氷では、白く光る）：砕ける瞬間など */
  impacts: readonly Hit[];
  glow: Keys; // 後ろの光の明るさ（0〜1）
  enclose: Keys; // 四方から迫る深さ（0：なし〜1：真ん中だけ見える）。炎は闇（布団の中）、氷は霜
  muffle: Keys; // 外の音のこもり方：通す高さの上限（Hz。小さいほど、こもる）
  breath: readonly [number, number] | null; // 息をひそめる場面（始まりと終わりの時刻）。炎は光がゆっくり脈打ち、氷は息が白くなる
  heart: HeartDef | null;
}

/** 炎の場面：下で燃える炎・火の粉・煙・灰。言葉は燃え尽きる */
export interface FlameMovie extends MovieBase {
  style: 'flame';
  embers: Keys; // 火の粉が出る勢い（1秒に出る数）
  fire: Keys; // 下で燃える炎の勢い（0〜1くらい）。声の瞬間には、さらに燃え上がる
  smoke: Keys; // 煙が出る勢い（1秒に出る数）
  ash: Keys; // 灰が降る勢い（1秒に出る数）
  ring: readonly [number, number] | null; // 耳鳴りが続くあいだ（耳をふさいだとき）
}

/** 氷の場面：降る雪・白い息・霜・氷の欠片。雪は凍って宙で止まり、言葉は砕け散る */
export interface IceMovie extends MovieBase {
  style: 'ice';
  snow: Keys; // 雪が降り始める勢い（1秒に出る数）
  freeze: Keys; // 雪の動きの速さの倍率（1：ふつう〜0：凍って宙で止まる）
  frostAt: number; // 文字に霜がつく時刻（冷たいのは、外ではなかった）
  frosting: readonly [number, number]; // 霜が広がっていくあいだ（音：霜のきらめき）
  creak: readonly [number, number]; // 凍りついていくあいだ（音：ガラスがきしむ。終わりで、ぴたりと止まる）
}

export type MovieDef = FlameMovie | IceMovie;

export const MOVIE_CONFIG = {
  quake: { decay: 0.6, freq: 13, amp: 20, rot: 1.3 }, // 揺れ：減っていく時間（秒）・揺れの速さ（Hz）・大きさ（px）・傾き（度）
  punch: { decay: 0.32, scale: 0.05 }, // 声の瞬間に、画面がぐっと迫る：戻るまでの時間（秒）・拡大の割合（強さ1のとき）
  flash: { decay: 0.4, peak: 0.85 }, // 赤いフラッシュ：消えるまでの時間（秒）・いちばん明るいときの濃さ
  burst: { count: 46, rise: [180, 420] as const, size: [2, 5.5] as const, life: [1, 2.2] as const }, // 声の瞬間に下から噴き上がる火の粉（強さ1のときの数・上る速さ・大きさ・寿命）
  sound: { burnTail: 0.5 }, // 音：言葉が燃え尽きたあとも、チリチリが残る長さ（秒）
  ember: { max: 240, rise: [40, 120] as const, drift: 26, life: [1.6, 3.4] as const, size: [1.6, 4.2] as const }, // 火の粉：上限の数・上る速さ(px/秒)・横ぶれ・寿命(秒)・大きさ(px)
  // 下で燃える炎（縦長のやわらかい光の粒を、下から次々に立ちのぼらせる）：上限の数・勢い1のときの1秒に出る数・上る速さ(px/秒)・寿命(秒)・大きさ(px)・いちばん明るいとき・根元の光の高さ（画面の高さに対する割合。勢い1のとき）・声で燃え上がる強さと、収まる時間（秒）
  fire: { max: 240, rate: 150, rise: [80, 190] as const, life: [0.4, 0.95] as const, size: [34, 80] as const, alpha: 0.7, base: 0.16, flare: 0.9, flareDecay: 0.5 },
  smoke: { max: 26, rise: [12, 30] as const, life: [5, 8.5] as const, size: [50, 110] as const, grow: 1.9, alpha: 0.13 }, // 煙：上限の数・上る速さ・寿命・大きさ・寿命までに広がる倍率・いちばん濃いとき
  ash: { max: 110, fall: [16, 42] as const, sway: 22, life: [6, 11] as const, size: [1.6, 4] as const, alpha: 0.7 }, // 灰：上限の数・落ちる速さ(px/秒)・横ぶれ(px)・寿命・大きさ・いちばん濃いとき
  ring: { life: 0.95, reach: 1.25 }, // 声の波：広がりきるまでの秒・画面の高さに対する広がり
  heart: { dub: 0.23, decay: 0.11, enclose: 0.07 }, // 心音：2拍目の遅れ・画面の脈の減り方・脈で闇（霜）が迫る深さ（間隔と強さは、場面ごとの heart）
  drift: { zoom: 0.045, sway: [2.2, 1.6] as const }, // カメラ：場面を通して、ゆっくり寄る割合・手持ちのような、ゆるい揺れ(px)
  flicker: 0.14, // 炎の光のゆらめき（±の割合）
  kick: 0.22, // 赤い線（氷はひび）が走るたびの、小さな揺れの強さ（言葉が壊れ始めるときは、この1.4倍）
  burn: { flare: 0.55, decay: 0.7, embers: 34 }, // 言葉が燃えるとき：後ろの光と炎が明るくなる量・燃え尽きてから収まる時間・言葉から上る火の粉（1秒に出る数）
  muffleOpen: { gain: 3, decay: 0.35, max: 16000 }, // こもった中に、声が入ってくる：声の瞬間に、通す高さを何倍に開くか・戻る時間・上限(Hz)
  strikeDelay: 1.1, // 取り消し線が引かれるまで（出てから、秒）
  slash: { every: 0.22, pitch: [1, 0.86, 1.14, 0.94] as const }, // 赤い線が1本ずつ出る間隔（秒。styles.css の .mm__scrawl .scrawl__scratches と同じ）と、その音の高さの倍率（線の数と同じだけ並べる）
  write: { perChar: 0.075, min: 0.7, max: 1.8, crossedPerChar: 0.12, crossedMin: 0.5, black: 0.45, strike: 0.5, soundLag: 0.08, soundTrim: 0.12 }, // 文字が書かれていく長さ（秒）：1文字あたり・最短・最長／書いては消した言葉（1文字あたり・最短）／塗りつぶしの帯／取り消し線を引く／チョークの音を、文字の見え始めに合わせて遅らせる秒数と、終わりを縮める秒数（文字が現れる最初の1〜2文字は、まだ見えないため）
  breath: { period: 3.2, depth: 0.18 }, // 息づかい：1回の長さ（秒）・光の増減の深さ
  mist: { lead: 0.8, every: 2.0 }, // 白い息（氷）：息をひそめてから最初の息まで（秒）・息の間隔（秒）
} as const;

/**
 * 炎の魔獣（怒りと恐れ）：
 * 暗闇の下から炎が起こり、吸い込むような高まり → 大きな声が3回（家が揺れる）→ 闇が迫り、外の音がこもる（布団の中）。息をのみ、心音が速くなる →
 * 誰も来ない。こもった中に、声が2回入ってくる。耳鳴り → 音がほとんど消え、「やめて」と書いて、消す。赤い線が走り、言葉が燃え尽きる →
 * 色が冷め、灰が降る。倒したボスの一文と、静かな和音
 */
export const FLAME_BEAST: FlameMovie = {
  style: 'flame',
  duration: 22,
  lineAt: [1.4, 6.6, 10.2],
  loud: [0],
  crossedAt: 14.6,
  breakAt: 16.75,
  breakFor: 1.5,
  blackDelay: 1.0,
  echoAt: 18.6,
  hits: [
    { at: 1.5, power: 1.0 },
    { at: 3.0, power: 0.8 },
    { at: 4.7, power: 1.2 },
    { at: 11.2, power: 0.45 },
    { at: 12.5, power: 0.6 },
  ],
  impacts: [],
  glow: [
    [0, 0.0],
    [1.2, 0.55],
    [5.5, 0.7],
    [6.6, 0.18],
    [10, 0.2],
    [12.5, 0.4],
    [14.4, 0.12],
    [16.7, 0.1],
    [18.6, 0.28],
    [22, 0.2],
  ],
  embers: [
    [0, 0],
    [1.4, 42],
    [5.5, 61],
    [6.8, 6],
    [11, 10],
    [12.5, 29],
    [14.6, 3],
    [18.6, 16],
    [22, 8],
  ],
  fire: [
    [0, 0],
    [0.3, 0.1],
    [1.3, 0.55],
    [5.5, 0.85],
    [6.6, 0.45],
    [7.4, 0.13],
    [10, 0.15],
    [12.5, 0.3],
    [14.3, 0.08],
    [14.6, 0.03],
    [16.6, 0.03],
    [18.6, 0.1],
    [22, 0.03],
  ],
  smoke: [
    [0, 0],
    [1.5, 1.2],
    [6.6, 1.6],
    [8, 0.5],
    [14.6, 0.4],
    [16.8, 2.6],
    [18.6, 1.0],
    [22, 0.5],
  ],
  ash: [
    [0, 0],
    [18.2, 0],
    [18.8, 9],
    [22, 7],
  ],
  enclose: [
    [0, 0],
    [6.5, 0],
    [7.6, 0.78],
    [10, 0.82],
    [11, 0.62],
    [14.3, 0.72],
    [14.7, 0.88],
    [16.7, 0.84],
    [17.3, 0.45],
    [18.6, 0.3],
    [22, 0.22],
  ],
  muffle: [
    [0, 16000],
    [6.5, 16000],
    [7.0, 600],
    [10, 600],
    [10.4, 850],
    [14.3, 850],
    [14.6, 260],
    [16.7, 260],
    [18.4, 1800],
    [19.6, 16000],
  ],
  breath: [6.6, 10.2],
  heart: { from: 6.9, to: 14.3, every: [0.95, 0.68], power: [0.45, 0.85] },
  ring: [12.7, 14.6],
};

/**
 * 氷の巨像（孤立）：炎とは逆に、外から来る声ではなく、あの子が呼ぶ小さな声が、何も返さない空っぽへ消えていく。
 * 暗い青の中に雪が降り始め、上から冷たい光 → 呼ぶ声が3回（こだまだけが返り、だんだん弱く）→ 四方から霜が迫り、音が消えていく。息が白い。心音が遅く、弱くなる →
 * 冷たいのは、外ではなかった：文字に霜がつき、降る雪が宙で凍って止まる。ガラスがきしみ、ぴたりと止まる → 静けさの中で「ここにいるよ」と書いて、消す。ひびが走り、言葉が砕け散る →
 * 氷の巨像が砕ける：霜が割れて落ち、止まっていた雪がまた降り始め、色が冷めた灰色になる。まばらな鐘の音
 */
export const ICE_COLOSSUS: IceMovie = {
  style: 'ice',
  duration: 23,
  lineAt: [1.2, 7.8, 11.8],
  loud: [],
  crossedAt: 15.0,
  breakAt: 17.15,
  breakFor: 0.6,
  blackDelay: 1.0,
  echoAt: 18.8,
  hits: [
    { at: 2.9, power: 1.0 },
    { at: 4.6, power: 0.75 },
    { at: 6.2, power: 0.5 },
  ],
  impacts: [
    { at: 17.15, power: 0.35 },
    { at: 18.8, power: 0.7 },
  ],
  glow: [
    [0, 0],
    [1.0, 0.45],
    [2.9, 0.55],
    [6.6, 0.35],
    [7.8, 0.3],
    [11.8, 0.22],
    [13.8, 0.12],
    [15, 0.1],
    [18.8, 0.35],
    [23, 0.28],
  ],
  enclose: [
    [0, 0],
    [7.4, 0],
    [10.5, 0.5],
    [12.6, 0.58],
    [13.8, 0.82],
    [18.75, 0.85],
    [19.4, 0.05],
    [23, 0],
  ],
  muffle: [
    [0, 16000],
    [7.4, 16000],
    [10.5, 1100],
    [13.8, 350],
    [18.7, 350],
    [19.4, 16000],
  ],
  snow: [
    [0, 0],
    [0.5, 14],
    [7, 18],
    [11.8, 16],
    [12.8, 0],
    [19.2, 0],
    [19.8, 10],
    [23, 8],
  ],
  freeze: [
    [0, 1],
    [12.6, 1],
    [13.8, 0],
    [18.8, 0],
    [20.6, 0.55],
    [23, 0.55],
  ],
  frostAt: 12.6,
  frosting: [7.4, 13.8],
  creak: [11.9, 13.8],
  breath: [7.8, 11.8],
  heart: { from: 8.2, to: 14.0, every: [1.05, 1.7], power: [0.55, 0.28] },
};

export const MOVIES: Readonly<Record<string, MovieDef>> = { flame_beast: FLAME_BEAST, ice_colossus: ICE_COLOSSUS };

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

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

/** 時刻 t の、言葉が壊れる明るさ（0〜1）：壊れ始めにすぐ明るくなり、壊れているあいだ続き、壊れきると収まる（炎：燃える光） */
export function breakLightAt(movie: MovieDef, t: number): number {
  const dt = t - movie.breakAt;
  if (dt < 0) return 0;
  if (dt < movie.breakFor) return Math.min(1, dt / 0.15);
  return Math.exp(-(dt - movie.breakFor) / MOVIE_CONFIG.burn.decay);
}

/** 言葉が、どこまで壊れたか（0：まだ〜1：壊れきった） */
export function breakProgress(movie: MovieDef, t: number): number {
  return clamp01((t - movie.breakAt) / movie.breakFor);
}

/** 時刻 t の、後ろの光の明るさ（0〜）。息をひそめる場面（breath）では、ゆっくり脈打つ。炎は、言葉が燃えるとき明るくなる */
export function glowAt(movie: MovieDef, t: number): number {
  const base = valueAt(movie.glow, t) + (movie.style === 'flame' ? breakLightAt(movie, t) * MOVIE_CONFIG.burn.flare : 0);
  const calm = movie.breath;
  if (!calm || t < calm[0] || t > calm[1]) return base;
  const b = MOVIE_CONFIG.breath;
  return Math.max(0, base + Math.sin(((t - calm[0]) / b.period) * 2 * Math.PI) * b.depth * base);
}

/** 炎の光のゆらめき（1の前後。±flicker の中。同じ時刻なら同じ値） */
export function flickerAt(t: number): number {
  return 1 + MOVIE_CONFIG.flicker * (0.55 * Math.sin(t * 11.3) + 0.3 * Math.sin(t * 23.7 + 1.3) + 0.15 * Math.sin(t * 5.1 + 0.4));
}

/** 時刻 t の、下で燃える炎の勢い：設定の値に、声の瞬間の燃え上がりと、言葉が燃える明るさを足す */
export function fireAt(movie: FlameMovie, t: number): number {
  const f = MOVIE_CONFIG.fire;
  let flare = 0;
  for (const h of movie.hits) {
    const dt = t - h.at;
    if (dt >= 0 && dt < f.flareDecay * 6) flare += Math.exp(-dt / f.flareDecay) * h.power * f.flare;
  }
  return valueAt(movie.fire, t) + flare + breakLightAt(movie, t) * 0.25;
}

/** カメラ：場面を通して、ゆっくり寄っていき（倍率）、手持ちのように、ゆるく揺れる（px） */
export function driftAt(t: number, duration: number): { x: number; y: number; scale: number } {
  const d = MOVIE_CONFIG.drift;
  const k = clamp01(t / duration);
  return { x: Math.sin(t * 0.37) * d.sway[0], y: Math.sin(t * 0.29 + 1) * d.sway[1], scale: 1 + d.zoom * k * k * (3 - 2 * k) };
}

/** 心音の時刻と強さ：heart のあいだ、間隔と強さが、はじめの値から終わりの値へ変わる（炎：速く強く。氷：遅く弱く） */
export function heartTimes(movie: MovieDef): { at: number; power: number }[] {
  const h = movie.heart;
  if (!h) return [];
  const out: { at: number; power: number }[] = [];
  for (let t = h.from; t < h.to; ) {
    const k = (t - h.from) / (h.to - h.from);
    out.push({ at: t, power: h.power[0] + (h.power[1] - h.power[0]) * k });
    t += h.every[0] + (h.every[1] - h.every[0]) * k;
  }
  return out;
}

/** 時刻 t の、心音の脈（0〜1.2）：どくん（すぐ消える）、少し遅れて、どくん */
export function pulseAt(beats: readonly { at: number; power: number }[], t: number): number {
  const h = MOVIE_CONFIG.heart;
  let v = 0;
  for (const b of beats) {
    const dt = t - b.at;
    if (dt < 0 || dt > 1) continue;
    v += b.power * (Math.exp(-dt / h.decay) + (dt >= h.dub ? 0.7 * Math.exp(-(dt - h.dub) / h.decay) : 0));
  }
  return Math.min(1.2, v);
}

/** 時刻 t の、闇が迫る深さ（0〜1）。心音の脈で、さらに少し迫る */
export function encloseAt(movie: MovieDef, beats: readonly { at: number; power: number }[], t: number): number {
  return clamp01(valueAt(movie.enclose, t) + pulseAt(beats, t) * MOVIE_CONFIG.heart.enclose);
}

/** 赤い線が1本ずつ走る時刻（取り消し線を引く瞬間から、線の間隔で、線の数だけ） */
export function slashTimes(movie: MovieDef): number[] {
  const s = MOVIE_CONFIG.slash;
  return s.pitch.map((_, k) => movie.crossedAt + MOVIE_CONFIG.strikeDelay + k * s.every);
}

/** 声のほかの、小さな揺れ：赤い線（氷はひび）が走るたびと、言葉が壊れ始める瞬間と、場面ごとの衝撃（impacts） */
export function kicksOf(movie: MovieDef): Hit[] {
  const k = MOVIE_CONFIG.kick;
  return [...slashTimes(movie).map((at) => ({ at, power: k })), { at: movie.breakAt, power: k * 1.4 }, ...movie.impacts];
}

/** 声の波：大きな声の瞬間に、下の炎から広がる輪。progress は広がり（0〜1）、alpha は濃さ */
export function ringsAt(hits: readonly Hit[], t: number): { progress: number; alpha: number }[] {
  const r = MOVIE_CONFIG.ring;
  const out: { progress: number; alpha: number }[] = [];
  for (const h of hits) {
    const k = (t - h.at) / r.life;
    if (k < 0 || k >= 1) continue;
    out.push({ progress: 1 - (1 - k) * (1 - k), alpha: 0.55 * h.power * Math.pow(1 - k, 1.5) });
  }
  return out;
}

/**
 * 時刻 t の、外の音のこもり方（通す高さの上限。Hz）。
 * こもっているあいだ（息をひそめたあと）に大きな声が響くと、その瞬間だけ開く（耳をふさいでも、声は入ってくる）
 */
export function muffleAt(movie: MovieDef, t: number): number {
  const o = MOVIE_CONFIG.muffleOpen;
  const base = valueAt(movie.muffle, t);
  const calm = movie.breath?.[0] ?? Infinity;
  let open = 0;
  for (const h of movie.hits) {
    const dt = t - h.at;
    if (h.at >= calm && dt >= 0 && dt < o.decay * 6) open = Math.max(open, Math.exp(-dt / o.decay) * h.power);
  }
  return Math.min(o.max, base * (1 + o.gain * open));
}

/** 外の音のこもり方を、1秒に rate 回、場面の長さ＋tail 秒ぶん並べる（Web Audio のフィルタに、そのまま渡す） */
export function muffleCurve(movie: MovieDef, rate: number, tail = 4): Float32Array {
  const n = Math.ceil((movie.duration + tail) * rate) + 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = muffleAt(movie, i / rate);
  return out;
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

/** 出す数：want が端数なら、その割合で1つ多く出す */
const countOf = (want: number, rand: Rand): number => Math.floor(want) + (rand() < want - Math.floor(want) ? 1 : 0);
const between = (range: readonly [number, number], rand: Rand): number => range[0] + (range[1] - range[0]) * rand();

/** 火の粉を dt 秒だけ進める（古いものを消し、勢い rate に応じて新しく出す）。新しい配列を返す */
export function stepEmbers(embers: readonly Ember[], dt: number, rate: number, rand: Rand): Ember[] {
  const c = MOVIE_CONFIG.ember;
  const alive = embers.map((e) => ({ ...e, age: e.age + dt, y: e.y + e.vy * dt })).filter((e) => e.age < e.life);
  let n = countOf(rate * dt, rand);
  while (n-- > 0 && alive.length < c.max) {
    alive.push({ x: rand(), y: -4, vy: between(c.rise, rand), phase: rand() * Math.PI * 2, age: 0, life: between(c.life, rand), size: between(c.size, rand) });
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
    life: between(b.life, rand),
    size: between(b.size, rand),
  }));
}

/** 燃えている言葉から上る火の粉：言葉の燃えている縁（x0〜x1。高さ y：画面の下から px）から、count 個 */
export function burnEmbers(edge: { x0: number; x1: number; y: number }, count: number, rand: Rand): Ember[] {
  return Array.from({ length: count }, () => ({
    x: edge.x0 + (edge.x1 - edge.x0) * rand(),
    y: edge.y,
    vy: 30 + 70 * rand(),
    phase: rand() * Math.PI * 2,
    age: 0,
    life: 0.8 + 0.9 * rand(),
    size: 1.2 + 1.6 * rand(),
  }));
}

/** 火の粉の、いまの横の位置（0〜1）と明るさ（0〜1。出てすぐ明るく、寿命に向けて消える） */
export function emberLook(e: Ember): { x: number; alpha: number } {
  const c = MOVIE_CONFIG.ember;
  const k = e.age / e.life;
  return { x: e.x + (Math.sin(e.phase + e.age * 2.4) * c.drift) / 1000, alpha: Math.min(1, k * 6) * (1 - k) };
}

/** 下で燃える炎の、光の粒（火の粉と同じ形。大きく、短い命） */
export type Flame = Ember;

/** 炎を dt 秒だけ進める。rate は1秒に出る数、heat は勢い（大きいほど高く、大きく燃え上がる）、max は上限の数 */
export function stepFlames(flames: readonly Flame[], dt: number, rate: number, heat: number, rand: Rand, max: number = MOVIE_CONFIG.fire.max): Flame[] {
  const c = MOVIE_CONFIG.fire;
  const alive = flames.map((f) => ({ ...f, age: f.age + dt, y: f.y + f.vy * dt })).filter((f) => f.age < f.life);
  const lift = 0.6 + 0.6 * Math.min(2, heat);
  let n = countOf(rate * dt, rand);
  while (n-- > 0 && alive.length < max) {
    const spread = rand() < 0.6 ? 0.75 : 1.15; // 真ん中ほど、よく燃える
    const size = between(c.size, rand) * (0.8 + 0.3 * Math.min(2, heat));
    alive.push({ x: 0.5 + (rand() - 0.5) * spread, y: -size * 0.3, vy: between(c.rise, rand) * lift, phase: rand() * Math.PI * 2, age: 0, life: between(c.life, rand), size });
  }
  return alive;
}

/** 炎の粒の見え方：縦長の舌の形で、上りながら細く小さくなり、熱い黄色から、赤へ冷めて消える（heat：0 が熱い〜1 が冷めた。幅・高さは px） */
export function flameLook(f: Flame): { x: number; width: number; height: number; alpha: number; heat: number } {
  const k = f.age / f.life;
  return {
    x: f.x + Math.sin(f.phase + f.age * 6) * 0.006,
    width: f.size * 0.75 * (1 - 0.55 * k),
    height: f.size * 1.5 * (1 - 0.4 * k),
    alpha: Math.min(1, k * 8) * Math.pow(1 - k, 1.2) * MOVIE_CONFIG.fire.alpha,
    heat: k,
  };
}

/** 煙のかたまり */
export type Puff = Ember;

/** 煙を dt 秒だけ進める（ゆっくり上り、広がって、薄れる） */
export function stepSmoke(smoke: readonly Puff[], dt: number, rate: number, rand: Rand): Puff[] {
  const c = MOVIE_CONFIG.smoke;
  const alive = smoke.map((p) => ({ ...p, age: p.age + dt, y: p.y + p.vy * dt })).filter((p) => p.age < p.life);
  let n = countOf(rate * dt, rand);
  while (n-- > 0 && alive.length < c.max) {
    alive.push({ x: 0.15 + 0.7 * rand(), y: 20 + 40 * rand(), vy: between(c.rise, rand), phase: rand() * Math.PI * 2, age: 0, life: between(c.life, rand), size: between(c.size, rand) });
  }
  return alive;
}

/** 煙の見え方：広がりながら、そっと濃くなり、そっと消える */
export function smokeLook(p: Puff): { x: number; size: number; alpha: number } {
  const c = MOVIE_CONFIG.smoke;
  const k = p.age / p.life;
  return { x: p.x + Math.sin(p.phase + p.age * 0.5) * 0.03, size: p.size * (1 + (c.grow - 1) * k), alpha: c.alpha * Math.sin(Math.PI * k) };
}

/** 灰のひとひら（y は画面の上から px。下へ落ちる） */
export interface Flake {
  x: number; // 0〜1
  y: number; // px（画面の上から）
  vy: number; // px/秒（下へ）
  phase: number;
  age: number;
  life: number;
  size: number;
}

/** 灰を dt 秒だけ進める（上から、ゆっくり舞い落ちる。画面の下 height を過ぎたら消える） */
export function stepAsh(ash: readonly Flake[], dt: number, rate: number, height: number, rand: Rand): Flake[] {
  const c = MOVIE_CONFIG.ash;
  const alive = ash.map((f) => ({ ...f, age: f.age + dt, y: f.y + f.vy * dt })).filter((f) => f.age < f.life && f.y < height + 10);
  let n = countOf(rate * dt, rand);
  while (n-- > 0 && alive.length < c.max) {
    alive.push({ x: rand(), y: -10 + rand() * height * 0.3, vy: between(c.fall, rand), phase: rand() * Math.PI * 2, age: 0, life: between(c.life, rand), size: between(c.size, rand) });
  }
  return alive;
}

/** 灰の見え方：左右に揺れ、くるくる回り、出てすぐと消える前は薄い */
export function ashLook(f: Flake): { dx: number; alpha: number; angle: number } {
  const k = f.age / f.life;
  return { dx: Math.sin(f.phase + f.age * 1.3) * MOVIE_CONFIG.ash.sway, alpha: Math.min(1, k * 5, (1 - k) * 4) * MOVIE_CONFIG.ash.alpha, angle: f.phase + f.age * 2.2 };
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

/** 場面の音（時刻 at に、kind の音を鳴らす。power は synth.ts の pitch に渡す：強さ・長さ（秒）・高さの倍率のどれかは、音ごとに決まる） */
export interface SoundCue {
  at: number;
  kind:
    // 炎
    | 'roar'
    | 'rumble'
    | 'blaze'
    | 'swell'
    | 'breath_in'
    | 'breath_out'
    | 'ring'
    | 'hush'
    | 'pad'
    | 'sizzle'
    | 'sizzle_soft'
    | 'ignite'
    | 'slash'
    // 氷
    | 'wind'
    | 'call'
    | 'frost'
    | 'creak'
    | 'crack'
    | 'shatter'
    | 'exhale'
    | 'bells'
    // どちらも
    | 'heartbeat'
    | 'chalk'
    | 'chalk_bold';
  power: number;
}

/** 外の音（こもる音）：炎の声・地鳴り・炎の音・声の前の高まり、氷の風。ほかの音（心音・息・書く音・燃える音・砕ける音・和音など）は、内側の音で、こもらない */
const WORLD_SOUNDS: ReadonlySet<SoundCue['kind']> = new Set(['roar', 'rumble', 'blaze', 'swell', 'wind']);
export const isWorldSound = (kind: SoundCue['kind']): boolean => WORLD_SOUNDS.has(kind);

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

/** 白い息が出る時刻（氷。息をひそめる場面のあいだ、決まった間隔で）。画面の息の白いもやと、吐く息の音が同じ時刻を使う */
export function mistTimes(movie: MovieDef): number[] {
  if (movie.style !== 'ice' || !movie.breath) return [];
  const [from, to] = movie.breath;
  const m = MOVIE_CONFIG.mist;
  const out: number[] = [];
  for (let t = from + m.lead; t < to; t += m.every) out.push(t);
  return out;
}

/**
 * 炎の音：
 * 外の音：炎の音（blaze）が、場面のはじめから、いまに戻るまで続く。地鳴りが息をひそめる前まで。最初の声の前に、吸い込むような高まり（swell）。声が響くたびに roar。
 * 内側の音：紙が燃えるようなチリチリ（sizzle）が、声のあいだは大きく、息をひそめるあいだは小さく、言葉が燃えるときは大きく、最後はそっと続く。
 * 息をのむ音・震えて吐く息・耳鳴り・言葉に火がつく音。最後に、静かな低い響きと和音
 */
function flameCues(movie: FlameMovie): SoundCue[] {
  const cues: SoundCue[] = [];
  const calmStart = movie.breath?.[0] ?? movie.lineAt[1] ?? movie.duration / 3;
  const firstHit = movie.hits[0]?.at ?? movie.lineAt[0]!;
  cues.push({ at: 0.15, kind: 'blaze', power: movie.echoAt + 0.6 - 0.15 });
  cues.push({ at: 0.2, kind: 'rumble', power: Math.max(2, calmStart - 0.2) });
  cues.push({ at: 0.25, kind: 'swell', power: Math.max(0.3, firstHit - 0.05 - 0.25) });
  for (const h of movie.hits) cues.push({ at: h.at, kind: 'roar', power: h.power });
  cues.push({ at: movie.lineAt[0]! - 0.6, kind: 'sizzle', power: calmStart - movie.lineAt[0]! + 0.6 });
  cues.push({ at: calmStart, kind: 'sizzle_soft', power: movie.crossedAt - calmStart });
  cues.push({ at: movie.breakAt, kind: 'ignite', power: 1 });
  cues.push({ at: movie.breakAt, kind: 'sizzle', power: movie.breakFor + MOVIE_CONFIG.sound.burnTail });
  cues.push({ at: movie.echoAt, kind: 'sizzle_soft', power: movie.duration - movie.echoAt });
  if (movie.breath) {
    const [from, to] = movie.breath;
    cues.push({ at: from + 0.05, kind: 'breath_in', power: 1 }); // 息をのむ
    cues.push({ at: to - 1.1, kind: 'breath_out', power: 1 }); // こらえきれず、震えて吐く
  }
  if (movie.ring) cues.push({ at: movie.ring[0], kind: 'ring', power: movie.ring[1] - movie.ring[0] });
  cues.push({ at: movie.echoAt, kind: 'hush', power: 1 });
  cues.push({ at: movie.echoAt, kind: 'pad', power: movie.duration - movie.echoAt + 2 });
  return cues;
}

/**
 * 氷の音：
 * 外の音：冷たい風（wind）が、場面を通して続く（音が消えていくあいだは、こもって小さくなる）。
 * 内側の音：あの子が呼ぶ声（call。こだまだけが返る）。霜が広がるきらめき（frost）。白い息（exhale）。凍りついていくガラスのきしみ（creak。ぴたりと止まる）。
 * 言葉が砕ける音と、氷の巨像が砕ける大きな音（shatter）。最後に、まばらな鐘（bells）
 */
function iceCues(movie: IceMovie): SoundCue[] {
  const cues: SoundCue[] = [];
  cues.push({ at: 0.1, kind: 'wind', power: movie.duration + 1.9 });
  for (const h of movie.hits) cues.push({ at: h.at, kind: 'call', power: h.power });
  cues.push({ at: movie.frosting[0], kind: 'frost', power: movie.frosting[1] - movie.frosting[0] });
  cues.push({ at: movie.creak[0], kind: 'creak', power: movie.creak[1] - movie.creak[0] });
  for (const at of mistTimes(movie)) cues.push({ at, kind: 'exhale', power: 1 });
  cues.push({ at: movie.breakAt, kind: 'shatter', power: 1 });
  cues.push({ at: movie.echoAt, kind: 'shatter', power: 2.2 });
  cues.push({ at: movie.echoAt + 0.6, kind: 'bells', power: movie.duration - movie.echoAt + 1.5 });
  return cues;
}

/**
 * 場面の音の予定を、時刻の順に作る（乱数は使わない）。
 * どの場面も：心音（heart）、文字を書くチョークの音、取り消し線を引く音、画面を走る線の音（炎：赤い線を切り裂く slash。氷：ひびが入る crack）。
 * そのほかは、場面の型ごと（flameCues・iceCues）。（乾いた「かかか、かこかこ」に聞こえた音は、鳴らさない）
 */
export function soundCues(movie: MovieDef, writes: readonly Write[]): SoundCue[] {
  const cues: SoundCue[] = movie.style === 'flame' ? flameCues(movie) : iceCues(movie);
  for (const b of heartTimes(movie)) cues.push({ at: b.at, kind: 'heartbeat', power: b.power });
  // 文字が書かれていくあいだ、チョークで書く音（声の行は力を込めて、強く。書いては消した言葉・塗りつぶしの帯も強く）。取り消し線は、勢いよく引く
  const times = itemTimes(writes.map((w) => w.kind), movie);
  let line = 0;
  writes.forEach((w, i) => {
    const bold = w.kind !== 'line' || movie.loud.includes(line);
    if (w.kind === 'line') line++;
    // 文字は、書かれ始めてから少し遅れて見え始めるので、音も少し遅らせ、終わりも縮める（帯は、すぐ見える）
    const lag = w.kind === 'black' ? 0 : MOVIE_CONFIG.write.soundLag;
    const trim = w.kind === 'black' ? 0 : MOVIE_CONFIG.write.soundTrim;
    cues.push({ at: times[i]! + lag, kind: bold ? 'chalk_bold' : 'chalk', power: Math.max(0.3, writeSeconds(w) - trim) });
    if (w.kind === 'crossed') {
      cues.push({ at: times[i]! + MOVIE_CONFIG.strikeDelay, kind: 'chalk_bold', power: MOVIE_CONFIG.write.strike });
      // 画面を走る線（scrawl の引っかき傷。0.22 秒ごとに1本ずつ出る）が出るたびに：炎は切り裂く音、氷はひびが入る音
      const kind = movie.style === 'ice' ? 'crack' : 'slash';
      slashTimes(movie).forEach((at, k) => cues.push({ at, kind, power: MOVIE_CONFIG.slash.pitch[k]! }));
    }
  });
  return cues.sort((a, b) => a.at - b.at);
}
