// バランステストで共通に使う「正しい準備」と「外れた準備」。
// テストを複数のファイルに分けて並列に実行するため、テストファイルの外に置いている。

import type { ItemId, TraitId } from './types';

export const TRIALS = 40;
export const SUPPLIES: ItemId[] = ['potion', 'potion'];

/**
 * ダンジョンごとの正しい準備と、外れた準備。
 * 正しい準備：その属性に効く防具＋出やすい体質に効く武器。外れた準備：効かない防具と武器。
 */
export const PREPS: Record<TraitId, { right: ItemId[]; wrong: ItemId[] }> = {
  fire: { right: ['sword', 'fire_cloak'], wrong: ['staff', 'ice_cloak'] },
  ice: { right: ['hammer', 'ice_cloak'], wrong: ['sword', 'fire_cloak'] },
  neutral: { right: ['hammer', 'plate'], wrong: ['sword', 'light_robe'] },
  light: { right: ['hammer', 'light_robe'], wrong: ['staff', 'dark_robe'] },
  dark: { right: ['staff', 'dark_robe'], wrong: ['sword', 'light_robe'] },
};

/**
 * 外れた準備のクリア率の上限。
 * 無属性のダンジョンは「どの武器でも戦える」「鎧は保険なので効きが弱い」設計なので、外れても差が小さい。
 */
export const WRONG_LIMIT: Record<TraitId, number> = { fire: 0.2, ice: 0.2, neutral: 0.4, light: 0.2, dark: 0.2 };
