// 記憶の動く場面の音を、まとめて予約する（docs/memory-movie.md）。MemoryMovie.tsx と、音を書き出して確かめるときの両方が使う。
// 外の音（声・地鳴り・炎の音・声の前の高まり）は、こもらせるフィルタを通す（布団の中で、外の音がこもる。memoryMovie.ts の muffleAt）。
// 内側の音（心音・息・耳鳴り・書く音・燃える音・和音）は、そのまま。
// どの音も、場面の響き（暗く広い空間）へ、音ごとに決めた量だけ送る。全体は、ゆるく圧縮して、ひとつの音にまとめる（グルー）。
// 赤い線の音は、画面を走る線の向き（左から右・右から左）に、左右を動かす。

import { sceneSpace } from '../audio/sceneSynth';
import { synthSfx } from '../audio/synth';
import { isWorldSound, muffleCurve, soundCues, type MovieDef, type SoundCue, type Write } from './memoryMovie';
import { scratches } from './scrawl';

/** こもり方を、1秒に何回の細かさでフィルタに渡すか */
const MUFFLE_RATE = 40;

/** 外の音（こもったあと）を、場面の響きへ送る量 */
const WORLD_SPACE = 0.16;

/** 内側の音を、場面の響きへ送る量（0〜1）：近い音（心音・息・書く音）は少なく、空間に広がる音（和音・赤い線・燃え上がり）は多く */
export const SPACE_SEND: Readonly<Record<SoundCue['kind'], number>> = {
  roar: WORLD_SPACE,
  rumble: WORLD_SPACE,
  blaze: WORLD_SPACE,
  swell: WORLD_SPACE,
  heartbeat: 0.04,
  breath_in: 0.12,
  breath_out: 0.12,
  ring: 0.25,
  hush: 0.35,
  pad: 0.5,
  sizzle: 0.12,
  sizzle_soft: 0.12,
  ignite: 0.3,
  chalk: 0.1,
  chalk_bold: 0.12,
  slash: 0.4,
};

/**
 * 音ごとの大きさ（dB。ミキサーのつまみ）：場面全体の中での釣り合い。2026-11-21 に、音を1つずつ書き出して、前の版と比べて決めた
 * （チョークは前より少し小さく。炎の音は前よりはっきり、ただし背景に。息はかすかに聞こえる程度）
 */
export const MIX_DB: Readonly<Record<SoundCue['kind'], number>> = {
  roar: -1.4,
  rumble: -8.2,
  blaze: -11.5,
  swell: -4,
  heartbeat: -3.1,
  breath_in: -5.6,
  breath_out: -5.6,
  ring: -2,
  hush: -3.2,
  pad: -3.2,
  sizzle: -3.2,
  sizzle_soft: -3.2,
  ignite: -3.6,
  chalk: -3.5,
  chalk_bold: -3.5,
  slash: -2.5,
};

/** 外の音は、こもるほど、少し小さくもなる（布団ごしに聞く）：通す高さの上限（Hz）から、大きさの倍率（0.3〜1）を決める */
export function worldLevel(cutoff: number): number {
  return Math.min(1, Math.max(0.3, 0.3 + (0.7 * Math.log(cutoff / 200)) / Math.log(16000 / 200)));
}

/** 赤い線の音の、左右の動き [はじめ, おわり]（-1：左〜1：右）。画面を走る赤い線（scrawl.ts の scratches）の向きに合わせる */
export function slashPans(seed: string): [number, number][] {
  return scratches(seed).map(({ points }) => {
    const dir = points[points.length - 1]![0] >= points[0]![0] ? 1 : -1;
    return [-0.7 * dir, 0.7 * dir];
  });
}

export interface MovieSoundOptions {
  seed?: string; // 記憶のシード（赤い線の向き）
  only?: ReadonlySet<SoundCue['kind']>; // この音だけ鳴らす（確かめるとき）
}

/** 場面の音を、start（AudioContext の時刻）を場面の 0 秒として、すべて予約する */
export function scheduleMovieSound(ctx: AudioContext, out: AudioNode, movie: MovieDef, writes: readonly Write[], start: number, opts: MovieSoundOptions = {}): void {
  // まとめ：全体を、ゆるく圧縮して、ひとつの音にまとめる
  const mix = ctx.createGain();
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -20;
  glue.knee.value = 8;
  glue.ratio.value = 2.2;
  glue.attack.value = 0.025;
  glue.release.value = 0.3;
  mix.connect(glue).connect(out); // 持ち上げはしない（割れ止めの手前に、ゆとりを残す）
  // 場面の響き
  const space = sceneSpace(ctx);
  space.connect(mix);
  const sendTo = (from: AudioNode, amount: number) => {
    const send = ctx.createGain();
    send.gain.value = amount;
    from.connect(send).connect(space);
  };
  // 外の音：こもらせてから、出口と響きへ
  const world = ctx.createBiquadFilter();
  world.type = 'lowpass';
  world.Q.value = 0.6;
  const curve = muffleCurve(movie, MUFFLE_RATE);
  world.frequency.value = curve[0]!;
  world.frequency.setValueCurveAtTime(curve, start, (curve.length - 1) / MUFFLE_RATE);
  const worldGain = ctx.createGain();
  const levels = Float32Array.from(curve, worldLevel);
  worldGain.gain.value = levels[0]!;
  worldGain.gain.setValueCurveAtTime(levels, start, (levels.length - 1) / MUFFLE_RATE);
  world.connect(worldGain).connect(mix);
  sendTo(worldGain, WORLD_SPACE);
  // 種類ごとの入口：大きさ（MIX_DB）をそろえ、外の音はこもらせる所へ、内側の音は出口と響き（送る量は種類ごと）へ
  const inlets = new Map<SoundCue['kind'], AudioNode>();
  const inletOf = (kind: SoundCue['kind']): AudioNode => {
    let inlet = inlets.get(kind);
    if (!inlet) {
      const fader = ctx.createGain();
      fader.gain.value = Math.pow(10, MIX_DB[kind] / 20);
      if (isWorldSound(kind)) fader.connect(world);
      else {
        fader.connect(mix);
        sendTo(fader, SPACE_SEND[kind]);
      }
      inlet = fader;
      inlets.set(kind, inlet);
    }
    return inlet;
  };
  const pans = opts.seed ? slashPans(opts.seed) : [];
  let slash = 0;
  for (const cue of soundCues(movie, writes)) {
    const k = cue.kind === 'slash' ? slash++ : -1;
    if (opts.only && !opts.only.has(cue.kind)) continue;
    let dest = inletOf(cue.kind);
    const sweep = pans[k];
    if (sweep && typeof ctx.createStereoPanner === 'function') {
      const move = ctx.createStereoPanner();
      move.pan.setValueAtTime(sweep[0], start + cue.at);
      move.pan.linearRampToValueAtTime(sweep[1], start + cue.at + 0.24);
      move.connect(dest);
      dest = move;
    }
    synthSfx(ctx, dest, cue.kind, start + cue.at, cue.power);
  }
}
