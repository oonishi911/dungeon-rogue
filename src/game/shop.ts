// 店（出発の準備）のルール。ダンジョンを選んだあと、貯めた金貨で品物を買い、持っていくものを選んで出発する。
// - 金貨は最初は0。ダンジョンで持ち帰った金貨が貯まっていく（足りなくなっても補わない）
// - 武器・防具・呪文書は、一度買えばずっと使える（owned）。出発のたびに、武器1つ・防具1つ・呪文書を選ぶ
// - 道具（回復薬など）は倉庫（stock）に入り、出発のたびに持っていく数を選ぶ。使わずに残った道具は、持ち帰って倉庫に戻る
// - 武器と防具は種類ごとに10段階。店に並ぶのは、店に入ったときに持っていたいちばん上の段階の2つ上まで（持っていなければ2段目まで）。
//   店で上の段階を買っても、並びはその場では広がらず、次に潜るときの店で広がる
// ほかのロジックと同じく、状態を受け取り新しい状態を返す純粋関数でできている。

import { enemyHitDamage, itemSlot } from './combat';
import { ENCHANT_VS_ELEMENT, ITEMS, LOADOUT_CONFIG, SPELLS, WEAPON_VS_BODY } from './data';
import type { Intel } from './informant';
import { ARMOR_BASES, GEAR_TIERS, gearId, gearOf, SPELLBOOK_IDS, SUPPLY_IDS, WEAPON_BASES } from './itemMaster';
import type { SaveData } from './save';
import type { Body, Element, EnemyDef, GearBaseId, ItemId, Result, SpellId } from './types';

export type Shelf = 'weapon' | 'armor' | 'supply' | 'book';

export const SHELVES: readonly { id: Shelf; name: string }[] = [
  { id: 'weapon', name: '武器' },
  { id: 'armor', name: '防具' },
  { id: 'supply', name: '道具' },
  { id: 'book', name: '呪文書' },
];

/** 店に、持っている段階の何段上まで並べるか */
export const SHOP_AHEAD = 2;

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T>(error: string): Result<T> => ({ ok: false, error });

/** その品物の売り場 */
export function shelfOf(id: ItemId): Shelf {
  const slot = itemSlot(ITEMS[id]);
  return slot === 'consumable' ? 'supply' : slot === 'spellbook' ? 'book' : slot;
}

/** その種類で持っている、いちばん上の段階（持っていなければ0） */
export function bestTier(owned: readonly ItemId[], base: GearBaseId): number {
  return owned.reduce((best, id) => {
    const g = gearOf(id);
    return g && g.base === base ? Math.max(best, g.tier) : best;
  }, 0);
}

/**
 * 売り場に並べる品物。武器と防具は、種類ごとに「持っているいちばん上の段階」と、その2つ上まで
 * （それより下の段階は、持っていても弱いだけなので並べない）
 */
export function shelfItems(owned: readonly ItemId[], shelf: Shelf): ItemId[] {
  if (shelf === 'supply') return [...SUPPLY_IDS];
  if (shelf === 'book') return [...SPELLBOOK_IDS];
  const bases: readonly GearBaseId[] = shelf === 'weapon' ? WEAPON_BASES : ARMOR_BASES;
  return bases.flatMap((base) => {
    const best = bestTier(owned, base);
    const from = Math.max(1, best);
    const to = Math.min(GEAR_TIERS, Math.max(best, 0) + SHOP_AHEAD);
    return Array.from({ length: to - from + 1 }, (_, i) => gearId(base, from + i));
  });
}

/** 店に並んでいるか（並んでいない段階は買えない）。atEntry：店に入ったときに持っていたもの */
const onShelf = (atEntry: readonly ItemId[], id: ItemId) => shelfItems(atEntry, shelfOf(id)).includes(id);

/**
 * 買う。武器・防具は買うとすぐ装備し、呪文書・道具は持っていく数に余りがあれば、持っていくものに入れる。
 * atEntry は店に入ったときに持っていたもの（店の並びは、これで決まる。省略すると今持っているもの）
 */
export function buy(save: SaveData, id: ItemId, atEntry: readonly ItemId[] = save.owned): Result<SaveData> {
  const item = ITEMS[id];
  const shelf = shelfOf(id);
  if (!onShelf(atEntry, id)) return err('まだ店に並んでいない');
  if (shelf !== 'supply' && save.owned.includes(id)) return err('もう持っている');
  if (item.price > save.gold) return err('金貨が足りない');
  const gold = save.gold - item.price;
  const kit = { ...save.kit };
  if (shelf === 'supply') {
    if (kit.take.length < LOADOUT_CONFIG.maxItems) kit.take = [...kit.take, id];
    return ok({ ...save, gold, stock: [...save.stock, id], kit });
  }
  if (shelf === 'weapon') kit.weapon = id;
  if (shelf === 'armor') kit.armor = id;
  if (shelf === 'book' && kit.books.length < LOADOUT_CONFIG.maxSpellbooks) kit.books = [...kit.books, id];
  return ok({ ...save, gold, owned: [...save.owned, id], kit });
}

/** 武器・防具を装備する（null で外す）。持っているものだけ */
export function equip(save: SaveData, slot: 'weapon' | 'armor', id: ItemId | null): Result<SaveData> {
  if (id !== null && (!save.owned.includes(id) || shelfOf(id) !== slot)) return err('持っていない');
  return ok({ ...save, kit: { ...save.kit, [slot]: id } });
}

