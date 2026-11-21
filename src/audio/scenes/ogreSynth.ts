// 鬼の首領の場面の音（docs/memory-movie.md）。drum 強さ・press 長さ（秒）・crush 強さ・kneel 強さ・resolve 長さ（秒）

import { chordPad, grit, hiss, noiseLoop, presence, roomOf, tone, wobble } from '../synthParts';

export type OgreKind = 'drum' | 'press' | 'crush' | 'kneel' | 'resolve';
export const OGRE_KINDS: ReadonlySet<string> = new Set<OgreKind>(['drum', 'press', 'crush', 'kneel', 'resolve']);

/** 責める打撃：大きな太鼓のような、重く沈む胴の音と、皮をたたく音と、低いどよめき。部屋に響かせる（倍音を足して、スマホでも響く）。p は強さ */
function drum(ctx: AudioContext, out: AudioNode, when: number, p: number) {
  const bus = ctx.createGain();
  const squash = ctx.createDynamicsCompressor();
  squash.threshold.value = -16;
  squash.ratio.value = 5;
  squash.attack.value = 0.003;
  squash.release.value = 0.2;
  const level = ctx.createGain();
  level.gain.value = 0.6;
  bus.connect(squash).connect(level).connect(out);
  const room = ctx.createConvolver();
  room.buffer = roomOf(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.3;
  bus.connect(room).connect(wet).connect(squash);
  const body = presence(ctx, bus, 0.45);
  tone(ctx, body, when, { freq: 96, endFreq: 42, len: 0.55, gain: 0.75 * p, attack: 0.003 });
  tone(ctx, body, when, { type: 'triangle', freq: 150, endFreq: 62, len: 0.26, gain: 0.32 * p, attack: 0.002 });
  hiss(ctx, bus, when, { type: 'bandpass', from: 950, to: 500, q: 1, len: 0.07, gain: 0.38 * p, attack: 0.001 }); // 皮をたたく
  hiss(ctx, body, when, { type: 'lowpass', from: 220, to: 90, q: 0.7, len: 0.3, gain: 0.4 * p, attack: 0.002, color: 'brown' });
}

/** 押しつぶす圧：低い唸りが、だんだん重く、ざらつきながら強まる（len 秒。終わりで、すっと消える） */
function press(ctx: AudioContext, out: AudioNode, at: number, len: number) {
  const end = at + len;
  const env = ctx.createGain();
  env.gain.value = 0;
  env.gain.setValueAtTime(0.0001, at);
  env.gain.linearRampToValueAtTime(0.16, end - 0.05);
  env.gain.linearRampToValueAtTime(0.0001, end + 0.08);
  const dark = ctx.createBiquadFilter();
  dark.type = 'lowpass';
  dark.frequency.setValueAtTime(180, at);
  dark.frequency.exponentialRampToValueAtTime(650, end);
  const rough = grit(ctx, 2.5);
  rough.connect(dark).connect(env).connect(presence(ctx, out, 0.25));
  const wobbleLevel = ctx.createGain();
  wobbleLevel.gain.value = 0.8;
  wobble(ctx, wobbleLevel.gain, at, len, 0.6, 0.2);
  wobbleLevel.connect(rough);
  [41.2, 82.4, 61.7].forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = i === 1 ? 'sawtooth' : 'sine';
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = i === 1 ? 0.25 : 0.6;
    osc.connect(g).connect(wobbleLevel);
    osc.start(at);
    osc.stop(end + 0.1);
  });
  noiseLoop(ctx, at, len + 0.1, 1.1, 'brown').connect(wobbleLevel);
}

/** 言葉が押しつぶされる：重くきしみながら、低く沈む（鈍い音が、つぶれる） */
function crush(ctx: AudioContext, out: AudioNode, when: number, p: number) {
  const g = grit(ctx, 3.5);
  g.connect(presence(ctx, out, 0.3));
  tone(ctx, g, when, { freq: 72, endFreq: 34, len: 0.6, gain: 0.45 * p, attack: 0.004 });
  tone(ctx, g, when, { type: 'sawtooth', freq: 190, endFreq: 58, len: 0.42, gain: 0.12 * p, attack: 0.01 }); // きしみ
  hiss(ctx, out, when, { type: 'lowpass', from: 1300, to: 120, q: 0.8, len: 0.5, gain: 0.35 * p, attack: 0.003, color: 'pink' });
}

/** 膝をつく：いちばん重い打撃と、長く沈む低い響きと、舞い上がるほこりのかすれ */
function kneel(ctx: AudioContext, out: AudioNode, when: number, p: number) {
  drum(ctx, out, when, 1.5 * p);
  const body = presence(ctx, out, 0.35);
  tone(ctx, body, when, { freq: 56, endFreq: 27, len: 2.3, gain: 0.5 * p, attack: 0.004 });
  hiss(ctx, body, when, { type: 'lowpass', from: 260, to: 70, q: 0.7, len: 2.6, gain: 0.35 * p, attack: 0.004, color: 'brown' });
  hiss(ctx, out, when + 0.05, { type: 'highpass', from: 3000, len: 1.6, gain: 0.05 * p, attack: 0.15, offset: 2.2 }); // ほこり
}

/** 気づき：低く静かな短調の和音が立ち上がり、少し遅れて、開いた響き（ラ・ミ）が重なる */
function resolve(ctx: AudioContext, out: AudioNode, at: number, len: number) {
  chordPad(ctx, out, at, len, {
    notes: [
      [73.42, 1, 0, 0],
      [110, 0.8, 0, -0.35],
      [146.83, 0.6, 0.3, 0.35],
      [174.61, 0.45, 0.6, -0.45],
      [220, 0.4, 2.4, 0.4],
      [329.63, 0.25, 3.0, -0.2],
    ],
    level: 0.05,
    attack: 2.4,
    release: 2.5,
    cutoff: [500, 1100],
    room: 0.35,
  });
}

export function ogreSfx(ctx: AudioContext, out: AudioNode, kind: OgreKind, when: number, pitch: number) {
  switch (kind) {
    case 'drum':
      return drum(ctx, out, when, pitch);
    case 'press':
      return press(ctx, out, when, pitch);
    case 'crush':
      return crush(ctx, out, when, pitch);
    case 'kneel':
      return kneel(ctx, out, when, pitch);
    case 'resolve':
      return resolve(ctx, out, when, pitch);
  }
}
