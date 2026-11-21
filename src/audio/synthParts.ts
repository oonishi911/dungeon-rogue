// 合成音の部品（docs/sounds.md）：ノイズの素材・発振器の音・ノイズの音・歪み・部屋の響き・左右の位置・スマホで聞こえる倍音。
// 効果音（synth.ts）と、記憶の動く場面の音（sceneSynth.ts）が使う。ノイズは決まった式で作る（同じ音は、いつも同じ）。

/** ノイズの色：white（さーっ。高い音まで平ら）・pink（ざーっ。炎や息のような、自然な音）・brown（ごーっ。低い音が多い） */
export type NoiseColor = 'white' | 'pink' | 'brown';

/** ノイズの素材の長さ（秒）。長い音でくり返しの模様が聞こえないよう、長めにする */
const NOISE_SECONDS = 4;

const noises = new Map<string, AudioBuffer>();

/** ノイズの素材（1度だけ作って、使い回す）。どの色も、white と同じくらいの大きさにそろえる */
export function noiseOf(ctx: BaseAudioContext, color: NoiseColor = 'white'): AudioBuffer {
  const key = `${color}:${ctx.sampleRate}`;
  let buf = noises.get(key);
  if (!buf) {
    const n = Math.round(ctx.sampleRate * NOISE_SECONDS);
    buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let x = 12345;
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let low = 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      x = (x * 1664525 + 1013904223) >>> 0;
      const w = (x / 0xffffffff) * 2 - 1;
      let v = w;
      if (color === 'pink') {
        // 高い音ほど弱くなる（1オクターブで約3dB）。3つのゆるいフィルタを重ねる近似
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        v = b0 + b1 + b2 + w * 0.1848;
      } else if (color === 'brown') {
        low = (low + 0.02 * w) / 1.02; // 積み重ねて、ゆっくり動く（低い音が多い）
        v = low;
      }
      data[i] = v;
      sum += v * v;
    }
    const scale = Math.sqrt(1 / 3) / Math.sqrt(sum / n); // white（-1〜1 の一様な乱数）と同じ大きさに
    if (color !== 'white') for (let i = 0; i < n; i++) data[i] = data[i]! * scale;
    noises.set(key, buf);
  }
  return buf;
}

/** 発振器の音：at 秒に、freq から endFreq へ動きながら、len 秒かけて消える */
export function tone(ctx: AudioContext, out: AudioNode, at: number, o: { type?: OscillatorType; freq: number; endFreq?: number; len: number; gain: number; attack?: number }) {
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

/** ノイズの音：フィルターの中心を from から to へ動かしながら、len 秒かけて消える。offset は素材のどこから鳴らすか（秒） */
export function hiss(
  ctx: AudioContext,
  out: AudioNode,
  at: number,
  o: { type: BiquadFilterType; from: number; to?: number; q?: number; len: number; gain: number; attack?: number; offset?: number; color?: NoiseColor },
) {
  const src = ctx.createBufferSource();
  src.buffer = noiseOf(ctx, o.color);
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

/** くり返すノイズの音源（長い音のため）。offset からはじめて、at〜at+len のあいだ鳴る */
export function noiseLoop(ctx: AudioContext, at: number, len: number, offset = 0, color: NoiseColor = 'white'): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseOf(ctx, color);
  src.loop = true;
  src.start(at, offset);
  src.stop(at + len + 0.05);
  return src;
}

/** ゆっくり揺らす：param の値を、rate Hz・depth の深さで揺らす発振器をつなぐ */
export function wobble(ctx: AudioContext, param: AudioParam, at: number, len: number, rate: number, depth: number) {
  const lfo = ctx.createOscillator();
  lfo.frequency.value = rate;
  const amount = ctx.createGain();
  amount.gain.value = depth;
  lfo.connect(amount).connect(param);
  lfo.start(at);
  lfo.stop(at + len + 0.05);
}

/** 音をつぶして荒くする（歪み）：drive が大きいほど、ざらつく */
export function grit(ctx: AudioContext, drive: number): WaveShaperNode {
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

const rooms = new WeakMap<BaseAudioContext, AudioBuffer>();
/** 大きな部屋の響き（減っていくノイズ。左右で違う。毎回同じ） */
export function roomOf(ctx: BaseAudioContext): AudioBuffer {
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

/** 左右の位置（-1：左〜1：右）に置く入口。左右を動かせない環境では、そのまま out を返す */
export function panTo(ctx: AudioContext, out: AudioNode, pan: number): AudioNode {
  if (typeof ctx.createStereoPanner !== 'function') return out;
  const node = ctx.createStereoPanner();
  node.pan.value = Math.max(-1, Math.min(1, pan));
  node.connect(out);
  return node;
}

/**
 * スマホの小さなスピーカーでも、低い音が聞こえるようにする入口：元の音はそのまま通し、
 * 並べて、音を歪ませて倍音を作り、小さなスピーカーが鳴らせる高さ（約220〜1100Hz）だけを、amount の量だけ足す
 */
export function presence(ctx: AudioContext, out: AudioNode, amount: number): AudioNode {
  const input = ctx.createGain();
  input.connect(out);
  const shaper = grit(ctx, 6);
  const high = ctx.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = 220;
  high.Q.value = 0.7;
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 1100;
  low.Q.value = 0.7;
  const level = ctx.createGain();
  level.gain.value = amount;
  input.connect(shaper).connect(high).connect(low).connect(level).connect(out);
  return input;
}
