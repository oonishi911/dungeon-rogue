// 開発用の探索画面（?view=explore）の、URL で指定する条件と、持たせる装備。

import { DEFAULT_DUNGEON_ID, hasDungeon } from '../game/dungeons';
import { TRAIT_IDS } from '../game/data';
import type { ExploreState } from '../game/exploreTypes';
import { tileAt } from '../game/map';
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

// ?poison=3&chill=2 で、毒（残り3ターン）と鈍足（残り2歩）にかかった状態で始められる（状態異常の見た目や、万能薬の確認用）
const urlCount = (name: string): number => {
  const n = Number(new URLSearchParams(location.search).get(name));
  return Number.isInteger(n) && n > 0 ? n : 0;
};
export function devSick(state: ExploreState): ExploreState {
  const poisonTurns = urlCount('poison');
  const chillSteps = urlCount('chill');
  const hp = urlCount('hp'); // ?hp=5 なら、HPが5の状態で始める（低いHPの画面のふちの確認用）
  if (!poisonTurns && !chillSteps && !hp) return state;
  return { ...state, stats: { ...state.stats, poisonTurns, ...(chillSteps ? { chillSteps } : {}), ...(hp ? { hp: Math.min(state.stats.maxHp, hp) } : {}) } };
}

/** ?foeburn=3&foefreeze=2 なら（foenear を付けると、すぐ隣に）、最初の敵を主人公の近くに置いて、燃焼・凍結にした状態で始める（敵の状態異常の見た目の確認用。ふたつ付けると凍結が先） */
export function devFoes(state: ExploreState): ExploreState {
  const burn = urlCount('foeburn');
  const frozen = urlCount('foefreeze');
  const first = state.enemies[0];
  if ((!burn && !frozen) || !first) return state;
  const spots = (new URLSearchParams(location.search).has('foenear') ? [1] : [2, 3, 1]).flatMap((d) => [[d, 0], [-d, 0], [0, d], [0, -d]] as const).map(([dx, dy]) => ({ x: state.player.x + dx, y: state.player.y + dy })).filter((p) => tileAt(state.map, p) === 'floor');
  const pos = spots[0] ?? first.pos;
  const foe = { ...first, pos, mode: 'wander' as const, ...(burn ? { burn: { turns: burn, amount: 20 } } : {}), ...(frozen ? { frozen: true, stun: frozen } : {}) };
  return { ...state, enemies: [foe, ...state.enemies.slice(1)] };
}

// 開発用画面で持たせる装備と道具
export const DEV_LOADOUT: ItemId[] = ['sword', 'hammer', 'plate', 'ring_all_2', 'potion', 'potion', 'panacea', 'food', 'fire_whetstone', 'ice_whetstone', 'book_shockwave', 'book_fire_bolt', 'book_heal'];

/** 開発用画面の「いちばん強い装備で試す」の切り替え先（今のダンジョンの特性のまま、装備だけを切り替える） */
export function devBestHref(best: boolean, trait: TraitId): string {
  const params = new URLSearchParams(location.search);
  if (best) params.set('best', '1');
  else params.delete('best');
  params.set('trait', trait);
  return `?${params.toString()}`;
}
