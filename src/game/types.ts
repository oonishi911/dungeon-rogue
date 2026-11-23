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
/**
 * 武器と防具の種類（1段目の ID）。それぞれ10段階あり、2段目からは `sword_2` のような ID になる。
 * 防具は鎧・法衣・毛皮の外套（属性の耐性は付かない。指輪の役目）。docs/ring-spec.md
 */
export type GearBaseId = 'sword' | 'hammer' | 'staff' | 'plate' | 'robe' | 'cloak';
export type GearTier = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type GearId = GearBaseId | `${GearBaseId}_${GearTier}`;

// 指輪（docs/ring-spec.md）。ring_fire_3（炎の指輪の3段目）、ring_all_2（万能の指輪の2段目）、ring_dual_fire_ice_3（二重耐性の指輪。炎と氷の3段目）
export type RingKind = Element | 'all';
export type RingLevel = 1 | 2 | 3 | 4 | 5;
/** 二重耐性の指輪の属性の組み合わせ（Element の並び順で、小さいほうが先） */
export type DualPair = 'fire_ice' | 'fire_neutral' | 'fire_light' | 'fire_dark' | 'ice_neutral' | 'ice_light' | 'ice_dark' | 'neutral_light' | 'neutral_dark' | 'light_dark';
export type RingId = `ring_${RingKind}_${RingLevel}` | `ring_dual_${DualPair}_${RingLevel}`;

export type ItemId =
  | GearId
  | RingId
  | 'potion'
  | 'panacea'
  | 'food'
  | 'fire_whetstone'
  | 'ice_whetstone'
  | 'holy_water'
  | 'dark_oil'
  | 'lantern'
  | 'bag'
  | 'book_shockwave'
  | 'book_shockwave_strong'
  | 'book_sweep'
  | 'book_sweep_bleed'
  | 'book_fire_bolt'
  | 'book_fire_chain'
  | 'book_ice_bolt'
  | 'book_ice_chain'
  | 'book_light_lance'
  | 'book_light_chain'
  | 'book_dark_bolt'
  | 'book_dark_chain'
  | 'book_heal'
  | 'book_regen'
  | 'book_silence'
  | 'book_teleport'
  | 'book_stone_wall'
  | 'book_sleep'
  | 'book_ward'
  | 'book_poison_mist'
  | 'book_cleanse'
  | 'book_prism_fan'
  | 'book_fire_blade'
  | 'book_ice_blade'
  | 'book_light_blade'
  | 'book_dark_blade'
  | 'book_drain'
  | 'book_thunder_chain';

// ===== 残響（刻印スロットにはめるもの。echoMaster.ts、docs/echo-spec.md） =====
export type EchoId =
  | 'fire' | 'ice' | 'light' | 'dark' | 'soft' | 'hard' | 'spirit' | 'plain' | 'warmth' | 'pulse'
  | 'linger' | 'slumber' | 'stagnant' | 'falter' | 'share' | 'hush' | 'whisper' | 'lamp' | 'pocket'
  | 'pierce' | 'sneak' | 'frostwalk' | 'sated' | 'ember' | 'bond' | 'backwater' | 'siphon' | 'recall' | 'learn';

export type ItemSlot = 'weapon' | 'armor' | 'ring' | 'consumable' | 'spellbook';
export type WeaponType = 'sword' | 'hammer' | 'staff';
/** 防具の種類。鎧：守りがいちばん高い。法衣：守りは低いが、魔力が上がり、魔力の回復が速い。毛皮の外套：守りは中くらいで、鈍足にならず、お腹が空きにくい */
export type ArmorType = 'plate' | 'robe' | 'cloak';

// 指輪の守り方。rate は受けるダメージの倍率（1より小さいと耐性、大きいと弱点）。
// 成分ごとに効くもの（炎・氷・無属性の指輪）、複合属性を丸ごと防ぐもの（光・闇の指輪）、すべてに効くもの（万能の指輪）がある
export type Guard =
  | { kind: 'component'; component: ElementComponent; rate: number }
  | { kind: 'whole'; element: 'light' | 'dark'; rate: number }
  | { kind: 'all'; rate: number };

