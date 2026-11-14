// 周回をまたいで残す記録（セーブデータ）。
// 保存するのは「次が何回目の挑戦か」と、貯めた金貨・買った持ち物・道具の倉庫・前に選んだ持ち物。
// 探索の途中の状態は、中断データ（runSave.ts）に別に保存する。
// 読み込んだデータは壊れていたり古い形式だったりするので、形を確かめてから使う。
// 昔の記録にあった rank（ランク）・exp（踏破の経験）・carried（持ち越したカード）・bonusGold（持ち帰った金貨）は、今は使わない。
// 残っていても読み飛ばす（次に保存するときに消える）。金貨・持ち物・倉庫がない昔の記録は、どれも空から始める。

import { ITEMS } from './data';
import { itemSlot } from './combat';
import type { ItemId } from './types';

export const SAVE_VERSION = 1;

/** 出発するときの持ち物の選び方。武器・防具・呪文書は買ったもの（owned）から、道具は倉庫（stock）から選ぶ */
export interface Kit {
  weapon: ItemId | null;
  armor: ItemId | null;
  books: ItemId[]; // 持っていく呪文書
  take: ItemId[]; // 倉庫から持っていく道具（同じ道具は何個でも並べる）
}

export interface SaveData {
  version: typeof SAVE_VERSION;
  run: number; // 次が何回目の挑戦か
  gold: number; // 貯めた金貨（店で使う）
  owned: ItemId[]; // 買った武器・防具・呪文書（一度買えばずっと使える。同じものは1つ）
  stock: ItemId[]; // 道具の倉庫（使わずに持ち帰った道具も、ここに戻る）
  kit: Kit; // 前に選んだ持ち物（次に店を開いたとき、同じ選び方から始める）
}

export const emptyKit = (): Kit => ({ weapon: null, armor: null, books: [], take: [] });

export function newSave(): SaveData {
  return { version: SAVE_VERSION, run: 1, gold: 0, owned: [], stock: [], kit: emptyKit() };
}

const isItem = (v: unknown): v is ItemId => typeof v === 'string' && v in ITEMS;
const items = (v: unknown): ItemId[] => (Array.isArray(v) ? v.filter(isItem) : []);
const slotIs = (id: ItemId, slot: ReturnType<typeof itemSlot>) => itemSlot(ITEMS[id]) === slot;

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
  // 金貨・持ち物・倉庫は、読めない値があれば、その分だけ捨てる（品物の設定から消えた品物なども）
  const gold = typeof d.gold === 'number' && Number.isInteger(d.gold) && d.gold >= 0 ? d.gold : 0;
  const owned = [...new Set(items(d.owned).filter((id) => !slotIs(id, 'consumable')))];
  const stock = items(d.stock).filter((id) => slotIs(id, 'consumable'));
  return { version: SAVE_VERSION, run: d.run, gold, owned, stock, kit: parseKit(d.kit, owned) };
}

/**
 * 前に選んだ持ち物。今は持っていない武器・防具・呪文書は外す。
 * 道具は、出発したあと（倉庫から出したあと）も同じ選び方を残すので、ここでは倉庫の数と比べない（店を開くときに shop.ts の fitKit で合わせる）
 */
function parseKit(v: unknown, owned: readonly ItemId[]): Kit {
  if (typeof v !== 'object' || v === null) return emptyKit();
  const k = v as Record<string, unknown>;
  const pick = (id: unknown, slot: 'weapon' | 'armor') => (isItem(id) && owned.includes(id) && slotIs(id, slot) ? id : null);
  return {
    weapon: pick(k.weapon, 'weapon'),
    armor: pick(k.armor, 'armor'),
    books: [...new Set(items(k.books).filter((id) => owned.includes(id) && slotIs(id, 'spellbook')))],
    take: items(k.take).filter((id) => slotIs(id, 'consumable')),
  };
}
