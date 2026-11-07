// 効果音と環境音を鳴らす（Web Audio API）。
// スマホのブラウザは、画面に触れるまで音を出させてくれないので、最初に触れたとき（unlockSound）に音の準備をする。
// 音の素材は scripts/build-sounds.py で作る（public/sounds/）。読み込めない音は鳴らさないだけで、遊ぶのには困らない

import type { TraitId } from '../game/types';
import { loadSoundSettings, writeSoundSettings } from '../storage';
import { gainOf, type SoundSettings } from './settings';

// 特性ごとの足音（一歩ごとにこの中から選ぶ。scripts/build-sounds.py の VARIATIONS と数を合わせる）。
// 無属性は土（低く重い音）、炎は焼けて尖った細かい石（先端が砕けるゴリッという音）、
// 氷は雪（シャリとジャリを左右の足で交互に、氷の洞窟に響かせる）、光は磨かれた石の神殿、闇は硬い石の洞窟
// （音のファイルは public/sounds/ にある。決まったら、ここに特性を足す）
const STEP_VARIATIONS = 4;
const STEP_TRAITS: readonly TraitId[] = ['neutral', 'fire', 'ice', 'light', 'dark'];
const STEP_SOUNDS: Partial<Record<TraitId, string[]>> = Object.fromEntries(
  STEP_TRAITS.map((trait) => [
    trait,
    Array.from({ length: STEP_VARIATIONS }, (_, i) => `step-${trait}-${i + 1}.mp3`),
  ]),
);
// 足音の高さを一歩ごとに少し変える範囲（再生の速さの倍率）
const STEP_PITCH = { min: 0.96, max: 1.04 };
// 宝箱から中身を取ったときの音（カチッ → ギギギ… → ゴトッ、約1.1秒）
const CHEST_SOUND = 'chest-open.mp3';
// 特性ごとの環境音（ダンジョンにいるあいだ、くり返し流す）。ない特性は流さない
// 無属性は洞窟を吹き抜ける風のうなり、炎は溶岩の流れる火山の洞窟（地鳴り・溶岩の泡・火のはぜる音・蒸気）、
// 氷は氷の洞窟（細い風・氷のきしみ・水滴・きらめき）、光は神殿の広間（合唱のような和音・鐘・そよ風）、
// 闇は光の届かない洞窟の奥（不気味なうなり・ささやき・うめき声・石の音）
const AMBIENT_SOUNDS: Partial<Record<TraitId, string>> = {
  neutral: 'ambient-neutral.mp3',
  fire: 'ambient-fire.mp3',
  ice: 'ambient-ice.mp3',
  light: 'ambient-light.mp3',
  dark: 'ambient-dark.mp3',
};
// 環境音のくり返す長さ（秒。scripts/build-sounds.py の ambient_wind の length と合わせる）
const AMBIENT_LOOP_SECONDS = 24;
// mp3 は頭に短い無音が入ることがある（ブラウザによっては取り除かれない）。その長さ（サンプル数、44.1kHz）
const MP3_PRIMING = 1105;
// 環境音を流し始める・止めるときに、なめらかに大きく・小さくする時間（秒）
const AMBIENT_FADE = { in: 2, out: 1 };
// 設定画面で音量を試すときに鳴らす音
const SAMPLE_SOUND = STEP_SOUNDS.light?.[0] ?? null;

let settings: SoundSettings = loadSoundSettings();
let context: AudioContext | null = null;
let master: GainNode | null = null; // すべての音（オン・オフ）
let effects: GainNode | null = null; // 効果音の音量
let ambience: GainNode | null = null; // 環境音の音量
let ambientTrait: TraitId | null = null; // 今流したい環境音の特性（音の準備の前でも覚えておく）
let ambientPlaying: { trait: TraitId; source: AudioBufferSourceNode; fade: GainNode } | null = null;
const files = new Map<string, Promise<ArrayBuffer | null>>(); // 読み込んだ音のファイル（音の準備の前から読み込める）
const buffers = new Map<string, Promise<AudioBuffer | null>>(); // 鳴らせる形にした音
let lastStep: string | null = null;
let foot = 0; // 次に鳴らす足（0 と 1 を交互に）

export function soundSettings(): SoundSettings {
  return settings;
}

/** 設定を変えて保存する。鳴っている音にもすぐ反映する */
export function setSoundSettings(next: SoundSettings) {
  settings = next;
  writeSoundSettings(next);
  if (!context || !master || !effects || !ambience) return;
  master.gain.setTargetAtTime(next.enabled ? 1 : 0, context.currentTime, 0.02);
  effects.gain.setTargetAtTime(gainOf({ ...next, enabled: true }), context.currentTime, 0.02);
  ambience.gain.setTargetAtTime(gainOf({ ...next, enabled: true }, 'ambient'), context.currentTime, 0.02);
}

