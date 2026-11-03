import type { CardDef, CardId, EnemyDef, EnemyId, ItemDef, ItemId, TraitDef, TraitId } from './types';

// ===== MVPの設定値 =====
// 数値は仮。遊んでみてバランス調整する。
export const PREP_CONFIG = {
  maxDays: 3,
  handSize: 5,
  maxCarry: 3,
  startGold: 30,
} as const;

export const TRAITS: Record<TraitId, TraitDef> = {
  fire: { id: 'fire', name: '炎' },
  poison: { id: 'poison', name: '毒' },
};

export const TRAIT_IDS: readonly TraitId[] = ['fire', 'poison'];

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
  weapon_shop: {
    id: 'weapon_shop',
    name: '武器屋に行く',
    category: 'procure',
    description: 'その日だけ武器を買える',
    effect: { kind: 'open_shop', shop: 'weapon' },
  },
  armor_shop: {
    id: 'armor_shop',
    name: '防具屋に行く',
    category: 'procure',
    description: 'その日だけ防具を買える',
    effect: { kind: 'open_shop', shop: 'armor' },
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
  'weapon_shop',
  'armor_shop',
  'armor_shop',
  'item_shop',
  'item_shop',
  'work',
  'work',
  'work',
];

export const ITEMS: Record<ItemId, ItemDef> = {
  iron_sword: {
    id: 'iron_sword',
    name: '鉄の剣',
    slot: 'weapon',
    shop: 'weapon',
    price: 30,
    description: '攻撃力が上がる',
  },
  fire_cloak: {
    id: 'fire_cloak',
    name: '耐火のマント',
    slot: 'armor',
    shop: 'armor',
    price: 40,
    resist: 'fire',
    description: '炎のダメージを大きく減らす',
  },
  poison_cloak: {
    id: 'poison_cloak',
    name: '防毒のマント',
    slot: 'armor',
    shop: 'armor',
    price: 40,
    resist: 'poison',
    description: '毒にかかりにくくなる',
  },
  potion: {
    id: 'potion',
    name: '回復薬',
    slot: 'consumable',
    shop: 'item',
    price: 10,
    description: 'HPを回復する',
  },
  antidote: {
    id: 'antidote',
    name: '毒消し',
    slot: 'consumable',
    shop: 'item',
    price: 15,
    resist: 'poison',
    description: '毒を治す',
  },
  frost_scroll: {
    id: 'frost_scroll',
    name: '氷の巻物',
    slot: 'consumable',
    shop: 'item',
    price: 25,
    resist: 'fire',
    description: '炎の敵に大ダメージ',
  },
};

// ===== 戦闘の設定値（仮） =====
export const COMBAT_CONFIG = {
  playerHp: 60,
  playerAtk: 6,
  playerDef: 1,
  swordAtk: 3, // 鉄の剣の攻撃力ボーナス
  fireResistRate: 0.3, // 耐火のマント装備時、炎ダメージはこの倍率になる
  poisonDamage: 7, // 毒の1ターンあたりのダメージ
  poisonTurns: 4,
  potionHeal: 15,
  frostVsFire: 30, // 氷の巻物：炎の敵へのダメージ
  frostVsOther: 10,
} as const;

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  goblin: { id: 'goblin', name: 'ゴブリン', hp: 14, atk: 5, def: 1 },
  // 炎の敵は攻撃力が高い（耐火で大きく軽減できる）
  fire_imp: { id: 'fire_imp', name: '火の小鬼', hp: 12, atk: 10, def: 0, element: 'fire' },
  flame_hound: { id: 'flame_hound', name: '炎の猟犬', hp: 18, atk: 12, def: 1, element: 'fire' },
  fire_drake: { id: 'fire_drake', name: '炎竜', hp: 40, atk: 18, def: 2, element: 'fire', boss: true },
  // 毒の敵は攻撃力は低いが、毒が重い（防毒で防げる）
  poison_slime: { id: 'poison_slime', name: '毒スライム', hp: 14, atk: 3, def: 0, element: 'poison' },
  venom_spider: { id: 'venom_spider', name: '毒蜘蛛', hp: 16, atk: 4, def: 1, element: 'poison' },
  venom_queen: { id: 'venom_queen', name: '毒蜘蛛の女王', hp: 40, atk: 6, def: 2, element: 'poison', boss: true },
};

// 特性ごとの出現する敵とボス
export const TRAIT_ENEMIES: Record<TraitId, { pool: readonly EnemyId[]; boss: EnemyId }> = {
  fire: { pool: ['goblin', 'fire_imp', 'fire_imp', 'flame_hound'], boss: 'fire_drake' },
  poison: { pool: ['goblin', 'poison_slime', 'poison_slime', 'venom_spider'], boss: 'venom_queen' },
};
