// 周回をまたいで残す記録（セーブデータ）。
// 保存するのは「次が何回目の挑戦か」と、貯めた金貨・買った持ち物・道具の倉庫・前に選んだ持ち物。
// 探索の途中の状態は、中断データ（runSave.ts）に別に保存する。
// 読み込んだデータは壊れていたり古い形式だったりするので、形を確かめてから使う。
// 取り戻した記憶（memories）・かけら（fragments）・注意書きを読んだか（noticeSeen）は、story.ts と同じ話。ない昔の記録は、空から始める。
// 昔の記録にあった rank（ランク）・exp（踏破の経験）・carried（持ち越したカード）・bonusGold（持ち帰った金貨）は、今は使わない。
// 残っていても読み飛ばす（次に保存するときに消える）。金貨・持ち物・倉庫がない昔の記録は、どれも空から始める。

import { ENEMIES, ITEMS } from './data';
import { ECHO_IDS } from './echoMaster';
import { ringId } from './itemMaster';
import { MEMORIES } from './story';
import { itemSlot, weaponTypeOf } from './combat';
import { fingers, fitRingList } from './ring';
import type { EchoId, EnemyId, ItemId } from './types';

export const SAVE_VERSION = 1;

/** 出発するときの持ち物の選び方。武器・防具・呪文書は買ったもの（owned）から、道具は倉庫（stock）から選ぶ */
export interface Kit {
  weapon: ItemId | null;
  armor: ItemId | null;
  books: ItemId[]; // 持っていく呪文書
  take: ItemId[]; // 倉庫から持っていく道具（同じ道具は何個でも並べる）
  weapon2?: ItemId | null; // サブ武器（買った武器から。メインとちがう種類。道具の枠を1つ使う。ないときは、なし）
  weaponGear?: number | null; // 武器に刻印武器を付けているときの、その番号（engraved の uid。weapon は、その元の武器）
  rings?: ItemId[]; // 付けている指輪（owned から。指の数まで、同じ種類は1つ。ring.ts。ないときは、なし）
}

/** 刻印武器（敵が落とす。買えない。防具にスロットはない）。1つ1つに番号がある。slots：スロット（1〜3個）にはめた残響（空は null）。docs/echo-spec.md */
export interface EngravedGear {
  uid: number;
  base: ItemId; // 元の武器（段階つき）
  slots: (EchoId | null)[];
}

export interface SaveData {
  version: typeof SAVE_VERSION;
  run: number; // 次が何回目の挑戦か
  gold: number; // 貯めた金貨（店で使う）
  owned: ItemId[]; // 買った武器・防具・指輪・呪文書と、拾った二重耐性の指輪（一度手に入れればずっと使える。同じものは1つ）
  stock: ItemId[]; // 道具の倉庫（使わずに持ち帰った道具も、ここに戻る）
  kit: Kit; // 前に選んだ持ち物（次に店を開いたとき、同じ選び方から始める）
  memories: string[]; // 取り戻した記憶（倒したボスの ID。思い出した順。story.ts）
  fragments: number; // 5つの記憶がそろったあとに見た、あの子のかけらの数
  noticeSeen: boolean; // 最初の注意書きを読んだか
  engraved: EngravedGear[]; // 持っている刻印武器（力尽きても、なくならない）
  echoes: EchoId[]; // 倉庫の残響（スロットにはめていないもの。同じ残響は何個でも並べる）
  met: EnemyId[]; // 出会ったことのある敵（敵の図鑑に載る。出会った順。docs/enemy-weakness.md）
}

export const emptyKit = (): Kit => ({ weapon: null, armor: null, books: [], take: [] });

export function newSave(): SaveData {
  return { version: SAVE_VERSION, run: 1, gold: 0, owned: [], stock: [], kit: emptyKit(), memories: [], fragments: 0, noticeSeen: false, engraved: [], echoes: [], met: [] };
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
  // 防具が鎧1つになる前の記録：マント・衣は、同じ段階の鎧と、その属性の指輪（段階は半分に切り上げ）に変える
  const gifts: ItemId[] = [];
  const owned = [...new Set([...items(migrateOld(d.owned, gifts)), ...gifts].filter((id) => !slotIs(id, 'consumable')))];
  const stock = items(d.stock).filter((id) => slotIs(id, 'consumable'));
  // 記憶は、今ある記憶だけを、重ねずに残す。かけらの数は、0以上の整数だけ
  const memories = Array.isArray(d.memories) ? [...new Set(d.memories.filter((id): id is string => typeof id === 'string' && id in MEMORIES))] : [];
  const fragments = typeof d.fragments === 'number' && Number.isInteger(d.fragments) && d.fragments >= 0 ? d.fragments : 0;
  // 刻印武器と残響の倉庫（ない昔の記録は、空から始める）
  const engraved = parseEngraved(d.engraved);
  const echoes = Array.isArray(d.echoes) ? d.echoes.filter(isEcho) : [];
  const kit = parseKit(d.kit, owned, engraved, memories.length);
  // 出会った敵（ない昔の記録は、空から始める。今いない敵は捨てる）
  const met = Array.isArray(d.met) ? [...new Set(d.met.filter((id): id is EnemyId => typeof id === 'string' && id in ENEMIES))] : [];
  return { version: SAVE_VERSION, run: d.run, gold, owned, stock, kit, memories, fragments, noticeSeen: d.noticeSeen === true, engraved, echoes, met };
}

