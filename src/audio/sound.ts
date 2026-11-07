// 効果音を鳴らす（Web Audio API）。
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
// 設定画面で音量を試すときに鳴らす音
const SAMPLE_SOUND = STEP_SOUNDS.light?.[0] ?? null;

let settings: SoundSettings = loadSoundSettings();
let context: AudioContext | null = null;
let master: GainNode | null = null;
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
  if (master && context) master.gain.setTargetAtTime(gainOf(next), context.currentTime, 0.02);
}

/** 画面に触れたときに呼ぶ。音を出す準備をする（何度呼んでもよい） */
export function unlockSound() {
  if (!context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = gainOf(settings);
    master.connect(context.destination);
  }
  if (context.state === 'suspended') void context.resume();
}

/** この特性で使う音を、前もって読み込んでおく（最初の一歩から遅れずに鳴るように） */
export function preloadSounds(trait: TraitId) {
  for (const name of STEP_SOUNDS[trait] ?? []) fetchFile(name);
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
  if (!context || !master || gainOf(settings) === 0) return;
  const ctx = context;
  const out = master;
  void bufferOf(ctx, name).then((buffer) => {
    if (!buffer) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(out);
    source.start();
  });
}
