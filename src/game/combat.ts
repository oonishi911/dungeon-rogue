// 戦闘の計算：持ち物からプレイヤーの能力を作り、攻撃1回のダメージを求める。
// 持っていく装備（武器と体質の相性、防具と属性の相性）がダメージ計算に直接効く。
// 戦闘の進行（誰がいつ攻撃するか）は explore.ts にある。

import { COMBAT_CONFIG as C, ELEMENT_COMPONENTS, ENCHANT_VS_ELEMENT, ITEMS, LOADOUT_CONFIG, WEAPON_VS_BODY } from './data';
import { bodyDamageRate, echoAtk, echoMag, imbuedElement } from './echo';
import type { EchoId, ElementComponent, EnemyDef, Guard, ItemDef, ItemId, ItemSlot, PlayerStats, WeaponType } from './types';

export function itemSlot(item: ItemDef): ItemSlot {
  switch (item.effect.kind) {
    case 'weapon':
      return 'weapon';
    case 'armor':
      return 'armor';
    case 'ring':
      return 'ring';
    case 'heal':
    case 'cure':
    case 'food':
    case 'enchant':
    case 'sight': // 店では道具として買い、倉庫から持っていく
    case 'capacity':
      return 'consumable';
    case 'spellbook':
      return 'spellbook';
    default: {
      const unreachable: never = item.effect;
      return unreachable;
    }
  }
}

/** 武器の種類（剣・ハンマー・杖）。武器でなければ null */
export function weaponTypeOf(id: ItemId | null | undefined): WeaponType | null {
  const effect = id ? ITEMS[id]?.effect : null;
  return effect?.kind === 'weapon' ? effect.weapon : null;
}

/** 武器を持ったときに上がる攻撃力（武器の攻撃力と、はめた残響の分） */
export function weaponAtk(weapon: ItemId | null, echoes?: readonly EchoId[]): number {
  const effect = weapon ? ITEMS[weapon].effect : null;
  return (effect?.kind === 'weapon' ? effect.atk : 0) + (weapon ? echoAtk(echoes) : 0);
}

/**
 * 持ち込んだアイテムからプレイヤーの能力を作る。武器は1本目がメイン、メインとちがう種類の2本目がサブ（持ち替えで使う）。防具は1つ、指輪は付けた分だけ装備する。
 * echoes：メインの刻印武器にはめた残響（ない・空なら、残響なし）
 */
export function buildPlayer(loadout: readonly ItemId[], echoes?: readonly EchoId[]): PlayerStats {
  const weapons = loadout.filter((id) => itemSlot(ITEMS[id]) === 'weapon');
  const weapon = weapons[0] ?? null;
  const subId = weapons.find((id) => weaponTypeOf(id) !== weaponTypeOf(weapon)) ?? null;
  const armor = loadout.find((id) => itemSlot(ITEMS[id]) === 'armor') ?? null;
  const a = armor ? ITEMS[armor].effect : null;
  const rings = loadout.filter((id) => itemSlot(ITEMS[id]) === 'ring');
  return {
    hp: C.playerHp,
    maxHp: C.playerHp,
    // 武器は攻撃力を、防具は守りを上げる（段階が上がるほど大きい。品物の設定 items.json）
    atk: C.playerAtk + weaponAtk(weapon, echoes),
    def: C.playerDef + (a?.kind === 'armor' ? a.def : 0),
    mag: weapon ? echoMag(echoes) : 0, // ささやきの残響の分
    poisonTurns: 0,
    weapon,
    ...(subId ? { sub: { weapon: subId, skill: 0 } } : {}),
    armor,
    ...(rings.length ? { rings } : {}),
    // 持っていくだけで効く道具（ランタン・大きな袋）は、ダンジョンでは使わないので持ち物に入れない（持ち帰らず、なくなる）
    items: loadout.filter((id) => itemSlot(ITEMS[id]) === 'consumable' && !isPassive(id)),
    enchant: null,
    ...(weapon && echoes?.length ? { echoes: [...echoes] } : {}),
  };
}

/**
 * 敵の攻撃1回でプレイヤーが受けるダメージ。守り（def）を引いたあと、指輪の耐性と弱点を掛ける。
 * 複合属性（光・闇）は成分ごとに半分ずつ分け、炎・氷・無属性の指輪はそれぞれの成分に別々に効く。
 * 光の指輪・闇の指輪は、その属性の攻撃を丸ごと軽減し（逆の属性の攻撃は丸ごと増える）、万能の指輪はすべてに効く。
 * 指輪が何個あっても、効く指輪の倍率はすべて掛け算
 */
export function enemyHitDamage(player: PlayerStats, enemy: EnemyDef): number {
  const base = Math.max(1, enemy.atk - player.def);
  return Math.max(1, Math.ceil(base * elementRate(player, enemy) - 1e-9));
}

/**
 * その敵の攻撃が、指輪で何倍になるか（1より小さいと耐性、大きいと弱点。指輪がなければ1）。
 * 敵の攻撃のダメージ（enemyHitDamage）と、状態異常のかかりやすさ（status.ts）が、同じ倍率を使う
 */
