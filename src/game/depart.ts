// ダンジョンへの出発。ダンジョンの特性はシードから決まり、持ち物はその特性に合わせて決まる：
// - 有利な装備（data.ts の FAVORABLE_GEAR）
// - 回復薬2つ（START_SUPPLIES）
// - そのダンジョンで有利に働く呪文書2冊（bestLoadout.ts の favorableSpellbooks）

import { favorableSpellbooks } from './bestLoadout';
import { FAVORABLE_GEAR, START_SPELLBOOKS, START_SUPPLIES } from './data';
import { DEFAULT_DUNGEON_ID, dungeonOf } from './dungeons';
import { traitForSeed } from './explore';
import type { Departure } from './types';

/** 選んだダンジョン（dungeon は ID）に出発する。特性は、階層の形と同じシードから決める */
export function depart(seed: number, dungeon: string = DEFAULT_DUNGEON_ID): Departure {
  const trait = traitForSeed(seed);
  const gear = FAVORABLE_GEAR[trait];
  return {
    dungeon,
    trait,
    loadout: [...gear, ...START_SUPPLIES, ...favorableSpellbooks(trait, dungeonOf(dungeon), gear, START_SPELLBOOKS)],
  };
}
