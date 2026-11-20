// 合成の効果音（2026-11-20。docs/combat-fun-spec.md ⑥）。音のファイルを持たず、Web Audio の発振器とノイズで鳴らす短い音。
// 凍る・燃える・砕く・焼き斬り・杖の共鳴・蒸気・持ち替え・倒した、の8つ。pitch は音の高さの倍率（連続で倒すと上げていく）。
// 2026-11-21：記憶の動く場面（docs/memory-movie.md）の音を足した。roar（大きな声。pitch は強さ）・rumble（地鳴り。pitch は長さ（秒））・
// heartbeat（心音。pitch は強さ）・hush（最後の、静かな低い響き）・
// sizzle・sizzle_soft（紙が燃えるような、細かいチリチリという音。pitch は長さ（秒）。soft は小さめ）

export type SynthKind = 'freeze' | 'burn' | 'smash' | 'sear' | 'arcane' | 'steam' | 'swap' | 'kill' | 'roar' | 'rumble' | 'heartbeat' | 'hush' | 'sizzle' | 'sizzle_soft';

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

/** 音をつぶして荒くする（歪み）：drive が大きいほど、ざらつく */
function grit(ctx: AudioContext, drive: number): WaveShaperNode {
  const shaper = ctx.createWaveShaper();
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * drive);
  }
  shaper.curve = curve;
  shaper.oversample = '2x';
  return shaper;
}

const rooms = new WeakMap<AudioContext, AudioBuffer>();
/** 大きな部屋の響き（減っていくノイズ。毎回同じ） */
function roomOf(ctx: AudioContext): AudioBuffer {
  let room = rooms.get(ctx);
  if (!room) {
    const n = Math.round(ctx.sampleRate * 1.7);
    room = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = room.getChannelData(c);
      let x = 777 + c * 991;
      for (let i = 0; i < n; i++) {
        x = (x * 1664525 + 1013904223) >>> 0;
        data[i] = ((x / 0xffffffff) * 2 - 1) * Math.pow(1 - i / n, 2.6);
      }
    }
    rooms.set(ctx, room);
  }
  return room;
}

/** うなり声：2本の濁った低い音をぶつけ、ふるわせ（荒い声）、口の形のように音色を動かして、歪ませる */
function growl(ctx: AudioContext, out: AudioNode, at: number, o: { freq: number; len: number; gain: number }) {
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.linearRampToValueAtTime(o.gain, at + 0.05);
  env.gain.exponentialRampToValueAtTime(0.0001, at + o.len);
  // 声の荒れ：音量を、速くふるわせる
  const shake = ctx.createGain();
  shake.gain.value = 0.6;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 26;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.4;
  lfo.connect(lfoDepth).connect(shake.gain);
  // 口の形：音色のフィルターが「おー」から「あー」へ開く
  const mouth = ctx.createBiquadFilter();
  mouth.type = 'bandpass';
  mouth.Q.value = 1.4;
  mouth.frequency.setValueAtTime(380, at);
  mouth.frequency.exponentialRampToValueAtTime(900, at + o.len * 0.5);
  mouth.frequency.exponentialRampToValueAtTime(300, at + o.len);
  const g = grit(ctx, 5);
  [1, 1.045].forEach((detune) => {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(o.freq * detune, at);
    osc.frequency.exponentialRampToValueAtTime(o.freq * detune * 0.62, at + o.len);
    osc.connect(g);
    osc.start(at);
    osc.stop(at + o.len + 0.02);
  });
  g.connect(mouth).connect(shake).connect(env).connect(out);
  lfo.start(at);
  lfo.stop(at + o.len + 0.02);
}

/**
 * 紙が燃えるような、チリチリという音：ごく短い高い雑音の粒を、不規則に、まとまって並べる（ときどき静まり、ときどき密になる）。
 * 下に、細かい火のかすれた息を敷く。len 秒続き、level（1が標準）で大きさが変わる
 */
function sizzle(ctx: AudioContext, out: AudioNode, at: number, len: number, level: number) {
  hiss(ctx, out, at, { type: 'highpass', from: 5200, q: 0.5, len, gain: 0.07 * level, attack: Math.min(0.6, len / 4), offset: Math.random() * 0.5 });
  let t = 0;
  let density = 0.5; // 粒の密さ（0〜1）。ゆっくり揺らす
  while (t < len) {
    density = Math.min(1, Math.max(0.1, density + (Math.random() - 0.5) * 0.5));
    const step = 0.006 + (1 - density) * 0.05 * Math.random() * 2; // 密なときは、数msごと
    t += step;
    if (t >= len) break;
    const fade = Math.min(1, t / 0.3, (len - t) / 0.4); // はじめとおわりは、そっと
    hiss(ctx, out, at + t, {
      type: 'bandpass',
      from: 3200 + Math.random() * 6000,
      q: 1.2 + Math.random() * 2,
      len: 0.006 + Math.random() * 0.02,
      gain: (0.12 + Math.random() * 0.28) * level * fade,
      attack: 0.0008,
      offset: Math.random() * 0.8,
    });
  }
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
    case 'roar': { // 大きな声（家をゆらす怒鳴り声と、叩きつける衝撃）。荒々しく：歪んだ重い衝撃・はじける雑音・うなり声・大きな部屋の響き。pitch は強さ（1で標準）
      const p = pitch;
      // 全体をまとめる出口：音がつぶれすぎないよう圧縮し、部屋の響き（残響）を足す
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
      wet.gain.value = 0.32;
      bus.connect(room).connect(wet).connect(squash);
      // 1 衝撃：低い音が落ちる。歪ませて、ざらつかせる
      const thump = ctx.createGain();
      const thumpGrit = grit(ctx, 3.2);
      thumpGrit.connect(thump).connect(bus);
      tone(ctx, thumpGrit, when, { freq: 118, endFreq: 30, len: 0.95, gain: 0.55 * p, attack: 0.004 });
      tone(ctx, thumpGrit, when, { type: 'triangle', freq: 190, endFreq: 52, len: 0.45, gain: 0.4 * p, attack: 0.003 });
      thump.gain.value = 0.9;
      // 2 叩きつける：全域の雑音がはじけ、低い方へ沈む
      hiss(ctx, bus, when, { type: 'lowpass', from: 6500, to: 160, q: 0.6, len: 0.65, gain: 0.55 * p, attack: 0.002 });
      hiss(ctx, bus, when, { type: 'highpass', from: 1400, len: 0.09, gain: 0.4 * p, attack: 0.001 });
      // 3 うなり声：少し遅れて、獣の怒鳴り声が上がる
      growl(ctx, bus, when + 0.03, { freq: 74 + 14 * p, len: 0.95 + 0.3 * p, gain: 0.34 * p });
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
    case 'hush': // 静かな低い響き：ゆっくり立ち上がり、長く消える
      tone(ctx, out, when, { freq: 110, len: 3.2, gain: 0.2, attack: 1.0 });
      tone(ctx, out, when, { freq: 165, len: 3.2, gain: 0.08, attack: 1.2 });
      break;
    case 'sizzle': // 紙が燃えるような、チリチリという音。pitch は長さ（秒）
      sizzle(ctx, out, when, pitch, 1);
      break;
    case 'sizzle_soft': // 同じ音を、小さく
      sizzle(ctx, out, when, pitch, 0.5);
      break;
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}
