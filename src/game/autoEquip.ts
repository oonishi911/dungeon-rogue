// 情報屋の話から、持っているものの中で「おすすめの装備」を選ぶ（店の装備の画面の「おすすめを装備する」。2026-11-23）。
// 使うのは、はっきり聞いたこと（うわさは使わない）：ダンジョン・ボスの属性、多い魔物・ボスの体、多い魔物の弱点（魔法か物理か）。
// 選び方（買わない。持っているもの・倉庫にあるものから）：
// ・武器：聞いた体によく効く種類（魔法に弱い魔物が多いなら杖、物理なら剣・槌を少し優先）。同じなら攻撃力の高いもの。何も聞いていなければ、今の武器のまま
// ・サブ武器：メインがよく効かない体があり、その体によく効く別の種類の武器を持っていれば、サブにする（道具の枠が1つ減る）
// ・防具：氷の属性と聞いたら毛皮の外套（鈍足にならない）、杖をメインにするなら法衣、ほかは守りがいちばん高いもの
// ・指輪：聞いた属性に耐える指輪（2つの属性を聞いていて、両方に耐える二重耐性の指輪があれば、それを先に）。属性を聞いていなければ万能の指輪
// ・呪文書：聞いた属性によく効く属性の矢（連矢を先に）→ 癒し → 虹の扇・雷の鎖（どの属性にも同じに効く）→ 魔力の盾・再生・解呪 → 今持っていくもの → ほか
// ・道具：大きな袋 → 聞いた属性によく効く砥石・聖水・香油（1つずつ）→ 万能薬1 → 食料2 → 回復薬で埋める → 残りは食料・ほかの道具
// ほかのロジックと同じく、状態を受け取り新しい状態を返す純粋関数でできている。

import { weaponTypeOf } from './combat';
import { BODY_NAMES, ENCHANT_VS_ELEMENT, ITEMS, LOADOUT_CONFIG, SPELLS, TRAITS, WEAPON_VS_BODY } from './data';
import type { Intel } from './informant';
import { ringOf } from './itemMaster';
import { fingers, fitRingList } from './ring';
import type { SaveData } from './save';
import { count, equip, equipSub, ownedOn, takeSupply, toggleBook } from './shop';
import type { Body, Element, ItemId, Result, SpellId } from './types';

export interface AutoEquip {
  save: SaveData;
  notes: string[]; // 何をなぜ選んだか（画面に出す短い説明）
}

/** はっきり聞いたことのまとめ */
interface Facts {
  elements: Element[];
  bodies: Body[];
  weakness: 'magic' | 'physical' | null;
}

export function factsOf(intel: readonly Intel[]): Facts {
  const elements: Element[] = [];
  const bodies: Body[] = [];
  let weakness: Facts['weakness'] = null;
  for (const h of intel) {
    if (h.vague) continue;
    if (h.element && !elements.includes(h.element)) elements.push(h.element);
    if (h.body && !bodies.includes(h.body)) bodies.push(h.body);
    if (h.weakness === 'magic' || h.weakness === 'physical') weakness = h.weakness;
  }
  return { elements, bodies, weakness };
}

const effectOf = (id: ItemId) => ITEMS[id].effect;
const atkOf = (id: ItemId) => {
  const e = effectOf(id);
  return e.kind === 'weapon' ? e.atk + e.mag * 0.5 : 0;
};
const defOf = (id: ItemId) => {
  const e = effectOf(id);
  return e.kind === 'armor' ? e.def : 0;
};
const armorType = (id: ItemId) => {
  const e = effectOf(id);
  return e.kind === 'armor' ? e.armor : null;
};
/** 武器の、聞いた体へのいちばんの効き（体を聞いていなければ1） */
const bestRate = (id: ItemId, bodies: readonly Body[]) => {
  const type = weaponTypeOf(id);
  if (!type || bodies.length === 0) return 1;
  return Math.max(...bodies.map((b) => WEAPON_VS_BODY[type][b]));
};
/** 呪文の、聞いた属性へのいちばんの効き（属性の矢でなければ null） */
const boltRate = (spell: SpellId, elements: readonly Element[]) => {
  const effect = SPELLS[spell].effect;
  if (effect.kind !== 'bolt' || elements.length === 0) return null;
  return Math.max(...elements.map((el) => ENCHANT_VS_ELEMENT[effect.element][el] ?? 1));
};
const spellOf = (id: ItemId): SpellId | null => {
  const e = effectOf(id);
  return e.kind === 'spellbook' ? e.spell : null;
};
const must = (r: Result<SaveData>, fallback: SaveData) => (r.ok ? r.value : fallback);
const name = (id: ItemId) => ITEMS[id].name;
const elName = (el: Element) => TRAITS[el].name;