export function elementRate(player: PlayerStats, enemy: EnemyDef): number {
  const guards: Guard[] = [];
  for (const id of player.rings ?? []) {
    const effect = ITEMS[id]?.effect;
    if (effect?.kind === 'ring') guards.push(...effect.guards);
  }
  if (!guards.length) return 1;
  // 丸ごと効くもの（光・闇の指輪、万能の指輪）は、全体に掛ける
  let whole = 1;
  for (const g of guards) {
    if (g.kind === 'all' || (g.kind === 'whole' && g.element === enemy.element)) whole *= g.rate;
  }
  let total = 0;
  for (const [component, share] of Object.entries(ELEMENT_COMPONENTS[enemy.element]) as [ElementComponent, number][]) {
    let rate = 1;
    for (const g of guards) if (g.kind === 'component' && g.component === component) rate *= g.rate;
    total += share * rate;
  }
  return total * whole;
}

/** プレイヤーの攻撃1回で敵が受けるダメージ。武器と体質、付けた属性と敵の属性の相性、敵の物理の倍率（physical）で増減する */
export function playerHitDamage(player: PlayerStats, enemy: EnemyDef): number {
  const base = Math.max(1, player.atk - enemy.def);
  return Math.max(1, Math.round(base * bodyMultiplier(player, enemy) * enchantMultiplier(player, enemy) * bodyDamageRate(player.echoes, enemy.body) * (enemy.physical ?? 1)));
}

/** 通常攻撃の相性：武器と体質・付けた属性と敵の属性・残響の相性の倍率が、1より大きければ弱点、小さければ効きにくい（演出に使う） */
export function hitAffinity(player: PlayerStats, enemy: EnemyDef): 'weak' | 'resist' | null {
  const rate = bodyMultiplier(player, enemy) * enchantMultiplier(player, enemy) * bodyDamageRate(player.echoes, enemy.body) * (enemy.physical ?? 1);
  return rate > 1.001 ? 'weak' : rate < 0.999 ? 'resist' : null;
}

export function bodyMultiplier(player: PlayerStats, enemy: EnemyDef): number {
  const effect = player.weapon ? ITEMS[player.weapon].effect : null;
  return effect?.kind === 'weapon' ? WEAPON_VS_BODY[effect.weapon][enemy.body] : 1;
}

/** 付けた属性と、敵の属性の相性。砥石などの力が付いていればそちらが先、なければ残響の属性（通常攻撃に付く） */
export function enchantMultiplier(player: PlayerStats, enemy: EnemyDef): number {
  const element = player.enchant?.element ?? imbuedElement(player.echoes);
  if (!element) return 1;
  return ENCHANT_VS_ELEMENT[element][enemy.element] ?? 1;
}

/** 持っていくだけで効く道具か（遠見のランタン・大きな袋）。ダンジョンの持ち物には入らず、探索1回でなくなる */
export function isPassive(id: ItemId): boolean {
  const kind = ITEMS[id].effect.kind;
  return kind === 'sight' || kind === 'capacity';
}

/** 持っていくものから決まる、ダンジョンで道具を持てる数（大きな袋は1つだけ効く） */
export function itemCapacity(loadout: readonly ItemId[]): number {
  const bonus = loadout.reduce((best, id) => {
    const e = ITEMS[id].effect;
    return e.kind === 'capacity' ? Math.max(best, e.slots) : best;
  }, 0);
  // サブ武器（メインとちがう種類の2本目の武器）を持っていくと、道具の枠を使う
  const weapons = loadout.filter((id) => itemSlot(ITEMS[id]) === 'weapon');
  const hasSub = weapons.some((id) => weaponTypeOf(id) !== weaponTypeOf(weapons[0]));
  return LOADOUT_CONFIG.maxItems + bonus - (hasSub ? LOADOUT_CONFIG.subWeaponSlots : 0);
}

/**
 * 持ち替え：手に持っている武器と、サブ武器を入れ替える（武器・残響・技ゲージ。攻撃力は武器の分だけ変わる）。サブ武器がなければ null。
 * skill は今の技ゲージ。入れ替えたあとの技ゲージを返す
 */
export function swapWeapons(stats: PlayerStats, skill: number): { stats: PlayerStats; skill: number } | null {
  const { sub } = stats;
  if (!sub || !stats.weapon) return null;
  const { echoes: heldEchoes, ...rest } = stats;
  const atk = stats.atk - weaponAtk(stats.weapon, heldEchoes) + weaponAtk(sub.weapon, sub.echoes);
  const mag = stats.mag - echoMag(heldEchoes) + echoMag(sub.echoes); // ささやきの残響の分も、持ち替えた武器のものになる
  const held: PlayerStats['sub'] = { weapon: stats.weapon, skill, ...(heldEchoes?.length ? { echoes: heldEchoes } : {}) };
  return {
    stats: { ...rest, atk, mag, weapon: sub.weapon, sub: held!, ...(sub.echoes?.length ? { echoes: sub.echoes } : {}) },
    skill: sub.skill,
  };
}
