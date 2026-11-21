// 光の守護者の場面の音（docs/memory-movie.md）。airy 長さ（秒）・promise 強さ・hope 長さ（終わりで、テープが止まるように沈む）・collapse 強さ・
// flare 高さの倍率・overexpose 長さ・glare 高まる長さ（終わりの瞬間に、まぶしさ）・afterglow 長さ

import { chordPad, hiss, noiseLoop, panTo, roomOf, tone, wobble } from '../synthParts';

export type LightKind = 'airy' | 'promise' | 'hope' | 'collapse' | 'flare' | 'overexpose' | 'glare' | 'afterglow';
export const LIGHT_KINDS: ReadonlySet<string> = new Set<LightKind>(['airy', 'promise', 'hope', 'collapse', 'flare', 'overexpose', 'glare', 'afterglow']);

/** やわらかな空気：高いところの、かすかな風（左右で違う）。len 秒 */
function airy(ctx: AudioContext, out: AudioNode, at: number, len: number) {
  const env = ctx.createGain();
  env.gain.value = 0;
  env.gain.setValueAtTime(0.0001, at);
  env.gain.linearRampToValueAtTime(0.06, at + Math.min(2, len / 4));
  env.gain.setValueAtTime(0.06, at + Math.max(0.1, len - 2));
  env.gain.linearRampToValueAtTime(0.0001, at + len);
  env.connect(out);
  [-0.6, 0.6].forEach((side, i) => {
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 0.5;
    band.frequency.value = 5200;
    wobble(ctx, band.frequency, at, len, 0.09 + i * 0.05, 1500);
    noiseLoop(ctx, at, len, 0.4 + i * 2, 'pink').connect(band).connect(panTo(ctx, env, side));
  });
}

/** 鐘の1音（澄んだ音と、ずれた倍音） */
function bell(ctx: AudioContext, out: AudioNode, at: number, f: number, gain: number, len: number) {
  tone(ctx, out, at, { freq: f, len, gain, attack: 0.004 });
  tone(ctx, out, at, { freq: f * 2.01, len: len * 0.5, gain: gain * 0.35, attack: 0.003 });
  tone(ctx, out, at, { freq: f * 3.01, len: len * 0.25, gain: gain * 0.12, attack: 0.002 });
}

/** 約束の鐘：「きっと大丈夫」。あたたかい長三和音が、少しずつずれて鳴る（部屋に響く） */
function promise(ctx: AudioContext, out: AudioNode, when: number, p: number) {
  const room = ctx.createConvolver();
  room.buffer = roomOf(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.4;
  room.connect(wet).connect(out);
  [
    [523.25, -0.3],
    [659.25, 0.3],
    [783.99, 0],
  ].forEach(([f, side], i) => {
    const dest = panTo(ctx, out, side!);
    bell(ctx, dest, when + i * 0.07, f!, 0.06 * p, 2.6);
    bell(ctx, room, when + i * 0.07, f!, 0.04 * p, 2.6);
  });
}

/**
 * 希望の和音：あたたかい長調の和音と、きらめく高い音が、だんだん大きく明るくなる（len 秒）。
 * 終わりの瞬間に、テープが止まるように、すべての音の高さが沈み、こもって、消える（大丈夫では、なかった）
 */
function hope(ctx: AudioContext, out: AudioNode, at: number, len: number) {
  const end = at + len;
  const stop = 0.75; // 沈みきるまで
  const env = ctx.createGain();
  env.gain.value = 0;
  env.gain.setValueAtTime(0.0001, at);
  env.gain.linearRampToValueAtTime(0.012, at + 1.5);
  env.gain.exponentialRampToValueAtTime(0.06, end);
  env.gain.setValueAtTime(0.06, end);
  env.gain.linearRampToValueAtTime(0.0001, end + stop + 0.1);
  const soft = ctx.createBiquadFilter();
  soft.type = 'lowpass';
  soft.Q.value = 0.6;
  soft.frequency.setValueAtTime(800, at);
  soft.frequency.exponentialRampToValueAtTime(4200, end);
  soft.frequency.setValueAtTime(4200, end);
  soft.frequency.exponentialRampToValueAtTime(180, end + stop);
  soft.connect(env).connect(out);
  const room = ctx.createConvolver();
  room.buffer = roomOf(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.3;
  env.connect(room).connect(wet).connect(out);
  // [高さ, 大きさ, 左右, 波の形]
  const voices: [number, number, number, OscillatorType][] = [
    [261.63, 1, 0, 'triangle'],
    [329.63, 0.8, -0.4, 'triangle'],
    [392, 0.7, 0.4, 'triangle'],
    [587.33, 0.45, -0.25, 'triangle'],
    [783.99, 0.35, 0.3, 'sine'],
    [2093, 0.06, -0.5, 'sine'], // きらめき
    [2637, 0.05, 0.5, 'sine'],
  ];
  for (const [f, gain, side, type] of voices) {
    [-5, 5].forEach((cents) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      const freq = f * Math.pow(2, cents / 1200);
      osc.frequency.setValueAtTime(freq, at);
      osc.frequency.setValueAtTime(freq, end);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.25, end + stop); // テープが止まるように沈む
      const g = ctx.createGain();
      g.gain.value = gain;
      if (f > 2000) wobble(ctx, g.gain, at, len, 5 + cents * 0.2, gain * 0.8); // きらめきは、ふるえる
      osc.connect(g).connect(panTo(ctx, soft, side + (cents < 0 ? -0.2 : 0.2)));
      osc.start(at);
      osc.stop(end + stop + 0.15);
    });
  }
}