/** 情報屋の話から、持っているものでおすすめの装備にする */
export function equipForIntel(save: SaveData, intel: readonly Intel[]): AutoEquip {
  const facts = factsOf(intel);
  const notes: string[] = [];
  const known = facts.elements.length > 0 || facts.bodies.length > 0 || facts.weakness !== null;
  if (!known) notes.push('情報屋から、はっきり聞いたことがない。いつも使えるものを選んだ');
  let s: SaveData = { ...save, kit: { ...save.kit, books: [], take: [] } };
  const { weapon2: _sub, ...noSub } = s.kit;
  s = { ...s, kit: noSub };

  // ===== 武器 =====
  const weapons = ownedOn(save, 'weapon');
  const lean = (id: ItemId) => {
    const t = weaponTypeOf(id);
    if (facts.weakness === 'magic') return t === 'staff' ? 0.5 : 0;
    if (facts.weakness === 'physical') return t === 'staff' ? 0 : 0.3;
    return 0;
  };
  const score = (id: ItemId) => bestRate(id, facts.bodies) + lean(id);
  let main: ItemId | null = save.kit.weapon;
  if (weapons.length > 0 && (known || !main)) {
    main = [...weapons].sort((a, b) => score(b) - score(a) || atkOf(b) - atkOf(a) || weapons.indexOf(b) - weapons.indexOf(a))[0]!;
  }
  if (main && main !== save.kit.weapon) {
    s = must(equip(s, 'weapon', main), s);
    const good = facts.bodies.filter((b) => WEAPON_VS_BODY[weaponTypeOf(main!)!][b] > 1).map((b) => BODY_NAMES[b]);
    notes.push(`武器：${name(main)}${good.length ? `（${good.join('・')}によく効く）` : facts.weakness === 'magic' && weaponTypeOf(main) === 'staff' ? '（魔法に弱い魔物が多い）' : ''}`);
  } else if (main) {
    s = { ...s, kit: { ...s.kit, weapon: main } };
  }
  // サブ武器：メインがよく効かない体に、よく効く別の種類
  if (main) {
    const missed = facts.bodies.filter((b) => WEAPON_VS_BODY[weaponTypeOf(main!)!][b] <= 1);
    const sub = weapons
      .filter((w) => weaponTypeOf(w) !== weaponTypeOf(main) && missed.some((b) => WEAPON_VS_BODY[weaponTypeOf(w)!][b] > 1))
      .sort((a, b) => atkOf(b) - atkOf(a))[0];
    if (sub) {
      const r = equipSub(s, sub);
      if (r.ok) {
        s = r.value;
        const good = missed.filter((b) => WEAPON_VS_BODY[weaponTypeOf(sub)!][b] > 1).map((b) => BODY_NAMES[b]);
        notes.push(`サブ武器：${name(sub)}（${good.join('・')}によく効く。道具の枠が1つ減る）`);
      }
    }
  }

  // ===== 防具 =====
  const armors = ownedOn(save, 'armor');
  // 守りが同じなら、段階の高い方（持っているものは品物の並び順＝段階の低い順）
  const byDef = (a: ItemId, b: ItemId) => defOf(b) - defOf(a) || armors.indexOf(b) - armors.indexOf(a);
  const bestOf = (type: string) => armors.filter((a) => armorType(a) === type).sort(byDef)[0];
  let armor: ItemId | undefined;
  let why = '';
  if (facts.elements.includes('ice') && bestOf('cloak')) {
    armor = bestOf('cloak');
    why = '氷の属性。鈍足にならない';
  } else if (main && weaponTypeOf(main) === 'staff' && bestOf('robe')) {
    armor = bestOf('robe');
    why = '杖で魔法を使う';
  } else {
    armor = [...armors].sort(byDef)[0];
    why = '守りがいちばん高い';
  }
  if (armor) {
    if (armor !== save.kit.armor) notes.push(`防具：${name(armor)}（${why}）`);
    s = must(equip(s, 'armor', armor), s);
  }

  // ===== 指輪 =====
  const rings = ownedOn(save, 'ring');
  const level = (id: ItemId) => ringOf(id)?.level ?? 0;
  const covers = (id: ItemId): Element[] => {
    const r = ringOf(id);
    if (!r) return [];
    if (r.kind === 'dual') return (r.pair as string).split('_') as Element[];
    return r.kind === 'all' ? [] : [r.kind as Element];
  };
  const picked: ItemId[] = [];
  if (facts.elements.length > 0) {
    // 両方の属性に耐える二重耐性の指輪を先に、次に1つの属性に耐える指輪（段階の高いもの）
    const duals = rings.filter((r) => covers(r).length === 2 && covers(r).every((el) => facts.elements.includes(el))).sort((a, b) => level(b) - level(a));
    picked.push(...duals);
    for (const el of facts.elements) {
      const best = rings.filter((r) => ringOf(r)?.kind === el).sort((a, b) => level(b) - level(a))[0];
      if (best) picked.push(best);
    }
  }
  const all = rings.filter((r) => ringOf(r)?.kind === 'all').sort((a, b) => level(b) - level(a))[0];
  if (all) picked.push(all);
  const ringList = fitRingList(picked, save.owned, fingers(save.memories.length));
  if (ringList.length) {
    s = { ...s, kit: { ...s.kit, rings: ringList } };
    const told = ringList.map((r) => {
      const c = covers(r);
      return `${name(r)}${c.length ? `（${c.map(elName).join('・')}に耐える）` : '（弱点がない）'}`;
    });
    notes.push(`指輪：${told.join('、')}`);
  } else {
    const { rings: _r, ...kit } = s.kit;
    s = { ...s, kit };
  }

  // ===== 呪文書 =====
  const books = ownedOn(save, 'book');
  const rank = (id: ItemId) => {
    const spell = spellOf(id)!;
    const rate = boltRate(spell, facts.elements);
    if (rate !== null && rate > 1) return 0 + (spell.endsWith('_chain') ? 0 : 0.5);
    if (spell === 'heal') return 2;
    if (spell === 'prism_fan' || spell === 'thunder_chain') return 3;
    if (spell === 'ward' || spell === 'regen' || spell === 'cleanse') return 4;
    if (rate !== null && rate < 1) return 9; // 聞いた属性に効きにくい矢は、いちばん後ろ
    if (save.kit.books.includes(id)) return 5;
    return 6;
  };
  const chosen = [...books].sort((a, b) => rank(a) - rank(b)).slice(0, LOADOUT_CONFIG.maxSpellbooks);
  for (const b of chosen) s = must(toggleBook(s, b), s);
  if (chosen.length) {
    const strong = chosen.filter((b) => (boltRate(spellOf(b)!, facts.elements) ?? 1) > 1).map((b) => name(b).replace('の呪文書', ''));
    notes.push(`呪文書：${chosen.map((b) => name(b).replace('の呪文書', '')).join('・')}${strong.length ? `（${strong.join('・')}は${facts.elements.map(elName).join('・')}によく効く）` : ''}`);
  }

  // ===== 道具 =====
  const want: ItemId[] = [];
  const stockOf = (id: ItemId) => count(save.stock, id);
  if (stockOf('bag') > 0) want.push('bag');
  const charms = (['fire_whetstone', 'ice_whetstone', 'holy_water', 'dark_oil'] as ItemId[]).filter((id) => {
    const e = effectOf(id);
    return e.kind === 'enchant' && facts.elements.some((el) => (ENCHANT_VS_ELEMENT[e.element][el] ?? 1) > 1) && stockOf(id) > 0;
  });
  want.push(...charms);
  if (stockOf('panacea') > 0) want.push('panacea');
  for (let i = 0; i < 2; i++) want.push('food');
  for (let i = 0; i < 12; i++) want.push('potion');
  for (let i = 0; i < 6; i++) want.push('food');
  for (const id of ['lantern', 'panacea'] as ItemId[]) want.push(id);
  for (const id of want) {
    if (count(s.kit.take, id) >= stockOf(id)) continue;
    s = must(takeSupply(s, id, 1), s);
  }
  if (s.kit.take.length) {
    const kinds = [...new Set(s.kit.take)].map((id) => `${name(id)}${count(s.kit.take, id) > 1 ? `×${count(s.kit.take, id)}` : ''}`);
    notes.push(`道具：${kinds.join('・')}${charms.length ? `（${charms.map(name).join('・')}は聞いた属性によく効く）` : ''}`);
  }
  return { save: s, notes };
}
