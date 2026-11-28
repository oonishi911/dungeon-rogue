// バランステストで共通に使う「正しい準備」と「外れた準備」。
// テストを複数のファイルに分けて並列に実行するため、テストファイルの外に置いている。

import { FAVORABLE_GEAR, START_SUPPLIES } from './data';
import type { ItemId, TraitId } from './types';

export const TRIALS = 40;
// 1つのテストの待ち時間（ミリ秒）。階の数が5で、広いマップを TRIALS 回遊ばせるので、CI の遅い機械でも終わるよう余裕を持たせる
export const BALANCE_TIMEOUT = 120_000;
export const SUPPLIES: ItemId[] = [...START_SUPPLIES];

/**
 * ダンジョンごとの正しい準備と、外れた準備。
 * 正しい準備：その属性に効く防具＋出やすい体質に効く武器（data.ts の FAVORABLE_GEAR）。外れた準備：効かない防具と武器。
 */
export const PREPS: Record<TraitId, { right: ItemId[]; wrong: ItemId[] }> = {
  fire: { right: [...FAVORABLE_GEAR.fire], wrong: ['staff', 'plate', 'ring_ice_1'] },
  ice: { right: [...FAVORABLE_GEAR.ice], wrong: ['sword', 'plate', 'ring_fire_1'] },
  neutral: { right: [...FAVORABLE_GEAR.neutral], wrong: ['sword', 'plate', 'ring_light_1'] },
  light: { right: [...FAVORABLE_GEAR.light], wrong: ['staff', 'plate', 'ring_dark_1'] },
  dark: { right: [...FAVORABLE_GEAR.dark], wrong: ['sword', 'plate', 'ring_light_1'] },
};

// クリア率の合格の幅（2026-11-28 に、目標のクリア率60%に合わせて見直した）。
// 属性ごとの回数（TRIALS）が40回だと、クリア率は±8ポイントほどぶれるので、幅は広めに取る。
/** 正しい準備：ダンジョンの5属性の平均が、目標（TARGET_RATE=60%）の±20ポイントに入る */
export const RIGHT_BAND = { min: 0.4, max: 0.8 };
/** 正しい準備でも、属性ごとにこれを下回ったら「その属性だけ厳しすぎる」 */
export const RIGHT_FLOOR = 0.2;
/** 外れた準備は、属性ごとにこれ未満（準備で勝負が決まる）。正しい準備との平均の差も、GAP_MIN 以上あること */
export const WRONG_LIMIT = 0.5;
export const GAP_MIN = 0.3;
/** 何も準備しないときは、属性ごとにこれ未満 */
export const NONE_LIMIT = 0.4;
