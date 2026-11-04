import type {
  Body,
  CardDef,
  CardId,
  Element,
  ElementComponent,
  EnemyDef,
  EnemyId,
  ItemDef,
  ItemId,
  TraitDef,
  TraitId,
  WeaponType,
} from './types';

// ===== MVPの設定値 =====
// 数値は仮。遊んでみてバランス調整する。
export const PREP_CONFIG = {
  maxDays: 3,
  handSize: 5,
  maxCarry: 3,
  startGold: 100, // 前の挑戦で持ち帰った金貨は、これに足される
  maxItems: 8, // 道具（消耗品）を持てる数。武器と防具は1つずつ
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

export const CARDS: Record<CardId, CardDef> = {
  rumor: {
    id: 'rumor',
    name: '酒場で噂を聞く',
    category: 'info',
    description: '50%の確率でダンジョンの特性がわかる',
    effect: { kind: 'rumor', revealChance: 0.5 },
  },
  informant: {
    id: 'informant',
    name: '情報屋に聞く',
    category: 'info',
    description: '30G払うと、ダンジョンの特性が確実にわかる',
    effect: { kind: 'informant', cost: 30 },
  },
  map: {
    id: 'map',
    name: '地図を買う',
    category: 'info',
    description: '30G払うと、全階の入口から階段までの道筋が最初から見える',
    effect: { kind: 'map', cost: 30 },
  },
  smithy: {
    id: 'smithy',
    name: '鍛冶屋に行く',
    category: 'procure',
    description: 'その日だけ武器と防具を買える',
    effect: { kind: 'open_shop', shop: 'smithy' },
  },
  item_shop: {
    id: 'item_shop',
    name: '道具屋に行く',
    category: 'procure',
    description: 'その日だけ道具を買える',
    effect: { kind: 'open_shop', shop: 'item' },
  },
  work: {
    id: 'work',
    name: '日雇い仕事',
    category: 'funds',
    description: '40G稼ぐ',
    effect: { kind: 'work', gold: 40 },
  },
};

// 山札の構成。ここからシャッフルして手札を配る。
export const DECK: readonly CardId[] = [
  'rumor',
  'rumor',
  'rumor',
  'informant',
  'informant',
  'map',
  'map',
  'smithy',
  'smithy',
  'smithy',
  'item_shop',
  'item_shop',
  'item_shop',
  'work',
  'work',
];

// 数値はすべて仮。遊んでみてバランス調整する
export const ITEMS: Record<ItemId, ItemDef> = {
  sword: {
    id: 'sword',
    name: '剣',
    shop: 'smithy',
    price: 30,
    description: '柔らかい敵によく効く。硬い敵・霊体には効きにくい',
    effect: { kind: 'weapon', weapon: 'sword' },
  },
  hammer: {
    id: 'hammer',
    name: '槌',
    shop: 'smithy',
    price: 30,
    description: '硬い敵によく効く。霊体には効きにくい',
    effect: { kind: 'weapon', weapon: 'hammer' },
  },
  staff: {
    id: 'staff',
    name: '杖',
    shop: 'smithy',
    price: 30,
    description: '霊体によく効く。柔らかい敵には効きにくい',
    effect: { kind: 'weapon', weapon: 'staff' },
  },
  fire_cloak: {
    id: 'fire_cloak',
    name: '耐火のマント',
    shop: 'smithy',
    price: 40,
    description: '炎のダメージを大きく減らす（光の攻撃は半分だけ）',
    effect: { kind: 'armor', guard: { kind: 'component', component: 'fire', rate: 0.3 } },
  },
  ice_cloak: {
    id: 'ice_cloak',
    name: '耐氷のマント',
    shop: 'smithy',
    price: 40,
    description: '氷のダメージを大きく減らす（闇の攻撃は半分だけ）',
    effect: { kind: 'armor', guard: { kind: 'component', component: 'ice', rate: 0.3 } },
  },
  plate: {
    id: 'plate',
    name: '鎧',
    shop: 'smithy',
    price: 40,
    description: '無属性のダメージを少し減らす（光・闇の攻撃は半分だけ）',
    effect: { kind: 'armor', guard: { kind: 'component', component: 'neutral', rate: 0.6 } },
  },
  light_robe: {
    id: 'light_robe',
    name: '光の衣',
    shop: 'smithy',
    price: 50,
    description: '光の攻撃を大きく減らす。ほかの属性には効かない',
    effect: { kind: 'armor', guard: { kind: 'whole', element: 'light', rate: 0.3 } },
  },
  dark_robe: {
    id: 'dark_robe',
    name: '闇の衣',
    shop: 'smithy',
    price: 50,
    description: '闇の攻撃を大きく減らす。ほかの属性には効かない',
    effect: { kind: 'armor', guard: { kind: 'whole', element: 'dark', rate: 0.3 } },
  },
  potion: {
    id: 'potion',
    name: '回復薬',
    shop: 'item',
    price: 10,
    description: 'HPを15回復する',
    effect: { kind: 'heal', hp: 15 },
  },
  food: {
    id: 'food',
    name: '食料',
    shop: 'item',
    price: 15,
    description: '満腹度を200回復する',
    effect: { kind: 'food', satiety: 200 },
  },
  fire_whetstone: {
    id: 'fire_whetstone',
    name: '炎の砥石',
    shop: 'item',
    price: 20,
    description: '武器に炎の力を宿す（攻撃5回）。氷の敵によく効く',
    effect: { kind: 'enchant', element: 'fire', hits: 5 },
  },
  ice_whetstone: {
    id: 'ice_whetstone',
    name: '氷の砥石',
    shop: 'item',
    price: 20,
    description: '武器に氷の力を宿す（攻撃5回）。炎の敵によく効く',
    effect: { kind: 'enchant', element: 'ice', hits: 5 },
  },
  holy_water: {
    id: 'holy_water',
    name: '光の聖水',
    shop: 'item',
    price: 20,
    description: '武器に光の力を宿す（攻撃5回）。闇の敵によく効く',
    effect: { kind: 'enchant', element: 'light', hits: 5 },
  },
  dark_oil: {
    id: 'dark_oil',
    name: '闇の香油',
    shop: 'item',
    price: 20,
    description: '武器に闇の力を宿す（攻撃5回）。光の敵によく効く',
    effect: { kind: 'enchant', element: 'dark', hits: 5 },
  },
};

// ===== 戦闘の設定値（仮） =====
export const COMBAT_CONFIG = {
  playerHp: 60,
  playerAtk: 6,
  playerDef: 1,
  weaponAtk: 3, // 武器を持っているときの攻撃力ボーナス
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

// 攻撃力は自動プレイのバランステスト（balance.test.ts）を満たすように調整している
export const ENEMIES: Record<EnemyId, EnemyDef> = {
  // 無属性
  goblin: { id: 'goblin', name: 'ゴブリン', hp: 14, atk: 8, def: 1, element: 'neutral', body: 'normal' },
  giant_rat: { id: 'giant_rat', name: '大ネズミ', hp: 10, atk: 6, def: 0, element: 'neutral', body: 'soft' },
  stone_golem: { id: 'stone_golem', name: '石ゴーレム', hp: 22, atk: 10, def: 3, element: 'neutral', body: 'hard' },
  // 炎
  fire_imp: { id: 'fire_imp', name: '火の小鬼', hp: 12, atk: 13, def: 0, element: 'fire', body: 'normal' },
  flame_hound: { id: 'flame_hound', name: '炎の猟犬', hp: 16, atk: 14, def: 1, element: 'fire', body: 'soft' },
  lava_lizard: { id: 'lava_lizard', name: '溶岩トカゲ', hp: 22, atk: 14, def: 3, element: 'fire', body: 'hard' },
  // 氷
  ice_imp: { id: 'ice_imp', name: '氷の小鬼', hp: 12, atk: 13, def: 0, element: 'ice', body: 'normal' },
  ice_slime: { id: 'ice_slime', name: '氷のスライム', hp: 16, atk: 11, def: 0, element: 'ice', body: 'soft' },
  ice_beetle: { id: 'ice_beetle', name: '氷の甲虫', hp: 20, atk: 13, def: 3, element: 'ice', body: 'hard' },
  // 光（炎＋無属性）
  light_bird: { id: 'light_bird', name: '光の鳥', hp: 12, atk: 13, def: 0, element: 'light', body: 'soft' },
  holy_armor: { id: 'holy_armor', name: '聖なる甲冑', hp: 24, atk: 14, def: 3, element: 'light', body: 'hard' },
  light_wisp: { id: 'light_wisp', name: '光の精', hp: 14, atk: 13, def: 0, element: 'light', body: 'spirit' },
  // 闇（氷＋無属性）
  dark_bat: { id: 'dark_bat', name: '闇コウモリ', hp: 10, atk: 13, def: 0, element: 'dark', body: 'soft' },
  shadow: { id: 'shadow', name: '影', hp: 16, atk: 14, def: 1, element: 'dark', body: 'spirit' },
  phantom: { id: 'phantom', name: '亡霊', hp: 18, atk: 14, def: 1, element: 'dark', body: 'spirit' },
  // ボス：ダンジョンの属性と体質の傾向に合わせる。動かない。
  // 正しい準備で挑んだとき、ボス戦で受ける合計ダメージがどのボスでも40前後になるようにそろえている
  flame_beast: { id: 'flame_beast', name: '炎の魔獣', hp: 60, atk: 18, def: 2, element: 'fire', body: 'soft', boss: true },
  ice_colossus: { id: 'ice_colossus', name: '氷の巨像', hp: 60, atk: 18, def: 2, element: 'ice', body: 'hard', boss: true },
  ogre_chief: { id: 'ogre_chief', name: '鬼の首領', hp: 60, atk: 9, def: 1, element: 'neutral', body: 'normal', boss: true },
  // 光のダンジョンは、光の衣で防げない炎・無属性の敵も混ざり道中で消耗するので、ボスを少し弱くしている
  light_guardian: { id: 'light_guardian', name: '光の守護者', hp: 50, atk: 14, def: 2, element: 'light', body: 'hard', boss: true },
  dark_lord: { id: 'dark_lord', name: '闇の王', hp: 60, atk: 18, def: 2, element: 'dark', body: 'spirit', boss: true },
};

/**
 * ダンジョン特性ごとに出る敵。同じ敵を複数並べると出やすくなる。
 * その属性の敵が中心で、成分の属性の敵も混ざる。体質にも傾向がある
 * （炎：柔らかい、氷：硬い、無属性：混在、光：硬い、闇：霊体）。
 */
export const TRAIT_ENEMIES: Record<TraitId, { pool: readonly EnemyId[]; boss: EnemyId }> = {
  fire: { pool: ['fire_imp', 'fire_imp', 'flame_hound', 'flame_hound', 'flame_hound', 'lava_lizard', 'goblin'], boss: 'flame_beast' },
  ice: { pool: ['ice_imp', 'ice_slime', 'ice_beetle', 'ice_beetle', 'ice_beetle', 'goblin'], boss: 'ice_colossus' },
  neutral: { pool: ['goblin', 'goblin', 'giant_rat', 'giant_rat', 'stone_golem', 'stone_golem'], boss: 'ogre_chief' },
  light: { pool: ['light_bird', 'holy_armor', 'holy_armor', 'holy_armor', 'light_wisp', 'fire_imp', 'stone_golem'], boss: 'light_guardian' },
  dark: { pool: ['dark_bat', 'shadow', 'shadow', 'phantom', 'phantom', 'ice_imp', 'giant_rat'], boss: 'dark_lord' },
};

// ===== 宝箱と金貨（仮） =====
export const TREASURE_CONFIG = {
  goldPerDepth: 5, // 宝箱の金貨＝本道からの距離×これ
  itemChance: 0.5, // 宝箱に道具が入っている確率
  items: ['potion', 'food', 'fire_whetstone', 'ice_whetstone', 'holy_water', 'dark_oil'] as readonly ItemId[],
  eliteGold: 30, // 強敵を倒すと落とす金貨
  bossGold: 50, // ボスを倒したときの報酬
  keepOnDefeat: 0.5, // 力尽きたときに持ち帰れる金貨の割合
} as const;
