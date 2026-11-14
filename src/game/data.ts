import type {
  Body,
  Element,
  ElementComponent,
  EnemyDef,
  EnemyId,
  ItemDef,
  ItemId,
  SpellDef,
  SpellId,
  TraitDef,
  TraitId,
  WeaponType,
} from './types';
import enemyMasterJson from './enemies.json';
import itemsJson from './items.json';
import { itemDefs, parseItemMaster, type ItemMaster } from './itemMaster';
import { enemyDefs, enemyRewards, parseEnemyMaster, type EnemyReward } from './enemyMaster';
import type { GrowthSettings } from './genMaster';

// ===== 持ち物の上限 =====
export const LOADOUT_CONFIG = {
  maxItems: 8, // 道具（消耗品）を持てる数。武器と防具は1つずつ
  maxSpellbooks: 3, // 持っていける呪文書の数（同じ呪文書は1冊まで）
} as const;

export const TRAITS: Record<TraitId, TraitDef> = {
  fire: { id: 'fire', name: '炎' },
  ice: { id: 'ice', name: '氷' },
  neutral: { id: 'neutral', name: '無属性' },
  light: { id: 'light', name: '光' },
  dark: { id: 'dark', name: '闇' },
};

export const TRAIT_IDS: readonly TraitId[] = ['fire', 'ice', 'neutral', 'light', 'dark'];

/** 属性を成分に分解したときの割合。複合属性のダメージは半分ずつに分けて計算する */
export const ELEMENT_COMPONENTS: Record<Element, Partial<Record<ElementComponent, number>>> = {
  fire: { fire: 1 },
  ice: { ice: 1 },
  neutral: { neutral: 1 },
  light: { fire: 0.5, neutral: 0.5 },
  dark: { ice: 0.5, neutral: 0.5 },
};

export const BODY_NAMES: Record<Body, string> = {
  normal: '普通',
  soft: '柔らかい',
  hard: '硬い',
  spirit: '霊体',
};

/** 呪文。強さと使う魔力は、ダンジョンごとの設定（src/game/dungeons/*.json の spells。管理画面で変えられる） */
export const SPELLS: Record<SpellId, SpellDef> = {
  shockwave: { id: 'shockwave', name: '衝撃波', aim: false, effect: { kind: 'shockwave' } },
  sweep: { id: 'sweep', name: 'なぎ払い', aim: true, effect: { kind: 'sweep' } },
  fire_bolt: { id: 'fire_bolt', name: '炎の矢', aim: true, effect: { kind: 'bolt', element: 'fire' } },
  ice_bolt: { id: 'ice_bolt', name: '氷の矢', aim: true, effect: { kind: 'bolt', element: 'ice' } },
  light_lance: { id: 'light_lance', name: '光の槍', aim: true, effect: { kind: 'bolt', element: 'light' } },
  dark_bolt: { id: 'dark_bolt', name: '闇の矢', aim: true, effect: { kind: 'bolt', element: 'dark' } },
  heal: { id: 'heal', name: '癒し', aim: false, effect: { kind: 'heal' } },
  regen: { id: 'regen', name: '再生', aim: false, effect: { kind: 'regen' } },
};

// 数値はすべて仮。遊んでみてバランス調整する
// 品物（名前・値段・武器と防具の段階ごとの性能）は、品物の設定ファイル（src/game/items.json。管理画面の「品物」タブ）にある。
// 品物の働き（回復薬の回復量など）と説明は itemMaster.ts
export const ITEM_MASTER: ItemMaster = parseItemMaster(itemsJson);
export const ITEMS: Record<ItemId, ItemDef> = itemDefs(ITEM_MASTER);

// ===== 戦闘の設定値（仮） =====
export const COMBAT_CONFIG = {
  playerHp: 60,
  playerAtk: 6,
  playerDef: 1,
  poisonDamage: 7, // 毒の1ターンあたりのダメージ（今は毒を与える敵はいない）
} as const;

/** 武器と体質の相性。素手はどの体質にも1倍 */
export const WEAPON_VS_BODY: Record<WeaponType, Record<Body, number>> = {
  sword: { normal: 1, soft: 1.5, hard: 0.6, spirit: 0.25 },
  hammer: { normal: 1, soft: 1, hard: 1.5, spirit: 0.6 },
  staff: { normal: 1, soft: 0.6, hard: 1, spirit: 1.5 },
};

/** 武器に付けた属性と、敵の属性の相性。書いていない組み合わせは1倍 */
export const ENCHANT_VS_ELEMENT: Record<Element, Partial<Record<Element, number>>> = {
  fire: { ice: 2, dark: 1.5, fire: 0.5, light: 0.75 },
  ice: { fire: 2, light: 1.5, ice: 0.5, dark: 0.75 },
  light: { dark: 2, light: 0.5 },
  dark: { light: 2, dark: 0.5 },
  neutral: {},
};