export type ItemEffect =
  | { kind: 'weapon'; weapon: WeaponType; atk: number; mag: number } // atk：持つと上がる攻撃力、mag：持つと上がる魔力（魔法の強さに足される。どちらも段階が上がるほど大きい）
  | { kind: 'armor'; armor: ArmorType; def: number; mag: number } // def：持つと上がる守り、mag：持つと上がる魔力（法衣だけ。どちらも段階が上がるほど大きい）。属性の耐性は付かない（指輪の役目）
  | { kind: 'ring'; guards: Guard[]; cut: number } // 指輪。guards：属性ごとの守り（逆の属性の弱点も入る）、cut：耐性（%。表示用）
  | { kind: 'heal'; hp: number }
  | { kind: 'cure' } // 万能薬。毒と鈍足をすべて治す（空腹はその場で満腹度が減るだけなので、治すものはない）
  | { kind: 'food'; satiety: number }
  | { kind: 'enchant'; element: Element; hits: number } // 武器に一時的に属性を付ける
  | { kind: 'capacity'; slots: number } // 持っていくと、その探索のあいだ道具を持てる数が増える（ダンジョンでは使わない。探索1回でなくなる）
  | { kind: 'sight'; radius: number } // 持っていくと、その探索のあいだ視界が広がる（ダンジョンでは使わない。探索1回でなくなる）
  | { kind: 'spellbook'; spell: SpellId }; // 呪文書。持っていくと、探索で魔力を使ってその呪文を何度でも唱えられる

// ===== 魔法 =====
// 呪文は呪文書を持っていくと使える。強さと魔力の量は、ダンジョンごとの設定（src/game/dungeons/*.json の magic と spells。管理画面で変えられる）
export type SpellId =
  | 'shockwave'
  | 'shockwave_strong'
  | 'sweep'
  | 'sweep_bleed'
  | 'fire_bolt'
  | 'fire_chain'
  | 'ice_bolt'
  | 'ice_chain'
  | 'light_lance'
  | 'light_chain'
  | 'dark_bolt'
  | 'dark_chain'
  | 'heal'
  | 'regen'
  | 'silence'
  | 'teleport'
  | 'stone_wall'
  | 'sleep'
  | 'ward'
  | 'poison_mist'
  | 'cleanse'
  | 'prism_fan'
  | 'fire_blade'
  | 'ice_blade'
  | 'light_blade'
  | 'dark_blade'
  | 'drain'
  | 'thunder_chain';

// 呪文の働き。aim は唱えるときに向きを選ぶかどうか
export type SpellEffect =
  | { kind: 'shockwave'; stun?: boolean } // まわり8マスの敵を、外へ吹き飛ばす（ダメージは控えめ。壁や敵にぶつかると追加ダメージ）。stun なら、吹き飛ばした敵を設定のターン数だけ動けなくする
  | { kind: 'sweep'; bleed?: boolean } // 向いた方向の数マスを貫き、そこにいる敵すべてに当たる。bleed なら、当たった敵を出血させる（設定のターン数のあいだ、1ターンごとに、その敵に与えたダメージの設定の割合のダメージ）
  | { kind: 'bolt'; element: Element; splash?: boolean } // 向いた方向へ飛び、最初に当たった敵に属性のダメージ。splash なら、その敵のまわり8マスの敵にも、ダメージの一部（設定の splash の割合）を与える
  | { kind: 'heal' } // すぐにHPを回復する
  | { kind: 'regen' } // 数ターンかけて、少しずつHPを回復する
  | { kind: 'silence' } // まわりの敵を、数ターン黙らせる（見張りは叫べず、召喚する敵は呼べず、遠距離の敵は撃てない）
  | { kind: 'teleport' } // 今いる階の、離れた床（見たことのある場所）へ跳ぶ
  | { kind: 'stone' } // 向いた方向の目の前に、数ターンで崩れる石の壁（横3マス）を作る。主人公も敵も通れず、矢も通らない
  | { kind: 'sleep' } // まわりの、まだ気付いていない敵を眠らせる（殴られるか、呪文の声で起きる）
  | { kind: 'ward' } // 数ターン、敵の攻撃で受けるダメージを減らす
  | { kind: 'poison' } // 向いた方向へ飛び、当たった所のまわり9マスに、数ターン残る毒の霧を置く（上にいる敵は毎ターンダメージ。主人公は受けない）
  | { kind: 'cleanse' } // 自分の毒と鈍足を治す
  | { kind: 'blade'; element: Element } // 武器に属性を宿す（砥石・聖水・闇の油と同じ。攻撃の回数は設定）
  | { kind: 'drain' } // 向いた方向へ飛び、最初の敵に属性のないダメージ。与えたダメージの一部だけHPが回復する
  | { kind: 'thunder' } // 向いた方向へ飛び、最初の敵から、近くの敵へ次々に跳ぶ雷（跳ぶたびに弱くなる。属性なし）
  | { kind: 'fan' }; // 向いた方向に前へ広がる扇形（手前1マス→奥ほど2マスずつ広い）の敵すべてに当たる。属性を持たず、どの敵にも同じダメージ

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
  price: number; // 店での値段（金貨）
  effect: ItemEffect;
}

