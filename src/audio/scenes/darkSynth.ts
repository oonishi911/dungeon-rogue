// 闇の王の場面の音（docs/memory-movie.md）。void 長さ（秒）・seep 強さ・glow 長さ・smear 高さの倍率・dissolve 長さ・melt 強さ・dawn 長さ
// 表現の約束（docs/story.md）：消えることを美しく描かない。小さな光の音は、鳴り始めてから最後まで鳴りやまない。

import { chordPad, hiss, noiseLoop, panTo, presence, tone, wobble } from '../synthParts';

export type DarkKind = 'void' | 'seep' | 'glow' | 'smear' | 'dissolve' | 'melt' | 'dawn';
export const DARK_KINDS: ReadonlySet<string> = new Set<DarkKind>(['void', 'seep', 'glow', 'smear', 'dissolve', 'melt', 'dawn']);

/** 深い低音：ゆっくりうなる低い音（2本を少しずらす）と、遠いごうごう。倍音を足して、スマホでも、かすかに聞こえる。len 秒 */
function voidDrone(ctx: AudioContext, out: AudioNode, at: number, len: number) {
  const env = ctx.createGain();
  env.gain.value = 0;
  env.gain.setValueAtTime(0.0001, at);
  env.gain.linearRampToValueAtTime(0.2, at + Math.min(3, len / 4));
  env.gain.setValueAtTime(0.2, at + Math.max(0.1, len - 2.5));
  env.gain.linearRampToValueAtTime(0.0001, at + len);
  env.connect(presence(ctx, out, 0.2));
  [
    [41.2, -0.3, 0.5],
    [41.7, 0.3, 0.5],
    [82.4, 0, 0.18],
  ].forEach(([f, side, gain]) => {
    const osc = ctx.createOscillator();
    osc.frequency.value = f!;
    const g = ctx.createGain();
    g.gain.value = gain!;
    osc.connect(g).connect(panTo(ctx, env, side!));
    osc.start(at);
    osc.stop(at + len + 0.05);
  });
  const far = ctx.createBiquadFilter();
  far.type = 'lowpass';
  far.frequency.value = 110;
  const farLevel = ctx.createGain();
  farLevel.gain.value = 0.35;
  wobble(ctx, farLevel.gain, at, len, 0.07, 0.12);
  noiseLoop(ctx, at, len, 2.7, 'brown').connect(far).connect(farLevel).connect(env);
}

/** 闇が染み込む：低いざわめきが、ゆっくりふくらみ（左右に広がって）、そっと引く。p は強さ */
function seep(ctx: AudioContext, out: AudioNode, at: number, p: number) {
  const len = 2.8;
  [-0.6, 0.6].forEach((side, i) => {
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(0.16 * p, at + len * 0.7);
    env.gain.linearRampToValueAtTime(0.0001, at + len);
    const band = ctx.createBiquadFilter();
    band.type = 'lowpass';
    band.frequency.setValueAtTime(420, at);
    band.frequency.exponentialRampToValueAtTime(160, at + len);
    noiseLoop(ctx, at, len, 0.6 + i * 1.8, 'pink').connect(band).connect(env).connect(panTo(ctx, out, side));
  });
  tone(ctx, out, at, { freq: 55, endFreq: 47, len, gain: 0.12 * p, attack: len * 0.6 });
}

/**
 * 小さな光の音：細く、あたたかい高い音が、ゆっくり灯り、息をするように、かすかにゆれる。少し下に、やわらかな支え。
 * 鳴り始めてから、len 秒の終わりまで、鳴りやまない（消えない）
 */
