// ===== ダンジョン特性 =====
// MVPでは2種類。周回ごとに裏で1つ決まり、プレイヤーには隠される。
export type TraitId = 'fire' | 'poison';

export interface TraitDef {
  id: TraitId;
  name: string;
}

// ===== カード =====
export type CardId =
  | 'rumor'
  | 'informant'
  | 'weapon_shop'
  | 'armor_shop'
  | 'item_shop'
  | 'work';

export type CardCategory = 'info' | 'procure' | 'funds';
export type ShopId = 'weapon' | 'armor' | 'item';

// カードの効果は判別可能なユニオン型で表す。
// 新しい効果を追加すると、switch の書き漏れを型チェックで検出できる。
export type CardEffect =
  | { kind: 'rumor'; revealChance: number } // 一定確率で特性がわかる（安い・不確実）
  | { kind: 'informant'; cost: number } // お金を払えば確実にわかる
  | { kind: 'open_shop'; shop: ShopId } // その日だけ店で買い物ができる
  | { kind: 'work'; gold: number }; // お金を稼ぐ

export interface CardDef {
  id: CardId;
  name: string;
  category: CardCategory;
  description: string;
  effect: CardEffect;
}

// 手札の1枚。同じ種類のカードを区別するため uid を持つ。
export interface CardInstance {
  uid: string;
  cardId: CardId;
}

// ===== アイテム =====
export type ItemId =
  | 'iron_sword'
  | 'fire_cloak'
  | 'poison_cloak'
  | 'potion'
  | 'antidote'
  | 'frost_scroll';

export type ItemSlot = 'weapon' | 'armor' | 'consumable';

export interface ItemDef {
  id: ItemId;
  name: string;
  slot: ItemSlot;
  shop: ShopId;
  price: number;
  resist?: TraitId; // この特性への耐性・対策になる
  description: string;
}

// ===== 準備フェーズの状態 =====
export type Knowledge =
  | { status: 'unknown' }
  | { status: 'known'; trait: TraitId; source: 'rumor' | 'informant'; day: number };

export type PrepPhase = 'prep' | 'ready';

export interface PrepState {
  seed: number;
  trait: TraitId; // 正解。UIには toPlayerView で隠して渡す
  phase: PrepPhase;
  day: number; // 1始まり
  maxDays: number;
  hand: CardInstance[];
  played: { day: number; card: CardInstance }[]; // どの日に何を使ったか
  playedToday: boolean;
  gold: number;
  knowledge: Knowledge;
  openShop: ShopId | null;
  inventory: ItemId[];
  rngState: number; // 乱数の状態も state に持たせ、処理を純粋関数に保つ
  log: string[];
}

// 準備フェーズの成果。探索フェーズと次の周回に渡す。
export interface PrepResult {
  trait: TraitId;
  knowledge: Knowledge;
  loadout: ItemId[];
  carried: CardInstance[];
}

// ===== 敵 =====
export type EnemyId =
  | 'goblin'
  | 'fire_imp'
  | 'flame_hound'
  | 'fire_drake'
  | 'poison_slime'
  | 'venom_spider'
  | 'venom_queen';

export interface EnemyDef {
  id: EnemyId;
  name: string;
  hp: number;
  atk: number;
  def: number;
  element?: TraitId; // fire：炎ダメージ（耐火で軽減） / poison：攻撃で毒を与える
  boss?: boolean;
}

// ===== 戦闘 =====
export interface PlayerStats {
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  poisonTurns: number; // 毒の残りターン
  weapon: ItemId | null;
  armor: ItemId | null;
  consumables: ItemId[];
}

export interface EnemyState {
  id: EnemyId;
  hp: number;
}

export type CombatAction = { kind: 'attack' } | { kind: 'use_item'; item: ItemId };

export type CombatOutcome = 'ongoing' | 'won' | 'lost';

export interface CombatState {
  player: PlayerStats;
  enemy: EnemyState;
  round: number;
  outcome: CombatOutcome;
  log: string[];
}

// 例外ではなく値でエラーを返す
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
