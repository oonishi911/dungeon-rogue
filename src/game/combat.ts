// 戦闘の計算：持ち物からプレイヤーの能力を作り、攻撃1回のダメージを求める。
// 持っていく装備（武器と体質の相性、防具と属性の相性）がダメージ計算に直接効く。
// 戦闘の進行（誰がいつ攻撃するか）は explore.ts にある。

import { COMBAT_CONFIG as C, ELEMENT_COMPONENTS, ENCHANT_VS_ELEMENT, ITEMS, WEAPON_VS_BODY } from './data';
import type { ElementComponent, EnemyDef, ItemDef, ItemId, ItemSlot, PlayerStats } from './types';

export function itemSlot(item: ItemDef): ItemSlot {
  switch (item.effect.kind) {
    case 'weapon':
      return 'weapon';
    case 'armor':
      return 'armor';
    case 'heal':
    case 'food':
    case 'enchant':
      return 'consumable';
    case 'spellbook':
      return 'spellbook';
    default: {
      const unreachable: never = item.effect;
      return unreachable;
    }
  }
}

/** 持ち込んだアイテムからプレイヤーの能力を作る。武器・防具は1つずつ装備する */
export function buildPlayer(loadout: readonly ItemId[]): PlayerStats {
  const weapon = loadout.find((id) => itemSlot(ITEMS[id]) === 'weapon') ?? null;
  const armor = loadout.find((id) => itemSlot(ITEMS[id]) === 'armor') ?? null;
  return {
    hp: C.playerHp,
    maxHp: C.playerHp,
    atk: C.playerAtk + (weapon ? C.weaponAtk : 0),
    def: C.playerDef,
    poisonTurns: 0,
    weapon,
    armor,
    items: loadout.filter((id) => itemSlot(ITEMS[id]) === 'consumable'),
    enchant: null,
  };
}

/**
 * 敵の攻撃1回でプレイヤーが受けるダメージ。
 * 複合属性（光・闇）は成分ごとに半分ずつ分け、防具はそれぞれの成分に別々に効く。
 * 専用防具（光の衣・闇の衣）は、その属性の攻撃を丸ごと軽減する。
 */
export function enemyHitDamage(player: PlayerStats, enemy: EnemyDef): number {
  const base = Math.max(1, enemy.atk - player.def);
  const effect = player.armor ? ITEMS[player.armor].effect : null;
  const guard = effect?.kind === 'armor' ? effect.guard : null;

  if (guard?.kind === 'whole') {
    return Math.max(1, Math.ceil(base * (guard.element === enemy.element ? guard.rate : 1)));
  }
  let total = 0;
  for (const [component, share] of Object.entries(ELEMENT_COMPONENTS[enemy.element]) as [ElementComponent, number][]) {
    const rate = guard?.kind === 'component' && guard.component === component ? guard.rate : 1;
    total += base * share * rate;
  }
  return Math.max(1, Math.ceil(total));
}

/** プレイヤーの攻撃1回で敵が受けるダメージ。武器と体質、付けた属性と敵の属性の相性で増減する */
export function playerHitDamage(player: PlayerStats, enemy: EnemyDef): number {
  const base = Math.max(1, player.atk - enemy.def);
  return Math.max(1, Math.round(base * bodyMultiplier(player, enemy) * enchantMultiplier(player, enemy)));
}

export function bodyMultiplier(player: PlayerStats, enemy: EnemyDef): number {
  const effect = player.weapon ? ITEMS[player.weapon].effect : null;
  return effect?.kind === 'weapon' ? WEAPON_VS_BODY[effect.weapon][enemy.body] : 1;
}

export function enchantMultiplier(player: PlayerStats, enemy: EnemyDef): number {
  if (!player.enchant) return 1;
  return ENCHANT_VS_ELEMENT[player.enchant.element][enemy.element] ?? 1;
}
