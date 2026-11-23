// 敵の弱点（docs/enemy-weakness.md）。敵の体質・属性・物理と魔法の倍率から、効く武器・効く属性・効きにくいものを決める。
// 探索の画面（敵の頭上の印）と、敵の図鑑で使う。相性の数字は data.ts の WEAPON_VS_BODY（武器と体質）と ENCHANT_VS_ELEMENT（属性と属性）

import { BODY_NAMES, ENCHANT_VS_ELEMENT, WEAPON_VS_BODY } from './data';
import type { Body, Element, EnemyDef, WeaponType } from './types';

export const WEAPON_TYPES: readonly WeaponType[] = ['sword', 'hammer', 'staff'];
/** 攻撃に乗せられる属性（砥石・刻印の残響・呪文） */
export const ATTACK_ELEMENTS: readonly Element[] = ['fire', 'ice', 'light', 'dark'];

export const WEAPON_TYPE_NAMES: Record<WeaponType, string> = { sword: '剣', hammer: '槌', staff: '杖' };
export const ELEMENT_NAMES: Record<Element, string> = { fire: '炎', ice: '氷', neutral: '無属性', light: '光', dark: '闇' };
/** 印に使う1文字 */
export const ELEMENT_MARKS: Record<Element, string> = { fire: '炎', ice: '氷', neutral: '無', light: '光', dark: '闇' };
export const BODY_LABELS: Record<Body, string> = BODY_NAMES;

/** 相性の1つ（何が・何倍か） */
export interface Affinity<T> {
  id: T;
  rate: number;
}

export interface FoeWeakness {
  weapons: Affinity<WeaponType>[]; // よく効く武器（1倍より大きい。大きい順）
  resistWeapons: Affinity<WeaponType>[]; // 効きにくい武器（1倍より小さい。小さい順）
  elements: Affinity<Element>[]; // よく効く属性（大きい順）
  resistElements: Affinity<Element>[]; // 効きにくい属性（小さい順）
  physical: number; // 武器で殴られたときの倍率（1：ふつう）
  magic: number; // 呪文を受けたときの倍率（1：ふつう）
}

const byRate = <T>(list: Affinity<T>[], dir: 1 | -1) => [...list].sort((a, b) => (b.rate - a.rate) * dir);

/** 敵の弱点と、効きにくいもの */
export function weaknessOf(def: Pick<EnemyDef, 'element' | 'body' | 'physical' | 'magic'>): FoeWeakness {
  const weapons = WEAPON_TYPES.map((id) => ({ id, rate: WEAPON_VS_BODY[id][def.body] }));
  const elements = ATTACK_ELEMENTS.map((id) => ({ id, rate: ENCHANT_VS_ELEMENT[id][def.element] ?? 1 }));
  return {
    weapons: byRate(weapons.filter((w) => w.rate > 1), 1),
    resistWeapons: byRate(weapons.filter((w) => w.rate < 1), -1),
    elements: byRate(elements.filter((e) => e.rate > 1), 1),
    resistElements: byRate(elements.filter((e) => e.rate < 1), -1),
    physical: def.physical ?? 1,
    magic: def.magic ?? 1,
  };
}

/** 頭上の印の1つ。kind ごとに色を変える */
export interface WeakMark {
  kind: 'weapon' | 'element' | 'magic' | 'physical';
  text: string; // 1文字
  element?: Element; // kind が element のとき
}

/**
 * 敵の頭上に出す弱点の印（左から：いちばん効く武器、いちばん効く属性、魔法か物理に弱ければその印）。
 * 弱点がなければ空
 */
export function weakMarks(def: Pick<EnemyDef, 'element' | 'body' | 'physical' | 'magic'>): WeakMark[] {
  const w = weaknessOf(def);
  const out: WeakMark[] = [];
  const weapon = w.weapons[0];
  if (weapon) out.push({ kind: 'weapon', text: WEAPON_TYPE_NAMES[weapon.id] });
  const element = w.elements[0];
  if (element) out.push({ kind: 'element', text: ELEMENT_MARKS[element.id], element: element.id });
  if (w.magic > 1 && w.magic > w.physical) out.push({ kind: 'magic', text: '魔' });
  else if (w.physical > 1 && w.physical > w.magic) out.push({ kind: 'physical', text: '物' });
  return out;
}

/** 倍率を「×1.5」のように短く書く */
export const rateText = (rate: number): string => `×${Number(rate.toFixed(2))}`;

/** 弱点を1行の文にする（図鑑や読み上げ用）。例：「槌×1.5・氷×2がよく効く」 */
export function weaknessLine(w: FoeWeakness): string {
  const good = [
    ...w.weapons.map((x) => `${WEAPON_TYPE_NAMES[x.id]}${rateText(x.rate)}`),
    ...w.elements.map((x) => `${ELEMENT_NAMES[x.id]}${rateText(x.rate)}`),
    ...(w.magic > 1 ? [`魔法${rateText(w.magic)}`] : []),
    ...(w.physical > 1 ? [`武器の攻撃${rateText(w.physical)}`] : []),
  ];
  return good.length ? `${good.join('・')}がよく効く` : 'とくに弱点はない';
}

/** 効きにくいものを1行の文にする。例：「剣×0.6・炎×0.5が効きにくい」 */
export function resistLine(w: FoeWeakness): string {
  const bad = [
    ...w.resistWeapons.map((x) => `${WEAPON_TYPE_NAMES[x.id]}${rateText(x.rate)}`),
    ...w.resistElements.map((x) => `${ELEMENT_NAMES[x.id]}${rateText(x.rate)}`),
    ...(w.magic < 1 ? [`魔法${rateText(w.magic)}`] : []),
    ...(w.physical < 1 ? [`武器の攻撃${rateText(w.physical)}`] : []),
  ];
  return bad.length ? `${bad.join('・')}が効きにくい` : '効きにくいものはない';
}
