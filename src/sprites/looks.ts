// 敵と主人公の見た目。
// 専用のドット絵ができるまで、敵は既存の絵の色違いで仮置きしている（敵の見た目は src/game/enemies.json にある）。
// recolor は PALETTE の文字ごとの色の差し替え。

import { ENEMY_MASTER } from '../game/data';
import type { EnemyId, ItemId } from '../game/types';
import { CLOAKS, type SpriteId } from './data';

export interface Look {
  sprite: SpriteId;
  recolor?: Record<string, string>;
}

/** 敵の見た目（データは src/game/enemies.json の look） */
export const ENEMY_LOOKS: Record<EnemyId, Look> = Object.fromEntries(
  Object.entries(ENEMY_MASTER.enemies).map(([id, e]) => [id, e.look]),
);

/** 敵の見た目。データにない敵は、ゴブリンの絵で描く */
export function lookOf(id: EnemyId): Look {
  return ENEMY_LOOKS[id] ?? { sprite: 'goblin' };
}

export type CloakId = keyof typeof CLOAKS;

/** 装備している防具に対応するマントの色。防具なしなら茶色 */
export function cloakOf(armor: ItemId | null): CloakId {
  return armor !== null && armor in CLOAKS ? (armor as CloakId) : 'none';
}
