// 合成の効果音（2026-11-20。docs/combat-fun-spec.md ⑥）。音のファイルを持たず、Web Audio の発振器とノイズで鳴らす短い音。
// 凍る・燃える・砕く・焼き斬り・杖の共鳴・蒸気・持ち替え・倒した、の8つ。pitch は音の高さの倍率（連続で倒すと上げていく）。
// 2026-11-21：記憶の動く場面（docs/memory-movie.md）の音を足した。roar（大きな声。pitch は強さ）・rumble（地鳴り。pitch は長さ（秒））・
// heartbeat（心音。pitch は強さ）・scratch（書きなぐる音）・strike（取り消し線を引く音）・crackle（火の粉のはぜる音）・hush（最後の、静かな低い響き）

export type SynthKind = 'freeze' | 'burn' | 'smash' | 'sear' | 'arcane' | 'steam' | 'swap' | 'kill' | 'roar' | 'rumble' | 'heartbeat' | 'scratch' | 'strike' | 'crackle' | 'hush';

let noise: AudioBuffer | null = null;
const noiseOf = (ctx: AudioContext): AudioBuffer => {
  if (!noise || noise.sampleRate !== ctx.sampleRate) {
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    // 毎回同じ音になるよう、決まった式でノイズを作る
    let x = 12345;
    for (let i = 0; i < data.length; i++) {
      x = (x * 1664525 + 1013904223) >>> 0;
      data[i] = (x / 0xffffffff) * 2 - 1;
    }
  }
  return noise;
};

/** 発振器の音：start 秒に、freq から endFreq へ動きながら、len 秒かけて消える */
function tone(ctx: AudioContext, out: AudioNode, at: number, o: { type?: OscillatorType; freq: number; endFreq?: number; len: number; gain: number; attack?: number }) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, at);
  if (o.endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.endFreq), at + o.len);
  const attack = o.attack ?? 0.005;
  env.gain.setValueAtTime(0.0001, at);
  env.gain.linearRampToValueAtTime(o.gain, at + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, at + o.len);
  osc.connect(env).connect(out);
  osc.start(at);
  osc.stop(at + o.len + 0.02);
}

/** ノイズの音：フィルターの中心を from から to へ動かしながら、len 秒かけて消える */
function hiss(ctx: AudioContext, out: AudioNode, at: number, o: { type: BiquadFilterType; from: number; to?: number; q?: number; len: number; gain: number; attack?: number; offset?: number }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseOf(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = o.type;
  filter.Q.value = o.q ?? 1;
  filter.frequency.setValueAtTime(o.from, at);
  if (o.to) filter.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), at + o.len);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.linearRampToValueAtTime(o.gain, at + (o.attack ?? 0.01));
  env.gain.exponentialRampToValueAtTime(0.0001, at + o.len);
  src.connect(filter).connect(env).connect(out);
  src.start(at, o.offset ?? 0);
  src.stop(at + o.len + 0.02);
}

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
    case 'roar': { // 大きな声：腹に響く低い衝撃と、うなる濁った音、砕ける高い雑音。pitch は強さ（1で標準）
      const p = pitch;
      tone(ctx, out, when, { freq: 95, endFreq: 28, len: 1.0, gain: 0.44 * p });
      tone(ctx, out, when, { type: 'triangle', freq: 150, endFreq: 48, len: 0.55, gain: 0.3 * p });
      tone(ctx, out, when, { type: 'sawtooth', freq: 66, endFreq: 38, len: 0.9, gain: 0.12 * p, attack: 0.03 });
      hiss(ctx, out, when, { type: 'lowpass', from: 900, to: 110, q: 0.7, len: 0.85, gain: 0.36 * p, attack: 0.02 });
      hiss(ctx, out, when, { type: 'highpass', from: 2200, len: 0.14, gain: 0.2 * p });
      break;
    }
    case 'rumble': // 地鳴り：低いノイズが、ゆっくり立ち上がって、長く続く。pitch は長さ（秒）
      hiss(ctx, out, when, { type: 'lowpass', from: 160, to: 90, q: 0.9, len: pitch, gain: 0.34, attack: Math.min(1.2, pitch / 3) });
      tone(ctx, out, when, { freq: 43, len: pitch, gain: 0.2, attack: Math.min(1.5, pitch / 2) });
      break;
    case 'heartbeat': // 心音：どくん、どくん。pitch は強さ
      tone(ctx, out, when, { freq: 72, endFreq: 44, len: 0.2, gain: 0.8 * pitch, attack: 0.012 });
      tone(ctx, out, when + 0.23, { freq: 64, endFreq: 40, len: 0.18, gain: 0.55 * pitch, attack: 0.012 });
      break;
    case 'scratch': // 書きなぐる音：紙をひっかく、短いかすれを3回
      [0, 0.13, 0.27].forEach((d, i) => hiss(ctx, out, when + d, { type: 'bandpass', from: 2600 + i * 500, to: 1100, q: 2.2, len: 0.16, gain: 0.3, attack: 0.012 }));
      break;
    case 'strike': // 取り消し線を荒く引く音：ざざっと、往復する
      [0, 0.09, 0.19, 0.3].forEach((d, i) => hiss(ctx, out, when + d, { type: 'bandpass', from: i % 2 ? 1200 : 3400, to: i % 2 ? 3400 : 1200, q: 1.6, len: 0.11, gain: 0.34, attack: 0.008 }));
      tone(ctx, out, when + 0.34, { freq: 110, endFreq: 70, len: 0.4, gain: 0.25 });
      break;
    case 'crackle': // 火の粉のはぜる音：小さなぱちぱち（毎回少しずつちがう）
      for (let i = 0; i < 5; i++) hiss(ctx, out, when + Math.random() * 0.5, { type: 'highpass', from: 2500 + Math.random() * 3000, len: 0.03, gain: 0.12 * pitch, offset: Math.random() * 0.8 });
      break;
    case 'hush': // 静かな低い響き：ゆっくり立ち上がり、長く消える
      tone(ctx, out, when, { freq: 110, len: 3.2, gain: 0.2, attack: 1.0 });
      tone(ctx, out, when, { freq: 165, len: 3.2, gain: 0.08, attack: 1.2 });
      break;
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}
