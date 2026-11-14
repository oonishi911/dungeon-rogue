// 開発用の探索画面（?view=explore）の、URL で指定する条件と、持たせる装備。

import { DEFAULT_DUNGEON_ID, hasDungeon } from '../game/dungeons';
import { TRAIT_IDS } from '../game/data';
import type { ItemId, TraitId } from '../game/types';

export const newSeed = () => Math.floor(Math.random() * 2 ** 31);
// ?seed=123 で同じ階層を再現できる（不具合の再現や見た目の確認用）
export const urlSeed = Number(new URLSearchParams(location.search).get('seed'));
// ?best=1 で、ダンジョンの特性に合わせた、いちばん強い装備・道具・呪文書で始める
export const urlBest = new URLSearchParams(location.search).get('best') === '1';
// ?trait=fire でダンジョン特性を指定できる（タイル素材の確認用）
const traitParam = new URLSearchParams(location.search).get('trait');
export const urlTrait = TRAIT_IDS.find((t) => t === traitParam);
// ?dungeon=standard で、遊ぶダンジョン（src/game/dungeons/ の設定ファイルの名前）を指定できる
const dungeonParam = new URLSearchParams(location.search).get('dungeon') ?? DEFAULT_DUNGEON_ID;
export const urlDungeon = hasDungeon(dungeonParam) ? dungeonParam : DEFAULT_DUNGEON_ID;

// 開発用画面で持たせる装備と道具
export const DEV_LOADOUT: ItemId[] = ['sword', 'plate', 'potion', 'potion', 'food', 'fire_whetstone', 'ice_whetstone', 'book_shockwave', 'book_fire_bolt', 'book_heal'];

/** 開発用画面の「いちばん強い装備で試す」の切り替え先（今のダンジョンの特性のまま、装備だけを切り替える） */
export function devBestHref(best: boolean, trait: TraitId): string {
  const params = new URLSearchParams(location.search);
  if (best) params.set('best', '1');
  else params.delete('best');
  params.set('trait', trait);
  return `?${params.toString()}`;
}
