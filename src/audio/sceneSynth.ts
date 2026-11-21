// 記憶の動く場面の音（docs/memory-movie.md・docs/sounds.md）。音のファイルを持たず、Web Audio の発振器とノイズで鳴らす。
// 予約は src/ui/movieSound.ts（外の音はこもらせ、場面の響きへ送る）。pitch の意味は音ごとに違う（下の一覧）。
//
// 2026-11-21（音の質を上げる）：
// - 左右の広がり：炎・チリチリ・和音・耳鳴りは左右で違う音にし、チョークは書く位置（左から右）へ動く
// - ノイズの素材を長く（くり返しの模様が聞こえない）し、炎・息・地鳴りは自然な色のノイズ（pink・brown）にした
// - 低い音（心音・地鳴り・声の衝撃）は、倍音を足して、スマホのスピーカーでも聞こえるようにした（presence）
// - 大きな声は、口の形（母音「お」→「あ」の響き）・声のゆれ・低い唸り・息の混じりを重ね、左右の壁の跳ね返りを足した

import { grit, hiss, noiseLoop, panTo, presence, roomOf, tone, wobble } from './synthParts';

/**
 * 場面の音の種類（pitch の意味）：
 * roar 強さ・rumble 長さ（秒）・blaze 長さ・swell 長さ・heartbeat 強さ・breath_in/breath_out 強さ・ring 長さ・hush（なし）・pad 長さ・
 * sizzle/sizzle_soft 長さ・ignite 強さ・chalk/chalk_bold 長さ・slash 高さの倍率
 */
export type SceneKind =
  | 'roar'
  | 'rumble'
  | 'blaze'
  | 'swell'
  | 'heartbeat'
  | 'breath_in'
  | 'breath_out'
  | 'ring'
  | 'hush'
  | 'pad'
  | 'sizzle'
  | 'sizzle_soft'
  | 'ignite'
  | 'chalk'
  | 'chalk_bold'
  | 'slash';

/** 長い場面の音の出口に置く、割れ止め：重なった音の合計が大きくなりすぎたときだけ、押さえる */
export function sceneLimiter(ctx: AudioContext): DynamicsCompressorNode {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -4;
  limiter.knee.value = 0;
  limiter.ratio.value = 14;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  return limiter;
}

const spaces = new WeakMap<BaseAudioContext, AudioBuffer>();
/**
 * 場面の響き（記憶の中の、暗く広い空間）：約2.6秒で消える響き。はじめは明るく、時間がたつほど高い音から消える（暗くなる）。
 * 左右で違うノイズから作るので、広がって聞こえる。はじめの 25ms は無音（響きが返ってくるまでの間）
 */
function spaceOf(ctx: BaseAudioContext): AudioBuffer {
  let ir = spaces.get(ctx);
  if (!ir) {
    const sr = ctx.sampleRate;
    const total = 3.2;
    const pre = 0.025;
    const n = Math.round(sr * total);
    ir = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const data = ir.getChannelData(c);
      let x = 2024 + c * 7919;
      let y = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        x = (x * 1664525 + 1013904223) >>> 0;
        if (t < pre) continue;
        const k = (t - pre) / (total - pre);
        const w = (x / 0xffffffff) * 2 - 1;
        y += (0.85 * (1 - k) * (1 - k) + 0.04) * (w - y); // 時間がたつほど、こもる
        data[i] = y * Math.exp((-6.9 * (t - pre)) / 2.6);
      }
    }
    spaces.set(ctx, ir);
  }
  return ir;
}

/** 場面の響きを鳴らす部品（送った音に、響きだけを返す） */
export function sceneSpace(ctx: AudioContext): ConvolverNode {
  const node = ctx.createConvolver();
  node.buffer = spaceOf(ctx);
  return node;
}

/**
 * うなり声：濁った低い音（2本のずれたのこぎり波と、1オクターブ下の唸り）を歪ませ、口の形（3つの響きの山。母音「お」→「あ」→「お」）を通す。
 * 声はゆれ（2つの速さで高さがふらつく）、音量は速くふるえ（荒い声）、息のかすれが混じる
 */
