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
  | 'dark_oil'
  | 'book_shockwave'
  | 'book_sweep'
  | 'book_fire_bolt'
  | 'book_ice_bolt'
  | 'book_light_lance'
  | 'book_dark_bolt'
  | 'book_heal'
  | 'book_regen';

export type ItemSlot = 'weapon' | 'armor' | 'consumable' | 'spellbook';
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
  | { kind: 'enchant'; element: Element; hits: number } // 武器に一時的に属性を付ける
  | { kind: 'spellbook'; spell: SpellId }; // 呪文書。持っていくと、探索で魔力を使ってその呪文を何度でも唱えられる

// ===== 魔法 =====
// 呪文は呪文書を持っていくと使える。強さと魔力の量は、ダンジョンごとの設定（src/game/dungeons/*.json の magic と spells。管理画面で変えられる）
export type SpellId = 'shockwave' | 'sweep' | 'fire_bolt' | 'ice_bolt' | 'light_lance' | 'dark_bolt' | 'heal' | 'regen';

// 呪文の働き。aim は唱えるときに向きを選ぶかどうか
export type SpellEffect =
  | { kind: 'shockwave' } // まわり8マスの敵を、外へ吹き飛ばす（ダメージは控えめ。壁や敵にぶつかると追加ダメージ）
  | { kind: 'sweep' } // 向いた方向の数マスを貫き、そこにいる敵すべてに当たる
  | { kind: 'bolt'; element: Element } // 向いた方向へ飛び、最初に当たった敵に属性のダメージ
  | { kind: 'heal' } // すぐにHPを回復する
  | { kind: 'regen' }; // 数ターンかけて、少しずつHPを回復する

export interface SpellDef {
  id: SpellId;
  name: string;
  aim: boolean;
  effect: SpellEffect;
}

export interface ItemDef {
  id: ItemId;
  name: string;
  description: string;
  effect: ItemEffect;
}

// ===== 出発 =====
/** ダンジョンに出発するときに決まること（遊ぶダンジョン・その特性・持ち物）。探索と、中断した探索の保存に使う */
export interface Departure {
  dungeon: string; // 遊ぶダンジョンの ID（src/game/dungeons/ の設定ファイル）
  trait: TraitId;
  loadout: ItemId[];
}

// ===== 敵 =====
// 敵の ID。敵の種類はプログラムに決め打ちせず、src/game/enemies.json にある敵がすべて（管理画面 ?view=admin の「敵」タブで足す・消すことができる）
export type EnemyId = string;

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
