// ボス戦の音楽（2026-11-28。docs/sound-fx-polish.md）。音のファイルを持たず、Web Audio の発振器とノイズで鳴らす短いくり返し。
// 8小節（コード4つ×2小節）をくり返す：低いベースの8分音符、キックとスネア、ハイハット、コードの刺す音。テンポは速め（138）。
// 何をいつ鳴らすかは bossStep（音を出さない純粋な関数）で決め、startBossMusic が少し先まで予約していく。

import { hiss, tone } from './synthParts';

export const BOSS_TEMPO = 138;
export const STEPS_PER_BAR = 16;
export const LOOP_BARS = 8;
/** 16分音符1つの長さ（秒） */
export const STEP_SECONDS = 60 / BOSS_TEMPO / 4;

// 2小節ごとのコード（ルート、周波数 Hz）：Am → F → G → E（最後の E で張りつめて、頭の Am に戻る）
const ROOTS = [55, 43.65, 49, 41.2] as const;
// 刺す音に重ねる3和音（ルートからの半音）：短3和音・長3和音
const MINOR = [0, 3, 7] as const;
const MAJOR = [0, 4, 7] as const;
const CHORD_SHAPES = [MINOR, MAJOR, MAJOR, MAJOR] as const;

export type BossHit =
  | { kind: 'kick' }
  | { kind: 'snare' }
  | { kind: 'hat'; open: boolean }
  | { kind: 'bass'; freq: number }
  | { kind: 'stab'; freqs: number[] };

/** n 半音上の周波数 */
export const semitones = (freq: number, n: number): number => freq * 2 ** (n / 12);

/** くり返しの中の bar 小節目（0〜7）の step（0〜15）で鳴らす音 */
export function bossStep(bar: number, step: number): BossHit[] {
  const chord = Math.floor((((bar % LOOP_BARS) + LOOP_BARS) % LOOP_BARS) / 2);
  const root = ROOTS[chord]!;
  const out: BossHit[] = [];
  if (step % 8 === 0) out.push({ kind: 'kick' });
  if (step === 6 || (step === 14 && bar % 2 === 1)) out.push({ kind: 'kick' }); // 食い気味のキック
  if (step === 4 || step === 12) out.push({ kind: 'snare' });
  if (step % 2 === 0) out.push({ kind: 'hat', open: step % 4 === 2 });
  // ベース：8分音符で刻む。小節の最後だけ1オクターブ上げて、次へ押し出す
  if (step % 2 === 0) out.push({ kind: 'bass', freq: bar % 2 === 1 && step >= 12 ? root * 2 : root });
  // コードの刺す音：小節の頭と、3拍目の前（食い込み）
  if (step === 0 || step === 10) out.push({ kind: 'stab', freqs: CHORD_SHAPES[chord]!.map((n) => semitones(root * 4, n)) });
  return out;
}

function playHit(ctx: AudioContext, out: AudioNode, hit: BossHit, at: number) {
  switch (hit.kind) {
    case 'kick':
      tone(ctx, out, at, { freq: 150, endFreq: 42, len: 0.22, gain: 0.5 });
      break;
    case 'snare':
      hiss(ctx, out, at, { type: 'bandpass', from: 1800, to: 1800, q: 0.7, len: 0.16, gain: 0.28 });
      tone(ctx, out, at, { type: 'triangle', freq: 220, endFreq: 150, len: 0.1, gain: 0.2 });
      break;
    case 'hat':
      hiss(ctx, out, at, { type: 'highpass', from: 7000, len: hit.open ? 0.12 : 0.04, gain: hit.open ? 0.1 : 0.07 });
      break;
    case 'bass':
      tone(ctx, out, at, { type: 'sawtooth', freq: hit.freq, len: STEP_SECONDS * 1.9, gain: 0.2 });
      break;
    case 'stab':
      for (const f of hit.freqs) tone(ctx, out, at, { type: 'square', freq: f, len: 0.22, gain: 0.05 });
      break;
  }
}

/**
 * ボス戦の音楽を流し始める。出力先 out（環境音と同じ音量の線）につなぎ、止めるための関数を返す。
 * ブラウザのタイマーは少しずれるので、0.4秒先までの音をまとめて予約しながら進む
 */
export function startBossMusic(ctx: AudioContext, out: AudioNode): () => void {
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0, ctx.currentTime);
  bus.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.6); // 流し始めは、すっと大きくする
  bus.connect(out);
  let next = ctx.currentTime + 0.1;
  let index = 0; // 通し番号（16分音符の）
  const tick = () => {
    while (next < ctx.currentTime + 0.4) {
      const bar = Math.floor(index / STEPS_PER_BAR) % LOOP_BARS;
      for (const hit of bossStep(bar, index % STEPS_PER_BAR)) playHit(ctx, bus, hit, next);
      next += STEP_SECONDS;
      index++;
    }
  };
  tick();
  const timer = window.setInterval(tick, 100);
  return () => {
    window.clearInterval(timer);
    bus.gain.cancelScheduledValues(ctx.currentTime);
    bus.gain.setValueAtTime(bus.gain.value, ctx.currentTime);
    bus.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8); // 止めるときは、0.8秒かけて小さくする
    window.setTimeout(() => bus.disconnect(), 1000);
  };
}