/** 画面に触れたときに呼ぶ。音を出す準備をする（何度呼んでもよい） */
export function unlockSound() {
  if (!context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = settings.enabled ? 1 : 0;
    master.connect(context.destination);
    effects = context.createGain();
    effects.gain.value = gainOf({ ...settings, enabled: true });
    effects.connect(master);
    ambience = context.createGain();
    ambience.gain.value = gainOf({ ...settings, enabled: true }, 'ambient');
    ambience.connect(master);
    // 別のタブやアプリに切り替えたあいだは止め、戻ったら続きから鳴らす
    document.addEventListener('visibilitychange', () => {
      if (!context) return;
      if (document.hidden) void context.suspend();
      else void context.resume();
    });
    // 画面に触れる前に入ったダンジョンの環境音を、ここで流し始める
    syncAmbient();
  }
  if (context.state === 'suspended' && !document.hidden) void context.resume();
}

/**
 * ダンジョンの環境音を流す（null で止める）。同じ特性のあいだは流し続け、特性が変わったら入れ替える。
 * 音の準備の前に呼ばれたときは覚えておき、準備ができたら流し始める
 */
export function setAmbient(trait: TraitId | null) {
  ambientTrait = trait && AMBIENT_SOUNDS[trait] ? trait : null;
  syncAmbient();
}

function syncAmbient() {
  if (!context || !ambience) return;
  if (ambientPlaying?.trait === ambientTrait) return;
  // 前の環境音は、なめらかに小さくして止める
  if (ambientPlaying) {
    const { source, fade } = ambientPlaying;
    const now = context.currentTime;
    fade.gain.cancelScheduledValues(now);
    fade.gain.setValueAtTime(fade.gain.value, now);
    fade.gain.linearRampToValueAtTime(0, now + AMBIENT_FADE.out);
    source.stop(now + AMBIENT_FADE.out + 0.05);
    ambientPlaying = null;
  }
  const trait = ambientTrait;
  const name = trait ? AMBIENT_SOUNDS[trait] : undefined;
  if (!trait || !name) return;
  const ctx = context;
  const out = ambience;
  void bufferOf(ctx, name).then((buffer) => {
    // 読み込んでいるあいだに、別のダンジョンへ移った・止めたときは流さない
    if (!buffer || ambientTrait !== trait || ambientPlaying) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    // 頭に無音が残っていたら、それを飛ばしてくり返す
    const extra = buffer.duration - AMBIENT_LOOP_SECONDS;
    source.loopStart = extra > 0.001 ? Math.min(extra, MP3_PRIMING / buffer.sampleRate) : 0;
    source.loopEnd = source.loopStart + Math.min(AMBIENT_LOOP_SECONDS, buffer.duration);
    const fade = ctx.createGain();
    fade.gain.setValueAtTime(0, ctx.currentTime);
    fade.gain.linearRampToValueAtTime(1, ctx.currentTime + AMBIENT_FADE.in);
    source.connect(fade).connect(out);
    source.start(0, source.loopStart);
    ambientPlaying = { trait, source, fade };
  });
}

/** この特性で使う音を、前もって読み込んでおく（最初の一歩から遅れずに鳴るように） */
export function preloadSounds(trait: TraitId) {
  for (const name of STEP_SOUNDS[trait] ?? []) fetchFile(name);
  fetchFile(CHEST_SOUND);
  const ambient = AMBIENT_SOUNDS[trait];
  if (ambient) fetchFile(ambient);
}

/** 宝箱から中身（金貨か道具）を取ったときの音 */
export function playChestOpen() {
  play(CHEST_SOUND, 1);
}

/** 主人公が1歩進んだときの足音。左右の足で交互に鳴らす（奇数番が片方の足、偶数番がもう片方の足の音） */
export function playFootstep(trait: TraitId) {
  const all = STEP_SOUNDS[trait];
  if (!all?.length) return;
  const names = all.filter((_, i) => i % 2 === foot);
  foot = (foot + 1) % 2;
  if (!names.length) return;
  // 同じ音が続かないように選ぶ
  const choices = names.length > 1 ? names.filter((n) => n !== lastStep) : names;
  const name = choices[Math.floor(Math.random() * choices.length)]!;
  lastStep = name;
  play(name, STEP_PITCH.min + Math.random() * (STEP_PITCH.max - STEP_PITCH.min));
}

/** 音量を試すときの音 */
export function playSample() {
  if (SAMPLE_SOUND) play(SAMPLE_SOUND, 1);
}

function fetchFile(name: string): Promise<ArrayBuffer | null> {
  let file = files.get(name);
  if (!file) {
    file = fetch(`${import.meta.env.BASE_URL}sounds/${name}`)
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .catch(() => null);
    files.set(name, file);
  }
  return file;
}

function bufferOf(ctx: AudioContext, name: string): Promise<AudioBuffer | null> {
  let buffer = buffers.get(name);
  if (!buffer) {
    // decodeAudioData は受け取ったデータを使い切るので、写しを渡す
    buffer = fetchFile(name).then((data) => (data ? ctx.decodeAudioData(data.slice(0)).catch(() => null) : null));
    buffers.set(name, buffer);
  }
  return buffer;
}

function play(name: string, rate: number) {
  if (!context || !effects || gainOf(settings) === 0) return;
  const ctx = context;
  const out = effects;
  void bufferOf(ctx, name).then((buffer) => {
    if (!buffer) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(out);
    source.start();
  });
}
