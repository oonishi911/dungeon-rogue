// ===== 属性・体質 =====
// 属性は攻撃の種類（防具の選択に関わる）。光は炎＋無属性、闇は氷＋無属性の複合属性。
export type Element = 'fire' | 'ice' | 'neutral' | 'light' | 'dark';
// 複合属性を分解したときの成分。防具はこの成分ごとに効く
export type ElementComponent = 'fire' | 'ice' | 'neutral';
// 体質は守りの種類（武器の選択に関わる）
export type Body = 'normal' | 'soft' | 'hard' | 'spirit';

// ダンジョン特性は5つの属性のうち1つ。周回ごとに裏で決まり、プレイヤーには隠される。
export type TraitId = Element;

export interface TraitDef {
  id: TraitId;
  name: string;
}

// ===== カード =====
export type CardId = 'rumor' | 'informant' | 'map' | 'smithy' | 'item_shop' | 'work';

export type CardCategory = 'info' | 'procure' | 'funds';
export type ShopId = 'smithy' | 'item'; // 鍛冶屋は武器と防具、道具屋は道具

// カードの効果は判別可能なユニオン型で表す。
// 新しい効果を追加すると、switch の書き漏れを型チェックで検出できる。
export type CardEffect =
  | { kind: 'rumor'; revealChance: number } // 一定確率で特性がわかる（安い・不確実）
  | { kind: 'informant'; cost: number } // お金を払えば確実にわかる
  | { kind: 'map'; cost: number } // お金を払うと、全階の本道が最初から見える
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
  | 'sword'
  | 'hammer'
  | 'staff'
  | 'fire_cloak'
  | 'ice_cloak'
  | 'plate'
  | 'light_robe'
  | 'dark_robe'
  | 'potion'
  | 'food'
  | 'fire_whetstone'
  | 'ice_whetstone'
  | 'holy_water'
  | 'dark_oil';

export type ItemSlot = 'weapon' | 'armor' | 'consumable';
export type WeaponType = 'sword' | 'hammer' | 'staff';

// 防具の守り方。成分ごとに効くもの（マント・鎧）と、複合属性を丸ごと防ぐもの（専用防具）がある
export type ArmorGuard =
  | { kind: 'component'; component: ElementComponent; rate: number }
  | { kind: 'whole'; element: 'light' | 'dark'; rate: number };

export type ItemEffect =
  | { kind: 'weapon'; weapon: WeaponType }
  | { kind: 'armor'; guard: ArmorGuard }
  | { kind: 'heal'; hp: number }
  | { kind: 'food'; satiety: number }
  | { kind: 'enchant'; element: Element; hits: number }; // 武器に一時的に属性を付ける

export interface ItemDef {
  id: ItemId;
  name: string;
  shop: ShopId;
  price: number;
  description: string;
  effect: ItemEffect;
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
  hasMap: boolean;
  openShop: ShopId | null;
  inventory: ItemId[];
  rngState: number; // 乱数の状態も state に持たせ、処理を純粋関数に保つ
  log: string[];
}

// 準備フェーズの成果。探索フェーズと次の周回に渡す。
export interface PrepResult {
  trait: TraitId;
  knowledge: Knowledge;
  hasMap: boolean;
  loadout: ItemId[];
  carried: CardInstance[];
}

// ===== 敵 =====
export type EnemyId =
  | 'goblin'
  | 'giant_rat'
  | 'stone_golem'
  | 'fire_imp'
  | 'flame_hound'
  | 'lava_lizard'
  | 'ice_imp'
  | 'ice_slime'
  | 'ice_beetle'
  | 'light_bird'
  | 'holy_armor'
  | 'light_wisp'
  | 'dark_bat'
  | 'shadow'
  | 'phantom'
  // ボス
  | 'flame_beast'
  | 'ice_colossus'
  | 'ogre_chief'
  | 'light_guardian'
  | 'dark_lord';

export interface EnemyDef {
  id: EnemyId;
  name: string;
  hp: number;
  atk: number;
  def: number;
  element: Element;
  body: Body;
  boss?: boolean;
}

// ===== プレイヤー =====
export interface Enchant {
  element: Element;
  hits: number; // あと何回の攻撃に属性が乗るか
}

export interface PlayerStats {
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  poisonTurns: number; // 毒の残りターン（仕組みだけ残している。今は毒を与える敵はいない）
  weapon: ItemId | null;
  armor: ItemId | null;
  items: ItemId[]; // 持っている道具（消耗品）
  enchant: Enchant | null;
}

// 例外ではなく値でエラーを返す
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
