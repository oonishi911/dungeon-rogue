// 合成の効果音（2026-11-20。docs/combat-fun-spec.md ⑥）。音のファイルを持たず、Web Audio の発振器とノイズで鳴らす短い音。
// 凍る・燃える・砕く・焼き斬り・杖の共鳴・蒸気・持ち替え・倒した、の8つ。pitch は音の高さの倍率（連続で倒すと上げていく）。
// 記憶の動く場面の音（大きな声・炎・心音・チョーク・和音など）は sceneSynth.ts。部品（ノイズ・発振器・歪み・響き）は synthParts.ts。

import { sceneSfx, type SceneKind } from './sceneSynth';
import { hiss, tone } from './synthParts';

export { sceneLimiter } from './sceneSynth';

export type SynthKind = 'freeze' | 'burn' | 'smash' | 'sear' | 'arcane' | 'steam' | 'swap' | 'kill' | 'stairs' | 'clear' | 'defeat' | SceneKind;

/** 効果音を1つ鳴らす。when は鳴らし始める時刻（AudioContext の時間） */
export function synthSfx(ctx: AudioContext, out: AudioNode, kind: SynthKind, when: number, pitch = 1) {
  switch (kind) {
    case 'freeze': // きらきらした氷の音：高い音が3つ、少しずつずれて鳴り、息のようなノイズが重なる
      [1800, 2400, 3200].forEach((f, i) => tone(ctx, out, when + i * 0.045, { freq: f * pitch, endFreq: f * pitch * 0.96, len: 0.38, gain: 0.16 }));
      hiss(ctx, out, when, { type: 'highpass', from: 5000, len: 0.18, gain: 0.12 });
      break;
    case 'burn': // 火がつく音：ごうっと立ち上がる風のノイズと、ぱちぱちとはぜる音
      hiss(ctx, out, when, { type: 'bandpass', from: 500, to: 1900, q: 0.8, len: 0.55, gain: 0.3, attack: 0.08 });
      for (let i = 0; i < 6; i++) hiss(ctx, out, when + 0.06 + Math.random() * 0.4, { type: 'highpass', from: 2500 + Math.random() * 2500, len: 0.03, gain: 0.18, offset: Math.random() * 0.8 });
      break;
    case 'smash': // 砕く音：重い一撃（低い音が落ちる）と、ガラスが割れるような高い音
      tone(ctx, out, when, { type: 'triangle', freq: 170 * pitch, endFreq: 45, len: 0.28, gain: 0.5 });
      hiss(ctx, out, when, { type: 'highpass', from: 1500, len: 0.22, gain: 0.35 });
      [2600, 3500, 4300].forEach((f, i) => tone(ctx, out, when + 0.02 + i * 0.03, { freq: f, endFreq: f * 0.9, len: 0.16, gain: 0.12 }));
      break;
    case 'sear': // 焼き斬り：鋭く走る音のあと、炎がはぜる
      hiss(ctx, out, when, { type: 'bandpass', from: 4200, to: 900, q: 1.4, len: 0.2, gain: 0.34, attack: 0.005 });
      for (let i = 0; i < 4; i++) hiss(ctx, out, when + 0.08 + Math.random() * 0.2, { type: 'highpass', from: 3000, len: 0.03, gain: 0.16, offset: Math.random() * 0.8 });
      break;
    case 'arcane': // 杖の共鳴：澄んだ和音が、すっと響く
      [523.25, 659.25, 783.99].forEach((f, i) => tone(ctx, out, when + i * 0.03, { freq: f * pitch, len: 0.5, gain: 0.14, attack: 0.02 }));
      break;
    case 'steam': // 蒸気：しゅうっと息のように抜ける
      hiss(ctx, out, when, { type: 'highpass', from: 3500, to: 7000, len: 0.5, gain: 0.2, attack: 0.05 });
      break;
    case 'swap': // 持ち替え：金属がこすれて、かちりと鳴る
      hiss(ctx, out, when, { type: 'bandpass', from: 2000, to: 5200, q: 3, len: 0.09, gain: 0.2 });
      tone(ctx, out, when + 0.07, { type: 'triangle', freq: 880, endFreq: 1100, len: 0.07, gain: 0.2 });
      tone(ctx, out, when + 0.1, { type: 'triangle', freq: 1320, len: 0.1, gain: 0.12 });
      break;
    case 'kill': // 倒した音：ぽんと弾ける。pitch が上がると高く鳴る（連続で倒すほど上がる）
      tone(ctx, out, when, { freq: 520 * pitch, endFreq: 780 * pitch, len: 0.16, gain: 0.3 });
      tone(ctx, out, when, { type: 'triangle', freq: 1040 * pitch, len: 0.1, gain: 0.14 });
      break;
    case 'stairs': // 階段を降りる音：石を踏む低い音が、一段ごとに下がり、最後に遠くへ響く
      [0, 0.09, 0.18].forEach((d, i) => {
        tone(ctx, out, when + d, { type: 'triangle', freq: 180 - i * 22, endFreq: 70, len: 0.14, gain: 0.3 });
        hiss(ctx, out, when + d, { type: 'lowpass', from: 1400, len: 0.06, gain: 0.12 });
      });
      tone(ctx, out, when + 0.3, { freq: 110, endFreq: 82, len: 0.7, gain: 0.12, attack: 0.1 });
      break;
    case 'clear': // 踏破：上がっていく和音（ド・ミ・ソ・高いド）に、きらめき
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ctx, out, when + i * 0.11, { freq: f, len: 0.9 - i * 0.05, gain: 0.16, attack: 0.02 }));
      hiss(ctx, out, when + 0.4, { type: 'highpass', from: 6000, len: 0.6, gain: 0.08, attack: 0.1 });
      break;
    case 'defeat': // 力尽きた：重い一撃のあと、音が沈んでいく
      tone(ctx, out, when, { type: 'triangle', freq: 120, endFreq: 38, len: 0.5, gain: 0.5 });
      [440, 392, 349.23, 293.66].forEach((f, i) => tone(ctx, out, when + 0.15 + i * 0.28, { type: 'triangle', freq: f, endFreq: f * 0.97, len: 0.7, gain: 0.12, attack: 0.03 }));
      break;
    default: // 記憶の動く場面の音
      sceneSfx(ctx, out, kind, when, pitch);
  }
}
