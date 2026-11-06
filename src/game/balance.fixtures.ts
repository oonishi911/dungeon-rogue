// バランステストで共通に使う「正しい準備」と「外れた準備」。
// テストを複数のファイルに分けて並列に実行するため、テストファイルの外に置いている。

import { FAVORABLE_GEAR, START_SUPPLIES } from './data';
import type { ItemId, TraitId } from './types';

export const TRIALS = 40;
export const SUPPLIES: ItemId[] = [...START_SUPPLIES];

/**
 * ダンジョンごとの正しい準備と、外れた準備。
 * 正しい準備：その属性に効く防具＋出やすい体質に効く武器（data.ts の FAVORABLE_GEAR）。外れた準備：効かない防具と武器。
 */
export const PREPS: Record<TraitId, { right: ItemId[]; wrong: ItemId[] }> = {
  fire: { right: [...FAVORABLE_GEAR.fire], wrong: ['staff', 'ice_cloak'] },
  ice: { right: [...FAVORABLE_GEAR.ice], wrong: ['sword', 'fire_cloak'] },
  neutral: { right: [...FAVORABLE_GEAR.neutral], wrong: ['sword', 'light_robe'] },
  light: { right: [...FAVORABLE_GEAR.light], wrong: ['staff', 'dark_robe'] },
  dark: { right: [...FAVORABLE_GEAR.dark], wrong: ['sword', 'light_robe'] },
};

/**
 * 外れた準備のクリア率の上限。
 * 無属性のダンジョンは「どの武器でも戦える」「鎧は保険なので効きが弱い」設計なので、外れても差が小さい。
 */
export const WRONG_LIMIT: Record<TraitId, number> = { fire: 0.2, ice: 0.2, neutral: 0.4, light: 0.2, dark: 0.2 };
