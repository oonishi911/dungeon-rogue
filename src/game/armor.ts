// 防具の種類ごとの働き（守りと魔力の数字は items.json。ここは種類で決まる働き。docs/ring-spec.md の「防具の種類」）
// ・鎧：守りがいちばん高い（ほかの働きはない）
// ・法衣：守りは低いが、段階ごとの魔力（魔法の強さに足される。magic.ts の magicPower）と、魔力の回復が速い（recoverMagic）
// ・毛皮の外套：鈍足にならない（敵の攻撃でも、霜の床でも）。満腹度が減りにくく（行動のうち決まった割合で減らない）、空腹の攻撃で減る満腹度も少ない

import { ITEMS } from './data';
import type { ArmorType, ItemId } from './types';

export const ARMOR_CONFIG = {
  robe: { regenRate: 0.6 }, // 法衣：魔力が1回復するまでの行動数に掛ける倍率（ダンジョンの設定 regenEvery × これ。小さいほど速い。1行動より短くはならない）
  cloak: { saving: 25, hungerRate: 0.5 }, // 毛皮の外套：満腹度が減らない行動の割合（%。ぬくもりの残響と足す）・空腹の攻撃で減る満腹度に掛ける倍率
} as const;

/** 装備している防具の種類（防具がなければ null） */
export function armorTypeOf(armor: ItemId | null | undefined): ArmorType | null {
  const effect = armor ? ITEMS[armor].effect : null;
  return effect?.kind === 'armor' ? effect.armor : null;
}

/** 防具の魔力（法衣の段階ごとの設定 items.json の mag）。防具がなければ0 */
export function armorMagic(armor: ItemId | null | undefined): number {
  const effect = armor ? ITEMS[armor].effect : null;
  return effect?.kind === 'armor' ? effect.mag : 0;
}

/** 魔力が1回復するまでの行動数（regenEvery はダンジョンの設定）。法衣なら短くなる */
export function regenInterval(regenEvery: number, armor: ItemId | null | undefined): number {
  return armorTypeOf(armor) === 'robe' ? Math.max(1, Math.round(regenEvery * ARMOR_CONFIG.robe.regenRate)) : regenEvery;
}

/** 鈍足にならないか（毛皮の外套） */
export const resistsChill = (armor: ItemId | null | undefined): boolean => armorTypeOf(armor) === 'cloak';

/** 防具で満腹度が減らない行動の割合（%。毛皮の外套） */
export const armorSaving = (armor: ItemId | null | undefined): number => (armorTypeOf(armor) === 'cloak' ? ARMOR_CONFIG.cloak.saving : 0);

/** 空腹の攻撃で減る満腹度（amount は設定の量）。毛皮の外套なら少なくなる（1より少なくはならない） */
export function hungerLoss(amount: number, armor: ItemId | null | undefined): number {
  return armorTypeOf(armor) === 'cloak' ? Math.max(1, Math.round(amount * ARMOR_CONFIG.cloak.hungerRate)) : amount;
}
