// 敵と主人公の見た目。
// 専用のドット絵ができるまで、新しい敵は既存の絵の色違いで仮置きしている。
// recolor は PALETTE の文字ごとの色の差し替え。

import type { EnemyId, ItemId } from '../game/types';
import { CLOAKS, type SpriteId } from './data';

export interface Look {
  sprite: SpriteId;
  recolor?: Record<string, string>;
}

export const ENEMY_LOOKS: Record<EnemyId, Look> = {
  goblin: { sprite: 'goblin' },
  giant_rat: { sprite: 'flame_hound', recolor: { F: '#b9b29f', O: '#8f8977', R: '#6a5038', r: '#3a2e24' } },
  stone_golem: { sprite: 'fire_drake', recolor: { F: '#c9c3b3', O: '#a39d8d', R: '#7d786b', r: '#55514a' } },
  fire_imp: { sprite: 'fire_imp' },
  flame_hound: { sprite: 'flame_hound' },
  lava_lizard: { sprite: 'fire_drake' },
  ice_imp: { sprite: 'fire_imp', recolor: { F: '#cfeefa', O: '#9fd6ef', R: '#5aa7d6', r: '#2f6f9e' } },
  ice_slime: { sprite: 'poison_slime', recolor: { L: '#d6f1fb', U: '#8fd0ee', u: '#4f97c4' } },
  ice_beetle: {
    sprite: 'venom_spider',
    recolor: { U: '#8fd0ee', u: '#4f97c4', V: '#2f5d80', v: '#1e3d57', E: '#ffffff', Z: '#d6f1fb' },
  },
  light_bird: { sprite: 'fire_imp', recolor: { F: '#fff6c8', O: '#f7e27a', R: '#e9c04a', r: '#b48d35' } },
  holy_armor: {
    sprite: 'venom_queen',
    recolor: { U: '#f2ead0', u: '#cdbf8f', V: '#a38f55', v: '#6e5d2e', E: '#f7e27a', Z: '#fff6c8' },
  },
  light_wisp: { sprite: 'poison_slime', recolor: { L: '#fffbe6', U: '#f7e27a', u: '#d9b94a' } },
  dark_bat: {
    sprite: 'venom_spider',
    recolor: { U: '#5a4a7a', u: '#3a2e54', V: '#2a2140', v: '#1a1428', Z: '#9a7cc4' },
  },
  shadow: { sprite: 'poison_slime', recolor: { L: '#6a5a8a', U: '#3e3358', u: '#241d36' } },
  phantom: { sprite: 'fire_imp', recolor: { F: '#e8e4f0', O: '#b9b2cc', R: '#8a80a6', r: '#5a5276' } },
};

export type CloakId = keyof typeof CLOAKS;

/** 装備している防具に対応するマントの色。防具なしなら茶色 */
export function cloakOf(armor: ItemId | null): CloakId {
  return armor !== null && armor in CLOAKS ? (armor as CloakId) : 'none';
}