// 敵のマスターデータは src/game/enemies.json にある（開発用の管理画面 ?view=admin から書き換えて公開できる）。
// 攻撃力は自動プレイのバランステスト（balance.test.ts）を満たすように調整している。
// ボス：ダンジョンの属性と体質の傾向に合わせる。動かない。正しい準備で挑んだとき、ボス戦で受ける合計ダメージが
// どのボスでも40前後になるようにそろえている。光のダンジョンは、光の衣で防げない炎・無属性の敵も混ざり道中で消耗するので、
// ボスを少し弱くしている
export const ENEMY_MASTER = parseEnemyMaster(enemyMasterJson);
export const ENEMIES: Record<EnemyId, EnemyDef> = enemyDefs(ENEMY_MASTER);
const ENEMY_REWARDS: Record<EnemyId, EnemyReward> = enemyRewards(ENEMY_MASTER);

/** 倒したときの報酬（enemies.json の reward）。データにない敵なら何も落とさない */
export function enemyReward(id: EnemyId): EnemyReward {
  return ENEMY_REWARDS[id] ?? { gold: 0, exp: 0, drop: 0 };
}

/** 敵の能力（data の値。ボス以外はゲームの中で弱める前の値）。データにない敵の ID ならエラーにする */
export function enemyBase(id: EnemyId): EnemyDef {
  const def = ENEMIES[id];
  if (!def) throw new Error(`敵のデータ（enemies.json）にない敵：${id}`);
  return def;
}

/**
 * ダンジョンごとの有利な装備：その属性に効く防具と、出やすい体質の敵に効く武器。
 * バランステストの「正しい準備」と、開発用画面の ?best=1 で使う（ゲームでは、持ち物は店で買って選ぶ）
 */
export const FAVORABLE_GEAR: Record<TraitId, readonly ItemId[]> = {
  fire: ['sword', 'fire_cloak'],
  ice: ['hammer', 'ice_cloak'],
  neutral: ['hammer', 'plate'],
  light: ['hammer', 'light_robe'],
  dark: ['staff', 'dark_robe'],
};

/** バランステストの「正しい準備」で、有利な装備に足して持たせる道具 */
export const START_SUPPLIES: readonly ItemId[] = ['potion', 'potion'];

/** 有利に働く呪文書を何冊選ぶか（bestLoadout.ts の favorableSpellbooks。開発用・テスト用） */
export const START_SPELLBOOKS = 2;

// ダンジョン特性ごとに出る敵は、ダンジョンの設定ファイル（src/game/dungeons/*.json の encounters）にある。
// 標準のダンジョンでは、その属性の敵が中心で、成分の属性の敵も混ざる。体質にも傾向がある
// （炎：柔らかい、氷：硬い、無属性：混在、光：硬い、闇：霊体）。

// ===== 宝箱と金貨（仮） =====
export const TREASURE_CONFIG = {
  goldPerDepth: 5, // 宝箱の金貨＝本道からの距離×これ
  itemChance: 0.5, // 宝箱に道具が入っている確率
  items: ['potion', 'food', 'fire_whetstone', 'ice_whetstone', 'holy_water', 'dark_oil'] as readonly ItemId[],
  eliteGold: 30, // 強敵を倒すと落とす宝箱に入っている金貨（敵ごとの金貨とは別）
  bossGold: 50, // ボスを倒したときの報酬
  keepOnDefeat: 0.5, // 力尽きたときに持ち帰れる金貨の割合
} as const;

/**
 * 敵を倒したときの報酬と、挑戦のあいだだけのレベル（数値はすべて仮。バランステストを満たすように調整する）。
 * - 金貨：敵ごとの金貨（enemies.json の reward.gold）。強敵は elite 倍
 * - 道具：敵ごとの確率（reward.drop %）で、dropItems のどれかを落とす。持ち物がいっぱいなら、その場に宝箱で残す
 * - 強敵：金貨と経験値は elite 倍。さらに必ず宝箱を落とし、eliteGold の金貨と eliteItems のどれかが入っている
 * - 経験値：たまるとレベルが上がり、最大HPと攻撃力が上がる（上がった分だけHPも回復する）。挑戦が終わると1に戻る
 */
// レベルの上がり方と強敵の倍率（金貨と経験値）は、ダンジョンごとの設定（src/game/dungeons/*.json の growth。
// 管理画面 ?view=admin の「レベルと強敵の報酬」タブ）にある。
// 標準のダンジョンでは、無属性のダンジョンの外れた準備は、報酬なしで77.5%、今の値で87.5%（バランスのテストの上限90%）
export const REWARD_CONFIG = {
  dropItems: ['potion', 'food'] as readonly ItemId[],
  eliteItems: ['potion', 'food', 'fire_whetstone', 'ice_whetstone', 'holy_water', 'dark_oil'] as readonly ItemId[],
};

/** レベル level から次のレベルに上がるのに必要な経験値（growth はダンジョンの設定） */
export function expToNext(level: number, growth: Pick<GrowthSettings, 'expBase' | 'expStep'>): number {
  return growth.expBase + growth.expStep * (level - 1);
}