/** 呪文書を持っていく・外す */
export function toggleBook(save: SaveData, id: ItemId): Result<SaveData> {
  const { books } = save.kit;
  if (books.includes(id)) return ok({ ...save, kit: { ...save.kit, books: books.filter((b) => b !== id) } });
  if (!save.owned.includes(id) || shelfOf(id) !== 'book') return err('持っていない');
  if (books.length >= LOADOUT_CONFIG.maxSpellbooks) return err(`呪文書は${LOADOUT_CONFIG.maxSpellbooks}冊まで`);
  return ok({ ...save, kit: { ...save.kit, books: [...books, id] } });
}

/** 倉庫の道具を、1つ持っていく（delta=1）・1つ戻す（delta=-1） */
export function takeSupply(save: SaveData, id: ItemId, delta: 1 | -1): Result<SaveData> {
  const { take } = save.kit;
  if (delta < 0) {
    const i = take.lastIndexOf(id);
    if (i < 0) return err('持っていかない');
    return ok({ ...save, kit: { ...save.kit, take: take.filter((_, j) => j !== i) } });
  }
  if (count(take, id) >= count(save.stock, id)) return err('倉庫にもうない');
  if (take.length >= LOADOUT_CONFIG.maxItems) return err(`道具は${LOADOUT_CONFIG.maxItems}つまで`);
  return ok({ ...save, kit: { ...save.kit, take: [...take, id] } });
}

export const count = (list: readonly ItemId[], id: ItemId): number => list.filter((x) => x === id).length;

/** 持っていくもの（探索の持ち物） */
export function kitLoadout(save: SaveData): ItemId[] {
  const { weapon, armor, books, take } = save.kit;
  return [...(weapon ? [weapon] : []), ...(armor ? [armor] : []), ...books, ...take];
}

/** 出発する：持っていく道具を倉庫から出す（選んだ持ち物は、次の店でも同じ選び方から始めるよう残す） */
export function departWith(save: SaveData): SaveData {
  const stock = [...save.stock];
  for (const id of save.kit.take) {
    const i = stock.indexOf(id);
    if (i >= 0) stock.splice(i, 1);
  }
  return { ...save, stock };
}

/**
 * 探索から戻ったとき：持ち帰った金貨を貯め、使わなかった道具（ダンジョンで拾ったものも）を倉庫に戻す。
 * 次に持っていく道具の数は、倉庫にある分までに減らす
 */
export function returnWith(save: SaveData, goldBrought: number, leftovers: readonly ItemId[]): SaveData {
  const stock = [...save.stock, ...leftovers.filter((id) => shelfOf(id) === 'supply')];
  return fitKit({ ...save, gold: save.gold + goldBrought, stock });
}

/** 持っていく道具を、倉庫にある数と、持てる数までに減らす（店を開くとき・探索から戻ったとき） */
export function fitKit(save: SaveData): SaveData {
  const left = [...save.stock];
  const take = save.kit.take
    .filter((id) => {
      const i = left.indexOf(id);
      if (i < 0) return false;
      left.splice(i, 1);
      return true;
    })
    .slice(0, LOADOUT_CONFIG.maxItems);
  return { ...save, kit: { ...save.kit, take } };
}

// ===== おすすめの印 =====

/** その属性の攻撃を受けたときの、防具ごとの受けるダメージの割合（1段目の防具で比べる。守り（def）は入れない） */
function guardRate(armor: ItemId, element: Element): number {
  const probe = { id: 'probe', name: '', hp: 1, atk: 100, def: 0, element, body: 'normal' } as EnemyDef;
  const player = { hp: 1, maxHp: 1, atk: 0, def: 0, poisonTurns: 0, weapon: null, armor, items: [], enchant: null };
  return enemyHitDamage(player, probe) / 100;
}

/**
 * 情報屋からはっきり聞いたこと（うわさは使わない）から、店で「おすすめ」の印を付ける品物。
 * - 属性（ダンジョン・ボス）がわかれば：その属性の攻撃をいちばん減らす防具の種類（すべての段階）、その属性によく効く砥石・聖水・香油と、属性の矢の呪文書
 * - 体（多い魔物・ボス）がわかれば：その体によく効く武器の種類（すべての段階）
 */
export function recommended(intel: readonly Intel[]): Set<ItemId> {
  const elements = new Set<Element>();
  const bodies = new Set<Body>();
  for (const h of intel) {
    if (h.vague) continue;
    if (h.element) elements.add(h.element);
    if (h.body) bodies.add(h.body);
  }
  const picks = new Set<ItemId>();
  const allTiers = (base: GearBaseId) => {
    for (let t = 1; t <= GEAR_TIERS; t++) picks.add(gearId(base, t));
  };
  for (const body of bodies) {
    for (const w of WEAPON_BASES) if (WEAPON_VS_BODY[w][body] > 1) allTiers(w);
  }
  for (const element of elements) {
    const rates = ARMOR_BASES.map((a) => [a, guardRate(a, element)] as const);
    const best = Math.min(...rates.map(([, r]) => r));
    if (best < 1) for (const [a, r] of rates) if (r === best) allTiers(a);
    for (const id of [...SUPPLY_IDS, ...SPELLBOOK_IDS] as ItemId[]) {
      const effect = ITEMS[id].effect;
      const strike = effect.kind === 'enchant' ? effect.element : effect.kind === 'spellbook' ? boltElement(effect.spell) : null;
      if (strike && (ENCHANT_VS_ELEMENT[strike][element] ?? 1) > 1) picks.add(id);
    }
  }
  return picks;
}

/** 属性の矢の呪文の属性（矢でなければ null） */
function boltElement(spell: SpellId): Element | null {
  const effect = SPELLS[spell].effect;
  return effect.kind === 'bolt' ? effect.element : null;
}