// ===== 出発 =====
/** ダンジョンに出発するときに決まること（遊ぶダンジョン・その特性・持ち物）。探索と、中断した探索の保存に使う */
export interface Departure {
  dungeon: string; // 遊ぶダンジョンの ID（src/game/dungeons/ の設定ファイル）
  trait: TraitId;
  loadout: ItemId[];
  echoes?: EchoId[]; // 装備している刻印武器にはめた残響（ないときは、残響なし）
  subEchoes?: EchoId[]; // サブ武器にしている刻印武器にはめた残響（ないときは、残響なし）
}

// ===== 敵 =====
/**
 * 敵の行動の個性（enemies.json の behaviors。管理画面の「敵」タブで変えられる。1体に複数つけられる）。
 * - ranged（遠距離）：まっすぐ4マス以内で見通せれば、離れたところから撃ってくる
 * - charger（突進）：まっすぐ3マス以内にいると身構えて、次のターンに一直線に走ってくる
 * - shield（盾持ち）：向いている正面からの武器の攻撃を、大きく防ぐ
 * - summoner（召喚）：数ターンごとに、近くに弱い敵を呼ぶ
 * - trail（炎の足跡）：歩いたあとのマスに、燃える床を残す（炎の敵は燃えない。ほかの敵や主人公が乗ると、燃える）
 * - ambush（待ち伏せ）：気付かれていないあいだは、その場から動かない。2マス以内に近づかれると、すぐ襲いかかってくる（気付いたターンの猶予がない）
 * - alarm（見張り）：主人公に気付くと、叫んで、近く（5マス以内）の仲間3体までにも一斉に気付かせる（仲間は、自分で見つけるのを待たずに追ってくる）
 * - poison / chill / hunger（毒・鈍足・空腹）：攻撃が当たると、状態異常にさせることがある（ボスは今のところ与えない。詳しくは docs/status-spec.md）
 */
export type EnemyBehavior = 'ranged' | 'charger' | 'shield' | 'summoner' | 'trail' | 'ambush' | 'alarm' | 'poison' | 'chill' | 'hunger';

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
  physical?: number; // 武器で殴られたときのダメージの倍率（省略は1。1より大きいほど物理に弱く、小さいほど強い）
  magic?: number; // 呪文を受けたときのダメージの倍率（省略は1。1より大きいほど魔法に弱く、小さいほど強い）
  behaviors?: EnemyBehavior[]; // 行動の個性（省略は、ふつうに近づいて殴るだけ）
}

// ===== プレイヤー =====
export interface Enchant {
  element: Element;
  hits: number; // あと何回の攻撃に属性が乗るか
}

/** サブ武器。持ち替えると、手に持っている武器（weapon・echoes・技ゲージ）と入れ替わる */
export interface SubWeapon {
  weapon: ItemId;
  echoes?: EchoId[]; // サブ武器にした刻印武器にはめた残響（ふつうの武器なら、なし）
  skill: number; // サブ武器の技ゲージ（武器ごとに別々にたまる）
}

export interface PlayerStats {
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  mag: number; // レベルが上がって増えた魔力（魔法の強さに足される。武器の魔力とは別。最初は0）
  poisonTurns: number; // 毒の残りターン（毎ターン、守りに関係なくダメージ）
  chillSteps?: number; // 鈍足の残り歩数（ないときは、0。歩くのに2ターンかかる）
  rally?: number; // 絆の残響：敵を倒したあと、次の通常攻撃のダメージが増える割合（%。殴ると消える）
  lastStruck?: number; // 追憶の残響：前の通常攻撃で殴った敵の番号（uid）
  weapon: ItemId | null;
  sub?: SubWeapon; // サブ武器（持ち替えで手に持つ。ないときは、1本だけ。docs/combat-fun-spec.md の②）
  armor: ItemId | null;
  rings?: ItemId[]; // 付けている指輪（ないときは、なし）
  items: ItemId[]; // 持っている道具（消耗品）
  enchant: Enchant | null;
  echoes?: EchoId[]; // 刻印武器にはめた残響（ないときは、なし）
}

// 例外ではなく値でエラーを返す
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