/** 光が崩れる：空気が抜けていくような音と、うつろな低い落ち込み、くぐもった響き */
function collapse(ctx: AudioContext, out: AudioNode, when: number, p: number) {
  hiss(ctx, out, when, { type: 'highpass', from: 6500, to: 700, q: 0.7, len: 0.4, gain: 0.18 * p, attack: 0.01, color: 'pink' });
  tone(ctx, out, when, { freq: 82, endFreq: 34, len: 0.7, gain: 0.35 * p, attack: 0.006 });
  tone(ctx, out, when + 0.02, { freq: 220, endFreq: 205, len: 1.1, gain: 0.05 * p, attack: 0.01 }); // うつろ
  tone(ctx, out, when + 0.02, { freq: 223.5, endFreq: 208, len: 1.1, gain: 0.05 * p, attack: 0.01 });
}

/** 光の筋（画面を走る線）：明るく、空気を切るように流れる。左右の動きは movieSound.ts（線の向き）。p は高さの倍率 */
function flare(ctx: AudioContext, out: AudioNode, when: number, p: number) {
  hiss(ctx, out, when, { type: 'bandpass', from: 9000 * p, to: 3000 * p, q: 2, len: 0.32, gain: 0.45, attack: 0.006 });
  tone(ctx, out, when, { freq: 2400 * p, endFreq: 1800 * p, len: 0.3, gain: 0.03, attack: 0.004 });
}

/** 言葉が白く飛ぶ：高いきらめきが、ふくらみながら上がり、終わりで、ふっと消える（len 秒） */
function overexpose(ctx: AudioContext, out: AudioNode, at: number, len: number) {
  const end = at + len;
  const env = ctx.createGain();
  env.gain.value = 0;
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(0.18, end - 0.05);
  env.gain.linearRampToValueAtTime(0.0001, end + 0.05);
  env.connect(out);
  const band = ctx.createBiquadFilter();
  band.type = 'highpass';
  band.frequency.setValueAtTime(2000, at);
  band.frequency.exponentialRampToValueAtTime(9000, end);
  noiseLoop(ctx, at, len + 0.1, 0.7).connect(band).connect(env);
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(1760, at);
  osc.frequency.exponentialRampToValueAtTime(3520, end);
  const g = ctx.createGain();
  g.gain.value = 0.15;
  osc.connect(g).connect(env);
  osc.start(at);
  osc.stop(end + 0.1);
}

/** まぶしさ：白い光が満ちていくように、ノイズが lead 秒で高まり、その瞬間に、明るい響きが長く鳴る（低い衝撃も、少し） */
function glare(ctx: AudioContext, out: AudioNode, at: number, lead: number) {
  const peak = at + lead;
  const env = ctx.createGain();
  env.gain.value = 0;
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(0.22, peak);
  env.gain.linearRampToValueAtTime(0.0001, peak + 1.6);
  env.connect(out);
  [-0.5, 0.5].forEach((side, i) => {
    const band = ctx.createBiquadFilter();
    band.type = 'highpass';
    band.frequency.setValueAtTime(1200, at);
    band.frequency.exponentialRampToValueAtTime(5000, peak);
    noiseLoop(ctx, at, lead + 1.7, 1.2 + i * 1.6, 'pink').connect(band).connect(panTo(ctx, env, side));
  });
  [2637, 3951, 5274].forEach((f, i) => tone(ctx, panTo(ctx, out, (i - 1) * 0.4), peak, { freq: f, len: 2.4 - i * 0.5, gain: 0.05 / (i + 1), attack: 0.004 }));
  tone(ctx, out, peak, { freq: 70, endFreq: 40, len: 0.6, gain: 0.25, attack: 0.004 });
}

/** 余韻の和音：ほろ苦い長七の和音が、ゆっくり立ち上がり、高い鐘が、まばらに3つ */
function afterglow(ctx: AudioContext, out: AudioNode, at: number, len: number) {
  chordPad(ctx, out, at, len, {
    notes: [
      [174.61, 0.8, 0, 0],
      [349.23, 0.7, 0, -0.35],
      [440, 0.6, 0.4, 0.35],
      [523.25, 0.5, 0.8, -0.4],
      [659.25, 0.35, 1.4, 0.4],
    ],
    level: 0.04,
    attack: 2.6,
    release: 2.5,
    cutoff: [700, 1700],
    room: 0.35,
  });
  [
    [880, 1.2, -0.4],
    [659.25, 2.6, 0.4],
    [1046.5, 4.1, 0],
  ].forEach(([f, d, side]) => bell(ctx, panTo(ctx, out, side!), at + d!, f!, 0.03, 3));
}

export function lightSfx(ctx: AudioContext, out: AudioNode, kind: LightKind, when: number, pitch: number) {
  switch (kind) {
    case 'airy':
      return airy(ctx, out, when, pitch);
    case 'promise':
      return promise(ctx, out, when, pitch);
    case 'hope':
      return hope(ctx, out, when, pitch);
    case 'collapse':
      return collapse(ctx, out, when, pitch);
    case 'flare':
      return flare(ctx, out, when, pitch);
    case 'overexpose':
      return overexpose(ctx, out, when, pitch);
    case 'glare':
      return glare(ctx, out, when, pitch);
    case 'afterglow':
      return afterglow(ctx, out, when, pitch);
  }
}