function glow(ctx: AudioContext, out: AudioNode, at: number, len: number) {
  const env = ctx.createGain();
  env.gain.value = 0;
  env.gain.setValueAtTime(0.0001, at);
  env.gain.linearRampToValueAtTime(1, at + 1.6);
  env.gain.setValueAtTime(1, at + Math.max(1.7, len - 1.5));
  env.gain.linearRampToValueAtTime(0.0001, at + len);
  const breathe = ctx.createGain();
  breathe.gain.value = 0.8;
  wobble(ctx, breathe.gain, at, len, 0.6, 0.2);
  breathe.connect(env).connect(out);
  [
    [1318.5, 0.012],
    [1975.5, 0.004],
    [659.25, 0.006],
  ].forEach(([f, gain]) => {
    const osc = ctx.createOscillator();
    osc.frequency.value = f!;
    const g = ctx.createGain();
    g.gain.value = gain!;
    osc.connect(g).connect(breathe);
    osc.start(at);
    osc.stop(at + len + 0.05);
  });
}

/** 墨のにじみ（画面を走る線）：やわらかく、低めにこすれて流れる。左右の動きは movieSound.ts（線の向き）。p は高さの倍率 */
function smear(ctx: AudioContext, out: AudioNode, when: number, p: number) {
  hiss(ctx, out, when, { type: 'bandpass', from: 1600 * p, to: 380 * p, q: 0.8, len: 0.38, gain: 0.32, attack: 0.02, color: 'pink' });
  tone(ctx, out, when, { freq: 120 * p, endFreq: 70, len: 0.3, gain: 0.08, attack: 0.02 });
}

/** 言葉が溶ける：やわらかなざわめきが、下へ流れながら消え、かすかな高い音が、ゆっくり下がる（len 秒） */
function dissolve(ctx: AudioContext, out: AudioNode, at: number, len: number) {
  hiss(ctx, out, at, { type: 'bandpass', from: 2600, to: 320, q: 0.7, len, gain: 0.2, attack: len * 0.25, color: 'pink' });
  [1760, 1318.5].forEach((f, i) => tone(ctx, panTo(ctx, out, i === 0 ? -0.3 : 0.3), at + i * 0.15, { freq: f, endFreq: f / 2, len, gain: 0.012, attack: 0.2 }));
}

/** 闇が溶ける：長いため息のようなざわめきが、こもりながら引いていき、低い音が、ゆっくりほどける */
function melt(ctx: AudioContext, out: AudioNode, when: number, p: number) {
  hiss(ctx, panTo(ctx, out, -0.4), when, { type: 'lowpass', from: 1000, to: 180, q: 0.6, len: 3.2, gain: 0.16 * p, attack: 0.5, color: 'pink' });
  hiss(ctx, panTo(ctx, out, 0.4), when, { type: 'lowpass', from: 950, to: 170, q: 0.6, len: 3.2, gain: 0.16 * p, attack: 0.55, offset: 2.1, color: 'pink' });
  tone(ctx, presence(ctx, out, 0.2), when, { freq: 55, endFreq: 41, len: 3, gain: 0.18 * p, attack: 0.6 });
}

/** あたたかい和音：低く、やわらかな長調の和音（ファ・ド・ラ・ソ）が、ゆっくり立ち上がる */
function dawn(ctx: AudioContext, out: AudioNode, at: number, len: number) {
  chordPad(ctx, out, at, len, {
    notes: [
      [87.31, 1, 0, 0],
      [130.81, 0.8, 0.2, -0.35],
      [220, 0.6, 0.6, 0.35],
      [392, 0.35, 1.6, -0.3],
      [523.25, 0.2, 2.6, 0.3],
    ],
    level: 0.045,
    attack: 3,
    release: 2.5,
    cutoff: [600, 1500],
    room: 0.35,
  });
}

export function darkSfx(ctx: AudioContext, out: AudioNode, kind: DarkKind, when: number, pitch: number) {
  switch (kind) {
    case 'void':
      return voidDrone(ctx, out, when, pitch);
    case 'seep':
      return seep(ctx, out, when, pitch);
    case 'glow':
      return glow(ctx, out, when, pitch);
    case 'smear':
      return smear(ctx, out, when, pitch);
    case 'dissolve':
      return dissolve(ctx, out, when, pitch);
    case 'melt':
      return melt(ctx, out, when, pitch);
    case 'dawn':
      return dawn(ctx, out, when, pitch);
  }
}