function growl(ctx: AudioContext, out: AudioNode, at: number, o: { freq: number; len: number; gain: number; seed: number }) {
  const end = at + o.len;
  const env = ctx.createGain();
  env.gain.value = 0; // 最初の予定の前は、音を出さない
  env.gain.setValueAtTime(0.0001, at);
  env.gain.linearRampToValueAtTime(o.gain, at + 0.05);
  env.gain.exponentialRampToValueAtTime(0.0001, end);
  env.connect(out);
  const shake = ctx.createGain(); // 声の荒れ：音量を、速くふるわせる
  shake.gain.value = 0.6;
  wobble(ctx, shake.gain, at, o.len, 26 + o.seed * 3, 0.4);
  shake.connect(env);
  // 声のもと：歪ませて、ざらつかせる
  const voice = grit(ctx, 5);
  [1, 1.045].forEach((detune) => {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(o.freq * detune, at);
    osc.frequency.exponentialRampToValueAtTime(o.freq * detune * 0.62, end);
    wobble(ctx, osc.detune, at, o.len, 5.3 + o.seed, 22); // 声のゆれ（セント）
    wobble(ctx, osc.detune, at, o.len, 11.7 - o.seed, 11);
    osc.connect(voice);
    osc.start(at);
    osc.stop(end + 0.02);
  });
  const sub = ctx.createOscillator(); // 1オクターブ下の唸り（重さ）
  sub.frequency.setValueAtTime(o.freq * 0.5, at);
  sub.frequency.exponentialRampToValueAtTime(o.freq * 0.31, end);
  const subLevel = ctx.createGain();
  subLevel.gain.value = 0.6;
  sub.connect(subLevel).connect(voice);
  sub.start(at);
  sub.stop(end + 0.02);
  // 息のかすれ：口の形を通る、ざらついた息
  const breath = ctx.createBiquadFilter();
  breath.type = 'highpass';
  breath.frequency.value = 300;
  const breathLevel = ctx.createGain();
  breathLevel.gain.value = 0.3;
  noiseLoop(ctx, at, o.len, 0.5 + o.seed * 0.7, 'pink').connect(breath).connect(breathLevel);
  // 口の形：3つの響きの山（低い順に 強・中・弱）。「お」から「あ」へ開き、また閉じる
  const formants: [number, number, number, number, number][] = [
    // [お, あ, 終わり, Q, 大きさ]
    [450, 730, 380, 4, 2.2],
    [800, 1090, 700, 5, 1.3],
    [2600, 2440, 2300, 6, 0.55],
  ];
  for (const [o1, a1, e1, q, gain] of formants) {
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(o1, at);
    f.frequency.exponentialRampToValueAtTime(a1, at + o.len * 0.4);
    f.frequency.exponentialRampToValueAtTime(e1, end);
    const level = ctx.createGain();
    level.gain.value = gain;
    voice.connect(f);
    breathLevel.connect(f);
    f.connect(level).connect(shake);
  }
  // 胸の響き：低いところは、口の形を通さず、そのまま少し
  const chest = ctx.createBiquadFilter();
  chest.type = 'lowpass';
  chest.frequency.value = 260;
  const chestLevel = ctx.createGain();
  chestLevel.gain.value = 0.45;
  voice.connect(chest).connect(chestLevel).connect(shake);
}

