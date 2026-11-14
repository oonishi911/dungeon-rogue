// 周回をまたいで残す記録（セーブデータ）。
// 保存するのは「次が何回目の挑戦か」だけ。探索の途中の状態は、中断データ（runSave.ts）に別に保存する。
// 読み込んだデータは壊れていたり古い形式だったりするので、形を確かめてから使う。
// 昔の記録にあった rank（ランク）・exp（踏破の経験）・carried（持ち越したカード）・bonusGold（持ち帰った金貨）は、今は使わない。
// 残っていても読み飛ばす（次に保存するときに消える）。

export const SAVE_VERSION = 1;

export interface SaveData {
  version: typeof SAVE_VERSION;
  run: number; // 次が何回目の挑戦か
}

export function newSave(): SaveData {
  return { version: SAVE_VERSION, run: 1 };
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
  if (d.version !== SAVE_VERSION) return null;
  if (typeof d.run !== 'number' || !Number.isInteger(d.run) || d.run < 1) return null;
  return { version: SAVE_VERSION, run: d.run };
}
