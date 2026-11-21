// 記憶の動く場面の音を、まとめて予約する（docs/memory-movie.md）。MemoryMovie.tsx と、音を書き出して確かめるときの両方が使う。
// 外の音（声・地鳴り・炎の音・声の前の高まり）は、こもらせるフィルタを通す（布団の中で、外の音がこもる。memoryMovie.ts の muffleAt）。
// 内側の音（心音・息・耳鳴り・書く音・燃える音・和音）は、そのまま出口へ。

import { synthSfx } from '../audio/synth';
import { isWorldSound, muffleCurve, soundCues, type MovieDef, type Write } from './memoryMovie';

/** こもり方を、1秒に何回の細かさでフィルタに渡すか */
const MUFFLE_RATE = 40;

/** 場面の音を、start（AudioContext の時刻）を場面の 0 秒として、すべて予約する */
export function scheduleMovieSound(ctx: AudioContext, out: AudioNode, movie: MovieDef, writes: readonly Write[], start: number): void {
  const world = ctx.createBiquadFilter();
  world.type = 'lowpass';
  world.Q.value = 0.6;
  const curve = muffleCurve(movie, MUFFLE_RATE);
  world.frequency.value = curve[0]!;
  world.frequency.setValueCurveAtTime(curve, start, (curve.length - 1) / MUFFLE_RATE);
  world.connect(out);
  for (const cue of soundCues(movie, writes)) synthSfx(ctx, isWorldSound(cue.kind) ? world : out, cue.kind, start + cue.at, cue.power);
}