/** 大きな声（家をゆらす怒鳴り声と、叩きつける衝撃）。p は強さ（1で標準） */
function roar(ctx: AudioContext, out: AudioNode, when: number, p: number) {
  // 全体をまとめる出口：音がつぶれすぎないよう圧縮し、部屋の響き（残響）と、左右の壁の跳ね返りを足す
  const bus = ctx.createGain();
  const squash = ctx.createDynamicsCompressor();
  squash.threshold.value = -14;
  squash.ratio.value = 6;
  squash.attack.value = 0.002;
  squash.release.value = 0.25;
  const level = ctx.createGain();
  level.gain.value = 0.58; // 重ねた音の合計が、割れない大きさに収まるように
  squash.connect(level).connect(out);
  bus.connect(squash);
  const room = ctx.createConvolver();
  room.buffer = roomOf(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.28;
  bus.connect(room).connect(wet).connect(squash);
  [
    [0.021, -0.85],
    [0.033, 0.85],
  ].forEach(([delay, side]) => {
    const echo = ctx.createDelay(0.1);
    echo.delayTime.value = delay!;
    const echoLevel = ctx.createGain();
    echoLevel.gain.value = 0.22;
    bus.connect(echo).connect(echoLevel).connect(panTo(ctx, squash, side!));
  });
  // 1 衝撃：低い音が落ちる。歪ませて、ざらつかせる（倍音を足して、スマホでも響く）
  const thump = ctx.createGain();
  thump.gain.value = 0.9;
  const thumpGrit = grit(ctx, 3.2);
  thumpGrit.connect(thump).connect(presence(ctx, bus, 0.35));
  tone(ctx, thumpGrit, when, { freq: 118, endFreq: 30, len: 0.95, gain: 0.55 * p, attack: 0.004 });
  tone(ctx, thumpGrit, when, { type: 'triangle', freq: 190, endFreq: 52, len: 0.45, gain: 0.4 * p, attack: 0.003 });
  // 2 叩きつける：全域の雑音がはじけ、低い方へ沈む（左右で違う雑音にして、広げる）
  hiss(ctx, panTo(ctx, bus, -0.5), when, { type: 'lowpass', from: 6500, to: 160, q: 0.6, len: 0.65, gain: 0.4 * p, attack: 0.002 });
  hiss(ctx, panTo(ctx, bus, 0.5), when, { type: 'lowpass', from: 6200, to: 170, q: 0.6, len: 0.65, gain: 0.4 * p, attack: 0.002, offset: 1.3 });
  hiss(ctx, bus, when, { type: 'highpass', from: 1400, len: 0.09, gain: 0.4 * p, attack: 0.001 });
  // 3 うなり声：少し遅れて、獣の怒鳴り声が上がる（2つの声を、少しずらして左右に）
  const freq = 74 + 14 * p;
  const len = 0.95 + 0.3 * p;
  growl(ctx, panTo(ctx, bus, -0.3), when + 0.03, { freq, len, gain: 0.26 * p, seed: 0 });
  growl(ctx, panTo(ctx, bus, 0.3), when + 0.042, { freq: freq * 1.013, len: len * 0.97, gain: 0.26 * p, seed: 1 });
}

/** 地鳴り：低いノイズ（左右で違う）が、ゆっくり立ち上がって、長く続く。len 秒 */
function rumble(ctx: AudioContext, out: AudioNode, at: number, len: number) {
  const body = presence(ctx, out, 0.3);
  [-0.5, 0.5].forEach((side, i) => {
    hiss(ctx, panTo(ctx, body, side), at, { type: 'lowpass', from: 170, to: 95, q: 0.9, len, gain: 0.3, attack: Math.min(1.2, len / 3), offset: i * 1.7, color: 'brown' });
  });
  tone(ctx, body, at, { freq: 43, len, gain: 0.2, attack: Math.min(1.5, len / 2) });
}

/** 燃え続ける炎の低い音：ごうごうと、ゆっくり揺れる。左右で揺れ方を変えて、広がりを出す。len 秒（はじめはゆっくり立ち上がり、終わりはそっと消える） */
function blaze(ctx: AudioContext, out: AudioNode, at: number, len: number) {
  const env = ctx.createGain();
  env.gain.value = 0; // 最初の予定の前は、音を出さない
  env.gain.setValueAtTime(0.0001, at);
  env.gain.linearRampToValueAtTime(0.17, at + Math.min(1.2, len / 4));
  env.gain.setValueAtTime(0.17, at + Math.max(0.1, len - 1.2));
  env.gain.linearRampToValueAtTime(0.0001, at + len);
  env.connect(out);
  const sides: [number, number, number, number][] = [
    // [左右, うねりの速さ1, うねりの速さ2, 素材の位置]
    [-0.6, 0.23, 0.71, 0],
    [0.6, 0.29, 0.61, 2.1],
  ];
  for (const [side, r1, r2, offset] of sides) {
    const body = ctx.createGain(); // ゆっくり揺れる（炎のうねり）
    body.gain.value = 0.62;
    wobble(ctx, body.gain, at, len, r1, 0.2);
    wobble(ctx, body.gain, at, len, r2, 0.11);
    body.connect(panTo(ctx, env, side));
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 420;
    low.Q.value = 0.7;
    noiseLoop(ctx, at, len, offset, 'pink').connect(low).connect(body);
    const mid = ctx.createBiquadFilter(); // 炎の、かすれた息
    mid.type = 'bandpass';
    mid.frequency.value = 900;
    mid.Q.value = 0.9;
    const midLevel = ctx.createGain();
    midLevel.gain.value = 0.3;
    wobble(ctx, mid.frequency, at, len, r1 * 1.6, 260);
    noiseLoop(ctx, at, len, offset + 0.9, 'pink').connect(mid).connect(midLevel).connect(body);
  }
  const deep = ctx.createBiquadFilter(); // 真ん中の、深いごうごう
  deep.type = 'lowpass';
  deep.frequency.value = 150;
  const deepLevel = ctx.createGain();
  deepLevel.gain.value = 0.35;
  noiseLoop(ctx, at, len, 3.1, 'brown').connect(deep).connect(deepLevel).connect(env);
}

/** 声の前の、吸い込むような高まり：ノイズの帯域が上がりながら、だんだん大きくなり、声の直前で途切れる（len 秒） */
function swell(ctx: AudioContext, out: AudioNode, at: number, len: number) {
  const end = at + len;
  const env = ctx.createGain();
  env.gain.value = 0; // 最初の予定の前は、音を出さない
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(0.3, end);
  env.gain.setValueAtTime(0.3, end);
  env.gain.linearRampToValueAtTime(0.0001, end + 0.03);
  env.connect(out);
  [-0.4, 0.4].forEach((side, i) => {
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.2;
    band.frequency.setValueAtTime(180 * (1 + i * 0.08), at);
    band.frequency.exponentialRampToValueAtTime(2400 * (1 - i * 0.06), end);
    const level = ctx.createGain();
    level.gain.value = 0.72;
    noiseLoop(ctx, at, len + 0.05, 0.2 + i * 1.9, 'pink').connect(band).connect(level).connect(panTo(ctx, env, side));
  });
  const low = ctx.createOscillator(); // 下で、低い音も上がっていく
  low.frequency.setValueAtTime(36, at);
  low.frequency.exponentialRampToValueAtTime(64, end);
  const lowLevel = ctx.createGain();
  lowLevel.gain.value = 0.7;
  low.connect(lowLevel).connect(presence(ctx, env, 0.25));
  low.start(at);
  low.stop(end + 0.05);
}

/** 心音：どくん（低い音の沈みと、体の中のこもった響き）、少し遅れて、どくん。倍音を足して、スマホでも聞こえる。level は強さ */
function heartbeat(ctx: AudioContext, out: AudioNode, at: number, level: number) {
  const body = presence(ctx, out, 0.55);
  tone(ctx, body, at, { freq: 70, endFreq: 42, len: 0.22, gain: 0.72 * level, attack: 0.01 });
  hiss(ctx, body, at, { type: 'lowpass', from: 240, to: 90, q: 0.8, len: 0.13, gain: 0.35 * level, attack: 0.006, color: 'brown' });
  tone(ctx, body, at + 0.23, { freq: 62, endFreq: 40, len: 0.19, gain: 0.5 * level, attack: 0.01 });
  hiss(ctx, body, at + 0.23, { type: 'lowpass', from: 210, to: 80, q: 0.8, len: 0.11, gain: 0.24 * level, attack: 0.006, offset: 0.6, color: 'brown' });
}

/** 息をのむ：短く、はっと吸い込む（息の響きの山を2つと、空気のかすれ）。level は強さ */
function breathIn(ctx: AudioContext, out: AudioNode, at: number, level: number) {
  hiss(ctx, out, at, { type: 'bandpass', from: 1400, to: 2300, q: 1.6, len: 0.42, gain: 0.16 * level, attack: 0.06, offset: 0.1, color: 'pink' });
  hiss(ctx, out, at, { type: 'bandpass', from: 3300, to: 3800, q: 2, len: 0.38, gain: 0.07 * level, attack: 0.07, offset: 0.9 });
  hiss(ctx, out, at, { type: 'lowpass', from: 700, q: 0.5, len: 0.36, gain: 0.07 * level, attack: 0.05, offset: 0.5, color: 'pink' });
}

/** 震えて吐く息：息の響きの山が下がりながら、不規則に震える（level は強さ） */
function breathOut(ctx: AudioContext, out: AudioNode, at: number, level: number) {
  const len = 1.35;
  const tremble = ctx.createGain();
  tremble.gain.value = 0.6;
  wobble(ctx, tremble.gain, at, len, 7.5, 0.32);
  wobble(ctx, tremble.gain, at, len, 4.1, 0.14);
  tremble.connect(out);
  hiss(ctx, tremble, at, { type: 'bandpass', from: 1100, to: 650, q: 1.2, len, gain: 0.18 * level, attack: 0.18, offset: 0.3, color: 'pink' });
  hiss(ctx, tremble, at, { type: 'bandpass', from: 2300, to: 1700, q: 2, len: len * 0.9, gain: 0.07 * level, attack: 0.2, offset: 1.1 });
  hiss(ctx, tremble, at, { type: 'lowpass', from: 600, to: 300, q: 0.5, len: len * 0.9, gain: 0.08 * level, attack: 0.2, offset: 0.6, color: 'pink' });
}

/** 耳鳴り：高く細い音が、ゆっくり大きくなり、ゆっくり消える。左右の耳に少しずれた音を入れて、頭の中でかすかにうなる。len 秒 */
function tinnitus(ctx: AudioContext, out: AudioNode, at: number, len: number) {
  const env = ctx.createGain();
  env.gain.value = 0; // 最初の予定の前は、音を出さない
  env.gain.setValueAtTime(0.0001, at);
  env.gain.linearRampToValueAtTime(0.022, at + len * 0.55);
  env.gain.linearRampToValueAtTime(0.0001, at + len);
  env.connect(out);
  [
    [3150, -0.9],
    [3163, 0.9],
  ].forEach(([f, side]) => {
    const osc = ctx.createOscillator();
    osc.frequency.value = f!;
    osc.connect(panTo(ctx, env, side!));
    osc.start(at);
    osc.stop(at + len + 0.05);
  });
}

/** 最後の、静かな和音：やわらかい音を重ね（音ごとに左右へ散らし、2本ずつ少しずらして広げる）、ゆっくり立ち上がり、部屋に響かせて、len 秒かけて消える。少し遅れて、高い音がひとつ灯る */
function pad(ctx: AudioContext, out: AudioNode, at: number, len: number) {
  const env = ctx.createGain();
  env.gain.value = 0; // 最初の予定の前は、音を出さない
  env.gain.setValueAtTime(0.0001, at);
  env.gain.linearRampToValueAtTime(0.042, at + 2.8);
  env.gain.setValueAtTime(0.042, at + Math.max(3, len - 2.5));
  env.gain.linearRampToValueAtTime(0.0001, at + len);
  const soft = ctx.createBiquadFilter(); // はじめはこもって、だんだん開き、ゆっくり息をする
  soft.type = 'lowpass';
  soft.Q.value = 0.5;
  soft.frequency.setValueAtTime(600, at);
  soft.frequency.linearRampToValueAtTime(1500, at + 4);
  wobble(ctx, soft.frequency, at, len, 0.11, 220);
  soft.connect(env).connect(out);
  const room = ctx.createConvolver();
  room.buffer = roomOf(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  env.connect(room).connect(wet).connect(out);
  // ラ・ミ・ド・ミ（さびしい和音）と、遅れて灯る高いシ。[高さ, 大きさ, 遅れ, 左右]
  const voices: [number, number, number, number][] = [
    [110, 1, 0, 0],
    [164.81, 0.8, 0, -0.35],
    [261.63, 0.6, 0.4, 0.4],
    [329.63, 0.45, 0.8, -0.5],
    [493.88, 0.28, 2.6, 0.3],
  ];
  for (const [freq, gain, delay, side] of voices) {
    const v = ctx.createGain();
    v.gain.value = 0; // 最初の予定の前は、音を出さない
    v.gain.setValueAtTime(0.0001, at + delay);
    v.gain.linearRampToValueAtTime(gain, at + delay + 1.8);
    v.connect(soft);
    [-5, 5].forEach((cents) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq * Math.pow(2, cents / 1200);
      osc.connect(panTo(ctx, v, side + (cents < 0 ? -0.3 : 0.3)));
      osc.start(at + delay);
      osc.stop(at + len + 0.05);
    });
  }
}

/**
 * 紙が燃えるような、チリチリという音：ごく短い高い雑音の粒を、不規則に、まとまって並べる（ときどき静まり、ときどき密になる）。
 * 粒は、左右の5か所に散らす。下に、細かい火のかすれた息を敷く（左右で違う）。len 秒続き、level（1が標準）で大きさが変わる
 */
function sizzle(ctx: AudioContext, out: AudioNode, at: number, len: number, level: number) {
  [-0.6, 0.6].forEach((side, i) => {
    hiss(ctx, panTo(ctx, out, side), at, { type: 'highpass', from: 5200, q: 0.5, len, gain: 0.05 * level, attack: Math.min(0.6, len / 4), offset: Math.random() * 0.5 + i * 2 });
  });
  const spots = [-0.8, -0.4, 0, 0.4, 0.8].map((side) => panTo(ctx, out, side));
  let t = 0;
  let density = 0.5; // 粒の密さ（0〜1）。ゆっくり揺らす
  while (t < len) {
    density = Math.min(1, Math.max(0.1, density + (Math.random() - 0.5) * 0.5));
    const step = 0.006 + (1 - density) * 0.05 * Math.random() * 2; // 密なときは、数msごと
    t += step;
    if (t >= len) break;
    const fade = Math.min(1, t / 0.3, (len - t) / 0.4); // はじめとおわりは、そっと
    hiss(ctx, spots[Math.floor(Math.random() * spots.length)]!, at + t, {
      type: 'bandpass',
      from: 3200 + Math.random() * 6000,
      q: 1.2 + Math.random() * 2,
      len: 0.006 + Math.random() * 0.02,
      gain: (0.12 + Math.random() * 0.28) * level * fade,
      attack: 0.0008,
      offset: Math.random() * 3.5,
    });
  }
}

/**
 * 黒板にチョークで書く音：粉っぽい摩擦の「シャッ、シャッ」。1画ごとに、帯域のノイズがすっと立ち上がって、ゆるやかに消える。
 * 画は少し重ねて、途切れない摩擦にする（短い粒を並べると、かたかたした音になるので、粒は作らない）。
 * 下に、細かい粉の息と、黒板の板が鳴る低めのこもりを敷く。書く位置にあわせて、左から右へ動く。len 秒続き、level（1が標準）で強さが変わる
 */
function chalk(ctx: AudioContext, out: AudioNode, at: number, len: number, level: number) {
  let dest = out;
  if (typeof ctx.createStereoPanner === 'function') {
    const move = ctx.createStereoPanner();
    move.pan.setValueAtTime(-0.3, at);
    move.pan.linearRampToValueAtTime(0.3, at + len);
    move.connect(out);
    dest = move;
  }
  hiss(ctx, dest, at, { type: 'highpass', from: 5200, q: 0.5, len, gain: 0.05 * level, attack: Math.min(0.08, len / 3), offset: Math.random() * 0.5 });
  hiss(ctx, dest, at, { type: 'bandpass', from: 1100, q: 0.7, len, gain: 0.06 * level, attack: Math.min(0.1, len / 3), offset: Math.random() * 0.5 });
  let t = 0;
  while (t < len) {
    const dur = Math.min(len - t + 0.04, 0.14 + Math.random() * 0.2); // 1画の長さ
    const up = Math.random() < 0.5; // 画の途中で、音の高さが上がるか下がるか
    hiss(ctx, dest, at + t, {
      type: 'bandpass',
      from: up ? 2200 + Math.random() * 600 : 3800 + Math.random() * 700,
      to: up ? 3900 + Math.random() * 700 : 2300 + Math.random() * 500,
      q: 0.5 + Math.random() * 0.5,
      len: dur,
      gain: (0.24 + Math.random() * 0.1) * level,
      attack: Math.min(0.045, dur * 0.4),
      offset: Math.random() * 3.5,
    });
    t += dur * 0.78; // 次の画が、前の画の終わりに重なる
  }
}

/** 言葉に火がつく：ぼっと燃え上がり（左右で違う風）、燃え尽きるまで、ごうっと燃える。p は強さ */
function ignite(ctx: AudioContext, out: AudioNode, when: number, p: number) {
  hiss(ctx, panTo(ctx, out, -0.45), when, { type: 'lowpass', from: 250, to: 2800, q: 0.7, len: 0.95, gain: 0.25 * p, attack: 0.07, color: 'pink' });
  hiss(ctx, panTo(ctx, out, 0.45), when, { type: 'lowpass', from: 270, to: 2600, q: 0.7, len: 0.95, gain: 0.25 * p, attack: 0.08, offset: 2.2, color: 'pink' });
  hiss(ctx, out, when, { type: 'highpass', from: 2000, q: 0.5, len: 0.5, gain: 0.07 * p, attack: 0.1, offset: 0.4 });
  hiss(ctx, out, when, { type: 'bandpass', from: 700, to: 1300, q: 0.7, len: 1.6, gain: 0.13 * p, attack: 0.3, offset: 0.2, color: 'pink' });
  tone(ctx, presence(ctx, out, 0.3), when, { freq: 58, endFreq: 96, len: 0.75, gain: 0.3 * p, attack: 0.04 });
}

/** 場面の音を1つ鳴らす。when は鳴らし始める時刻（AudioContext の時間） */
export function sceneSfx(ctx: AudioContext, out: AudioNode, kind: SceneKind, when: number, pitch = 1) {
  switch (kind) {
    case 'roar':
      roar(ctx, out, when, pitch);
      break;
    case 'rumble':
      rumble(ctx, out, when, pitch);
      break;
    case 'blaze':
      blaze(ctx, out, when, pitch);
      break;
    case 'swell': // 終わりの瞬間に、声が響く
      swell(ctx, out, when, pitch);
      break;
    case 'heartbeat':
      heartbeat(ctx, out, when, pitch);
      break;
    case 'breath_in':
      breathIn(ctx, out, when, pitch);
      break;
    case 'breath_out':
      breathOut(ctx, out, when, pitch);
      break;
    case 'ring':
      tinnitus(ctx, out, when, pitch);
      break;
    case 'hush': // 静かな低い響き：ゆっくり立ち上がり、長く消える（和音 pad と重なるので、控えめに）
      tone(ctx, out, when, { freq: 110, len: 3.2, gain: 0.09, attack: 1.0 });
      tone(ctx, out, when, { freq: 165, len: 3.2, gain: 0.04, attack: 1.2 });
      break;
    case 'pad':
      pad(ctx, out, when, pitch);
      break;
    case 'sizzle':
      sizzle(ctx, out, when, pitch, 1);
      break;
    case 'sizzle_soft': // 同じ音を、小さく
      sizzle(ctx, out, when, pitch, 0.5);
      break;
    case 'ignite':
      ignite(ctx, out, when, pitch);
      break;
    case 'chalk':
      chalk(ctx, out, when, pitch, 1);
      break;
    case 'chalk_bold': // 力を込めて、強く
      chalk(ctx, out, when, pitch, 1.3);
      break;
    case 'slash': { // 赤い線が走る音：鋭く切り裂く「シュバッ」。高い雑音が、すっと低い方へ流れる（短い粒を並べず、1本の流れにする）。pitch は高さの倍率。左右の動きは movieSound.ts（線の向き）
      const p = pitch;
      hiss(ctx, out, when, { type: 'bandpass', from: 7600 * p, to: 1300 * p, q: 1.5, len: 0.22, gain: 0.7, attack: 0.004 });
      hiss(ctx, out, when, { type: 'highpass', from: 3200 * p, to: 1800 * p, len: 0.07, gain: 0.3, attack: 0.002 });
      tone(ctx, out, when, { freq: 260 * p, endFreq: 80, len: 0.26, gain: 0.26, attack: 0.006 }); // 空気を切る低い唸り
      break;
    }
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

