// ダンジョン特性ごとのタイル素材（public/tiles/{特性}.png）を読み込む。
// 読み込みが終わるまでは null を返し、描画側は色の四角で代わりに描く。

import type { TraitId } from '../game/types';

const cache = new Map<TraitId, HTMLImageElement>();

export function tilesetFor(trait: TraitId): HTMLImageElement | null {
  let img = cache.get(trait);
  if (!img) {
    img = new Image();
    img.src = `${import.meta.env.BASE_URL}tiles/${trait}.png`;
    cache.set(trait, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}
