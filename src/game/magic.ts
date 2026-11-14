// 魔法の計算：呪文書から決まる魔力、魔法の強さ、呪文のダメージ、属性の相性。状態は変えず、数を求めるだけ。

import { ENCHANT_VS_ELEMENT, ITEMS, SPELLS } from './data';
import type { Affinity } from './exploreTypes';
import type { GenSettings, MagicSettings } from './genMaster';
import type { EnemyDef, ItemId, PlayerStats, SpellId } from './types';

/** 持ってきた呪文書から、唱えられる呪文と魔力を決める。呪文書がなければ魔力も0（魔力の棒も出さない） */
export function startMagic(loadout: readonly ItemId[], M: MagicSettings): { spells: SpellId[]; mp: number; maxMp: number } {
  const spells = loadout.flatMap((id) => {
    const effect = ITEMS[id].effect;
    return effect.kind === 'spellbook' ? [effect.spell] : [];
  });
  if (spells.length === 0) return { spells: [], mp: 0, maxMp: 0 };
  const staff = loadout.some(isStaff);
  const maxMp = M.maxMp + (staff ? M.staffMp : 0);
  return { spells: [...new Set(spells)], mp: maxMp, maxMp };
}

/** 魔法の強さ（M はダンジョンの設定の魔法）。杖を持っていると強くなる */
export function magicPower(stats: PlayerStats, M: MagicSettings): number {
  return M.power * (stats.weapon && isStaff(stats.weapon) ? M.staffPower : 1);
}

export function isStaff(id: ItemId): boolean {
  const effect = ITEMS[id].effect;
  return effect.kind === 'weapon' && effect.weapon === 'staff';
}

/** 呪文のダメージ（settings はダンジョンの設定の魔法と呪文。敵の防御は無視する。属性の矢は、属性の相性で増減する） */
export function spellDamage(stats: PlayerStats, spell: SpellId, enemy: EnemyDef, settings: Pick<GenSettings, 'magic' | 'spells'>): number {
  const rate = settings.spells[spell].power ?? 1;
  return Math.max(1, Math.round(magicPower(stats, settings.magic) * rate * spellElementRate(spell, enemy)));
}

/** 属性の矢の、敵への相性の倍率（矢でなければ1） */
export function spellElementRate(spell: SpellId, enemy: EnemyDef): number {
  const effect = SPELLS[spell].effect;
  return effect.kind === 'bolt' ? (ENCHANT_VS_ELEMENT[effect.element][enemy.element] ?? 1) : 1;
}

/** 属性の矢と敵の相性（演出用） */
export function spellAffinity(spell: SpellId, enemy: EnemyDef): Affinity {
  const rate = spellElementRate(spell, enemy);
  return rate > 1 ? 'weak' : rate < 1 ? 'resist' : 'normal';
}
