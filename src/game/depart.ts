// ダンジョンへの出発。ダンジョンの特性はシードから決まる（店に入る前に決まり、店の画面にも出す）。
// 持ち物は、店（shop.ts）で買って選んだものだけ。

import { DEFAULT_DUNGEON_ID } from './dungeons';
import { traitForSeed } from './explore';
import type { Departure, ItemId } from './types';

/** 選んだダンジョン（dungeon は ID）に、loadout を持って出発する。特性は、階層の形と同じシードから決める */
export function depart(seed: number, dungeon: string = DEFAULT_DUNGEON_ID, loadout: readonly ItemId[] = []): Departure {
  return { dungeon, trait: traitForSeed(seed), loadout: [...loadout] };
}