const isEcho = (v: unknown): v is EchoId => typeof v === 'string' && (ECHO_IDS as readonly string[]).includes(v);

/** 刻印武器。番号が重なるもの、武器でないもの、スロットが1〜3個でないものは捨てる。今ない残響は、空のスロットにする */
function parseEngraved(v: unknown): EngravedGear[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<number>();
  const out: EngravedGear[] = [];
  for (const g of v as unknown[]) {
    if (typeof g !== 'object' || g === null) continue;
    const r = g as Record<string, unknown>;
    if (typeof r.uid !== 'number' || !Number.isInteger(r.uid) || r.uid < 1 || seen.has(r.uid)) continue;
    if (!isItem(r.base) || !slotIs(r.base, 'weapon')) continue;
    if (!Array.isArray(r.slots) || r.slots.length < 1 || r.slots.length > 3) continue;
    seen.add(r.uid);
    out.push({ uid: r.uid, base: r.base, slots: r.slots.map((s: unknown) => (isEcho(s) ? s : null)) });
  }
  return out;
}

/**
 * 前に選んだ持ち物。今は持っていない武器・防具・呪文書は外す。
 * 道具は、出発したあと（倉庫から出したあと）も同じ選び方を残すので、ここでは倉庫の数と比べない（店を開くときに shop.ts の fitKit で合わせる）
 */
function parseKit(v: unknown, owned: readonly ItemId[], engraved: readonly EngravedGear[], memories: number): Kit {
  if (typeof v !== 'object' || v === null) return emptyKit();
  const k = v as Record<string, unknown>;
  const armorGifts: ItemId[] = [];
  const armor = typeof k.armor === 'string' ? (migrateOld([k.armor], armorGifts)[0] as unknown) : null;
  const pick = (id: unknown, slot: 'weapon' | 'armor') => (isItem(id) && owned.includes(id) && slotIs(id, slot) ? id : null);
  // 付けていた指輪（と、マント・衣から変えた指輪）。指の数まで
  const rings = fitRingList([...items(k.rings), ...armorGifts], owned, fingers(memories));
  // 刻印武器を付けているときは、その元の武器が装備になる（買っていなくてよい）
  const wg = engraved.find((g) => g.uid === k.weaponGear);
  const weapon = wg ? wg.base : pick(k.weapon, 'weapon');
  // サブ武器は、メインの武器があって、ちがう種類のときだけ
  const sub = pick(k.weapon2, 'weapon');
  const weapon2 = weapon && sub && weaponTypeOf(sub) !== weaponTypeOf(weapon) ? sub : null;
  return {
    weapon,
    ...(weapon2 ? { weapon2 } : {}),
    armor: pick(armor, 'armor'),
    ...(wg ? { weaponGear: wg.uid } : {}),
    ...(rings.length ? { rings } : {}),
    books: [...new Set(items(k.books).filter((id) => owned.includes(id) && slotIs(id, 'spellbook')))],
    take: items(k.take).filter((id) => slotIs(id, 'consumable')),
  };
}

/**
 * 防具が鎧1つになる前の ID（耐火のマント・耐氷のマント・光の衣・闇の衣）を、同じ段階の鎧に変える。
 * あわせて、その属性の指輪（段階は半分に切り上げ。1段目と2段目は1段目の指輪）を gifts に集める（買ったものが無駄にならないように）
 */
function migrateOld(list: unknown, gifts: ItemId[]): unknown[] {
  if (!Array.isArray(list)) return [];
  const element = { fire_cloak: 'fire', ice_cloak: 'ice', light_robe: 'light', dark_robe: 'dark' } as const;
  return list.map((raw) => {
    const m = typeof raw === 'string' ? /^(fire_cloak|ice_cloak|light_robe|dark_robe)(?:_(\d+))?$/.exec(raw) : null;
    if (!m) return raw;
    const tier = m[2] ? Number(m[2]) : 1;
    gifts.push(ringId(element[m[1] as keyof typeof element], Math.ceil(tier / 2)));
    return tier <= 1 ? 'plate' : `plate_${tier}`;
  });
}
