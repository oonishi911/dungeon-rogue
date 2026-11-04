// 周回をまたいで残す記録（セーブデータ）。
// 保存するのは「次の挑戦の始まり」に必要なものだけ。準備や探索の途中の状態は保存しない。
// 読み込んだデータは壊れていたり古い形式だったりするので、形を確かめてから使う。

import { CARDS } from './data';
import { RANK_CONFIG } from './rank';
import type { CardId, CardInstance } from './types';

export const SAVE_VERSION = 1;

export interface SaveData {
  version: typeof SAVE_VERSION;
  run: number; // 次が何回目の挑戦か
  rank: number;
  exp: number;
  carried: CardInstance[]; // 持ち越したカード
  bonusGold: number; // 持ち帰った金貨（次の準備の所持金に足す）
}

export function newSave(): SaveData {
  return { version: SAVE_VERSION, run: 1, rank: 1, exp: 0, carried: [], bonusGold: 0 };
}

/** 文字列からセーブデータを読む。形が合わなければ null（最初から始める） */
export function parseSave(text: string | null): SaveData | null {
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const d = raw as Record<string, unknown>;
  const isCount = (v: unknown, min: number) => typeof v === 'number' && Number.isInteger(v) && v >= min;

  if (d.version !== SAVE_VERSION) return null;
  if (!isCount(d.run, 1) || !isCount(d.exp, 0) || !isCount(d.bonusGold, 0)) return null;
  if (!isCount(d.rank, 1) || (d.rank as number) > RANK_CONFIG.maxRank) return null;
  if (!Array.isArray(d.carried)) return null;
  const carried = d.carried.filter(
    (c): c is CardInstance =>
      typeof c === 'object' &&
      c !== null &&
      typeof (c as CardInstance).uid === 'string' &&
      (c as CardInstance).cardId in CARDS,
  );
  if (carried.length !== d.carried.length) return null;

  return {
    version: SAVE_VERSION,
    run: d.run as number,
    rank: d.rank as number,
    exp: d.exp as number,
    carried: carried.map((c) => ({ uid: c.uid, cardId: c.cardId as CardId })),
    bonusGold: d.bonusGold as number,
  };
}
