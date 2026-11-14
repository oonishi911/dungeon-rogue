// ゲームの始まりに、テクスチャ（床・壁・宝箱の絵）と音を、すべて読み込んでおく。
// 読み込んだものは使い回すので、ダンジョンに入ったときや、初めて音を鳴らすときに待たない。
// - テクスチャ：Three.js の読み込みの置き場（THREE.Cache）に入れる。3D表示（explore3d.ts）が同じ住所で読むと、置き場から取り出す
// - 音：sound.ts の置き場に入れる（鳴らせる形にするのは、画面に触れて音の準備ができたとき）
// - 文字：画面の書体（Google Fonts）も読み終わるのを待つ
// 読み込めなかったものがあっても止めない（テクスチャは色で描き、音は鳴らさないだけで、遊ぶのには困らない）。

import * as THREE from 'three';
import { allSoundFiles, loadSoundFile } from './audio/sound';
import { TRAIT_IDS } from './game/data';
import { TEXTURE_FILES } from './ui/explore3dConfig';

THREE.Cache.enabled = true;

/** 床と壁のテクスチャ（ダンジョン特性ごと）と、宝箱のテクスチャ。explore3d.ts と同じ住所 */
export function textureUrls(): string[] {
  const base = import.meta.env.BASE_URL;
  const trait = TRAIT_IDS.flatMap((t) => Object.values(TEXTURE_FILES).map((f) => `${base}textures/${t}/${f}`));
  const chest = ['front.png', 'side.png', 'lid.png'].map((f) => `${base}textures/chest/${f}`);
  return [...trait, ...chest];
}

/** すべてを読み込む。1つ終わるたびに、終わった数とぜんぶの数を知らせる */
export function preloadAll(onProgress: (done: number, total: number) => void): Promise<void> {
  const loader = new THREE.ImageLoader();
  const jobs: (() => Promise<unknown>)[] = [
    ...textureUrls().map((url) => () => loader.loadAsync(url)),
    ...allSoundFiles().map((name) => () => loadSoundFile(name)),
    () => (document.fonts ? document.fonts.ready : Promise.resolve()),
  ];
  let done = 0;
  onProgress(0, jobs.length);
  return Promise.all(
    jobs.map((job) =>
      job()
        .catch(() => undefined)
        .then(() => onProgress(++done, jobs.length)),
    ),
  ).then(() => undefined);
}
