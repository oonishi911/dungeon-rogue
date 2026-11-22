// 品物の設定（src/game/items.json）を読み、正しい形かを確かめる。
// items.json には、店で売るすべての品物の名前と値段がある。武器と防具は種類ごとに10段階あり、段階ごとに性能も決める
// （武器：攻撃力と魔力［魔法の強さに足される。magic.ts］、防具：守りと魔力）。指輪は種類ごとに5段階あり、段階ごとに耐性（何%カットするか）と値段を決める。
// 情報屋の情報料（information）もここにある。
// 品物の働き（回復薬はHPを15回復する、など）と、武器と体質の相性・指輪の効く属性は、ここではなくプログラムで決まっている。
// items.json は、開発用の管理画面（?view=admin の「品物」タブ。src/ui/ItemPanels.tsx）から書き換えて公開できる。
// 読めない値が入っていたら、ゲームを動かさずにエラーにする（テストで見つかるので、公開はされない）

import type { ArmorType, DualPair, Element, GearBaseId, GearId, GearTier, Guard, ItemDef, ItemEffect, ItemId, RingId, RingKind, RingLevel, SpellId, WeaponType } from './types';

export const GEAR_TIERS = 10;

export const WEAPON_BASES = ['sword', 'hammer', 'staff'] as const satisfies readonly (GearBaseId & WeaponType)[];
export type WeaponBaseId = (typeof WEAPON_BASES)[number];
export const ARMOR_BASES = ['plate', 'robe', 'cloak'] as const satisfies readonly (GearBaseId & ArmorType)[];
export type ArmorBaseId = (typeof ARMOR_BASES)[number];
export const GEAR_BASES: readonly GearBaseId[] = [...WEAPON_BASES, ...ARMOR_BASES];

export const SUPPLY_IDS = ['potion', 'panacea', 'food', 'fire_whetstone', 'ice_whetstone', 'holy_water', 'dark_oil', 'lantern', 'bag'] as const satisfies readonly ItemId[];
export type SupplyId = (typeof SUPPLY_IDS)[number];
export const SPELLBOOK_IDS = [
  'book_shockwave',
  'book_shockwave_strong',
  'book_sweep',
  'book_sweep_bleed',
  'book_fire_bolt',
  'book_fire_chain',
  'book_ice_bolt',
  'book_ice_chain',
  'book_light_lance',
  'book_light_chain',
  'book_dark_bolt',
  'book_dark_chain',
  'book_heal',
  'book_regen',
] as const satisfies readonly ItemId[];
export type SpellbookId = (typeof SPELLBOOK_IDS)[number];

/** 武器1段分。atk：持つと上がる攻撃力、mag：持つと上がる魔力（魔法の強さに足される。0なら上がらない） */
export type WeaponTier = { name: string; atk: number; mag: number; price: number };
/** 防具1段分。def：持つと上がる守り（受けるダメージから引く）、mag：持つと上がる魔力（魔法の強さに足される。鎧と外套は0） */
export type ArmorTier = { name: string; def: number; mag: number; price: number };
/** 指輪1段分。cut：効く属性のダメージを何%カットするか（大きいほど強い。100なら受けない） */
export type RingTier = { name: string; cut: number; price: number };

export const RING_KINDS = ['fire', 'ice', 'neutral', 'light', 'dark', 'all'] as const satisfies readonly RingKind[];
export const RING_LEVELS = 5;
/** 指輪の設定。kinds：種類ごとの5段階、dualCut：二重耐性の指輪の段階ごとの耐性（%）、weak：逆の属性の弱点の大きさ（その指輪の耐性の何%分ダメージが増えるか） */
export type RingMaster = { kinds: Record<RingKind, RingTier[]>; dualCut: number[]; weak: number };
/** 道具・呪文書1つ分 */
export type PlainItem = { name: string; price: number };

export type ItemMaster = {
  weapons: Record<WeaponBaseId, WeaponTier[]>;
  armors: Record<ArmorBaseId, ArmorTier[]>;
  rings: RingMaster;
  supplies: Record<SupplyId, PlainItem>;
  spellbooks: Record<SpellbookId, PlainItem>;
  information: Record<InfoTopic, number>; // 情報屋で「はっきり聞く」ときの情報料（informant.ts）
};

/** 情報屋に聞けること（informant.ts の Topic と同じ） */
export const INFO_TOPICS = ['trait', 'body', 'boss'] as const;
export type InfoTopic = (typeof INFO_TOPICS)[number];
export const INFO_LABELS: Record<InfoTopic, string> = { trait: 'ダンジョンの属性', body: '多い魔物の体', boss: 'ボス' };

export const ITEM_LIMITS = {
  name: { max: 16 },
  price: { min: 1, max: 99999 },
  atk: { min: 0, max: 99 },
  mag: { min: 0, max: 99 },
  def: { min: 0, max: 99 },
  cut: { min: 0, max: 100 },
  weak: { min: 0, max: 200 },
  info: { min: 0, max: 99999 }, // 情報料（0なら、はっきり聞くのも無料）
} as const;

// ===== 種類ごとに決まっていること（プログラムで決める） =====

/** 武器の種類の名前（管理画面の見出し）と、体質との相性の説明 */
export const WEAPON_INFO: Record<WeaponBaseId, { label: string; text: string }> = {
  sword: { label: '剣', text: '柔らかい敵によく効く。硬い敵・霊体には効きにくい' },
  hammer: { label: '槌', text: '硬い敵によく効く。霊体には効きにくい' },
  staff: { label: '杖', text: '霊体によく効く。柔らかい敵には効きにくい' },
};

/** 防具の種類の名前と説明（属性の耐性は付かない。指輪の役目）。種類ごとの働きの数字は armor.ts の ARMOR_CONFIG */
export const ARMOR_INFO: Record<ArmorBaseId, { label: string; text: string }> = {
  plate: { label: '鎧', text: '受けるダメージを減らす（属性には関係しない）' },
  robe: { label: '法衣', text: '守りは低いが、魔法が強くなり、魔力の回復が速い（呪文書を持っていくとき向け）' },
  cloak: { label: '毛皮の外套', text: '鈍足にならない（霜の床でも足が重くならない）。お腹が空きにくく、空腹の攻撃で減る満腹度も半分' },
};

/** 属性の逆（炎と氷、光と闇）。指輪の弱点になる。無属性にはない */
export const OPPOSITE: Partial<Record<Element, Element>> = { fire: 'ice', ice: 'fire', light: 'dark', dark: 'light' };
const ELEMENT_WORD: Record<Element, string> = { fire: '炎', ice: '氷', neutral: '無属性', light: '光', dark: '闇' };
const ELEMENT_SHORT: Record<Element, string> = { fire: '炎', ice: '氷', neutral: '無', light: '光', dark: '闇' };
/** 属性の並び順（二重耐性の指輪の組み合わせで、先に来るほう） */
const ELEMENT_ORDER: readonly Element[] = ['fire', 'ice', 'neutral', 'light', 'dark'];
/** 二重耐性の指輪の組み合わせ（10通り） */
export const DUAL_PAIRS: readonly DualPair[] = ELEMENT_ORDER.flatMap((a, i) => ELEMENT_ORDER.slice(i + 1).map((b) => `${a}_${b}` as DualPair));
export const pairElements = (pair: DualPair): [Element, Element] => pair.split('_') as [Element, Element];

/** 指輪の種類の名前（管理画面の見出し）と、効き方の説明（cut は耐性の%、weak は逆の属性で増える%） */
export const RING_INFO: Record<RingKind, { label: string; text: (cut: number, weak: number) => string }> = {
  fire: {
    label: '炎の指輪',
    text: (c, w) => `炎のダメージを${c}%カットする（光の攻撃は半分だけ）。氷のダメージが${w}%増える（闇の攻撃は半分だけ）`,
  },
  ice: {
    label: '氷の指輪',
    text: (c, w) => `氷のダメージを${c}%カットする（闇の攻撃は半分だけ）。炎のダメージが${w}%増える（光の攻撃は半分だけ）`,
  },
  neutral: { label: '無属性の指輪', text: (c) => `無属性のダメージを${c}%カットする（光・闇の攻撃は半分だけ）` },
  light: { label: '光の指輪', text: (c, w) => `光の攻撃のダメージを${c}%カットする。闇の攻撃のダメージが${w}%増える` },
  dark: { label: '闇の指輪', text: (c, w) => `闇の攻撃のダメージを${c}%カットする。光の攻撃のダメージが${w}%増える` },
  all: { label: '万能の指輪', text: (c) => `すべての属性のダメージを${c}%カットする` },
};

/** 属性の指輪1つ分の守り（耐性と、逆の属性の弱点）。cut と weak は%（weak は耐性の何%分、逆の属性で増えるか） */
export function elementGuards(element: Element, cut: number, weak = 0): Guard[] {
  const rate = (100 - cut) / 100;
  const up = Math.round((1 + (cut * weak) / 10000) * 1e6) / 1e6;
  const one = (e: Element, r: number): Guard => (e === 'light' || e === 'dark' ? { kind: 'whole', element: e, rate: r } : { kind: 'component', component: e, rate: r });
  const opposite = OPPOSITE[element];
  return [one(element, rate), ...(opposite && weak > 0 ? [one(opposite, up)] : [])];
}

/** 道具の働きと説明 */
export const SUPPLY_INFO: Record<SupplyId, { effect: ItemEffect; text: string }> = {
  potion: { effect: { kind: 'heal', hp: 15 }, text: 'HPを15回復する' },
  panacea: { effect: { kind: 'cure' }, text: '毒と鈍足をすべて治す（回復薬では治らない）' },
  food: { effect: { kind: 'food', satiety: 200 }, text: '満腹度を200回復する' },
  fire_whetstone: { effect: { kind: 'enchant', element: 'fire', hits: 5 }, text: '武器に炎の力を宿す（攻撃5回）。氷の敵によく効く。当てた敵の足元に燃える床が残る' },
  ice_whetstone: { effect: { kind: 'enchant', element: 'ice', hits: 5 }, text: '武器に氷の力を宿す（攻撃5回）。炎の敵によく効く。当てた敵の足元に霜の床が残る' },
  holy_water: { effect: { kind: 'enchant', element: 'light', hits: 5 }, text: '武器に光の力を宿す（攻撃5回）。闇の敵によく効く' },
  dark_oil: { effect: { kind: 'enchant', element: 'dark', hits: 5 }, text: '武器に闇の力を宿す（攻撃5回）。光の敵によく効く' },
  bag: { effect: { kind: 'capacity', slots: 3 }, text: '持っていくと、道具を持てる数が3つ増える（袋そのものは数えない。ダンジョンに1回持っていくとなくなる）' },
  lantern: { effect: { kind: 'sight', radius: 5 }, text: '持っていくと、視界が半径5マスに広がる（ダンジョンに1回持っていくとなくなる）' },
};

/** 呪文書の説明（持っていくと、探索で魔力を使ってその呪文を何度でも唱えられる） */
export const SPELLBOOK_TEXT: Record<SpellbookId, string> = {
  book_shockwave: 'まわりの敵を吹き飛ばす。ダメージは控えめだが、壁や敵にぶつけると追加ダメージ',
  book_shockwave_strong: 'まわりの敵を吹き飛ばし、1ターン動けなくする。ダメージは控えめだが、壁や敵にぶつけると追加ダメージ',
  book_sweep: '向いた方向の数マスを貫き、並んだ敵すべてに当たる',
  book_sweep_bleed: '向いた方向の数マスを貫き、並んだ敵すべてに当たる。当たった敵は3ターン出血し、毎ターン、なぎ払いのダメージの2割を受ける',
  book_fire_bolt: '炎の矢を放つ。氷と闇の敵によく効く。当たった敵の足元に燃える床が残る',
  book_fire_chain: '炎の矢を放ち、当たった敵のまわり8マスの敵にも、ダメージの半分を与える。氷と闇の敵によく効く。当たった敵のまわり8マスに燃える床が残る',
  book_ice_chain: '氷の矢を放ち、当たった敵のまわり8マスの敵にも、ダメージの半分を与える。炎と光の敵によく効く。当たった敵のまわり8マスに霜の床が残る',
  book_ice_bolt: '氷の矢を放つ。炎と光の敵によく効く。当たった敵の足元に霜の床が残る',
  book_light_lance: '光の槍を放つ。闇の敵によく効く',
  book_light_chain: '光の槍を放ち、当たった敵のまわり8マスの敵にも、ダメージの半分を与える。闇の敵によく効く',
  book_dark_bolt: '闇の矢を放つ。光の敵によく効く',
  book_dark_chain: '闇の矢を放ち、当たった敵のまわり8マスの敵にも、ダメージの半分を与える。光の敵によく効く',
  book_heal: 'すぐにHPを回復する',
  book_regen: '数ターンかけて、少しずつHPを回復する',
};

// ===== 段階と ID =====

/** 武器・防具の段階ごとの ID（1段目は種類の ID のまま、2段目からは sword_2 のように） */
export function gearId(base: GearBaseId, tier: number): GearId {
  return (tier <= 1 ? base : `${base}_${tier as GearTier}`) as GearId;
}

/** 武器・防具なら、その種類と段階（1〜10）。ほかの品物なら null */
export function gearOf(id: ItemId): { base: GearBaseId; tier: number } | null {
  const m = /^([a-z_]+?)(?:_(\d+))?$/.exec(id);
  const base = m?.[1] as GearBaseId | undefined;
  if (!m || !base || !GEAR_BASES.includes(base)) return null;
  return { base, tier: m[2] ? Number(m[2]) : 1 };
}

/** 武器・防具の種類（段階を取り除いた ID）。アイコンや見た目は種類で決まる。ほかの品物はそのまま */
export function baseItemOf(id: ItemId): ItemId {
  return gearOf(id)?.base ?? id;
}

/** 指輪の ID（kind：種類、level：1〜5） */
export const ringId = (kind: RingKind, level: number): RingId => `ring_${kind}_${level as RingLevel}`;
/** 二重耐性の指輪の ID */
export const dualRingId = (pair: DualPair, level: number): RingId => `ring_dual_${pair}_${level as RingLevel}`;

/** 指輪なら、その種類（kind：1つの属性か万能。dual：二重耐性なら、2つの属性）と段階（1〜5）。ほかの品物なら null */
export function ringOf(id: ItemId): { kind: RingKind | 'dual'; pair: DualPair | null; level: number } | null {
  const m = /^ring_(?:(dual)_([a-z]+_[a-z]+)|([a-z]+))_(\d+)$/.exec(id);
  if (!m) return null;
  return m[1] ? { kind: 'dual', pair: m[2] as DualPair, level: Number(m[4]) } : { kind: m[3] as RingKind, pair: null, level: Number(m[4]) };
}

/** 同じ種類の指輪かを見分ける印（段階は関係ない。炎の指輪なら 'fire'、二重耐性の指輪なら 'fire_ice'）。指輪でなければ null */
export function ringKey(id: ItemId): string | null {
  const r = ringOf(id);
  return r ? (r.kind === 'dual' ? (r.pair as string) : r.kind) : null;
}

/** 指輪の名前（二重耐性の指輪は、設定にある名前ではなく、組み合わせから付ける） */
export const dualRingName = (pair: DualPair, level: number): string => {
  const [a, b] = pairElements(pair);
  return `二重耐性の指輪（${ELEMENT_SHORT[a]}・${ELEMENT_SHORT[b]}）${level > 1 ? `+${level - 1}` : ''}`;
};

// ===== 品物の一覧を作る =====

/** 設定から、すべての品物（ITEMS）を作る */
export function itemDefs(master: ItemMaster): Record<ItemId, ItemDef> {
  const out = {} as Record<ItemId, ItemDef>;
  for (const base of WEAPON_BASES) {
    master.weapons[base].forEach((t, i) => {
      const id = gearId(base, i + 1);
      const stats = t.mag > 0 ? `攻撃力+${t.atk}、魔力+${t.mag}` : `攻撃力+${t.atk}`;
      out[id] = { id, name: t.name, price: t.price, description: `${stats}。${WEAPON_INFO[base].text}`, effect: { kind: 'weapon', weapon: base, atk: t.atk, mag: t.mag } };
    });
  }
  for (const base of ARMOR_BASES) {
    master.armors[base].forEach((t, i) => {
      const id = gearId(base, i + 1);
      const stats = t.mag > 0 ? `守り+${t.def}、魔力+${t.mag}` : `守り+${t.def}`;
      out[id] = { id, name: t.name, price: t.price, description: `${ARMOR_INFO[base].text}。${stats}`, effect: { kind: 'armor', armor: base, def: t.def, mag: t.mag } };
    });
  }
  for (const kind of RING_KINDS) {
    master.rings.kinds[kind].forEach((t, i) => {
      const id = ringId(kind, i + 1);
      const guards: Guard[] = kind === 'all' ? [{ kind: 'all', rate: (100 - t.cut) / 100 }] : elementGuards(kind, t.cut, master.rings.weak);
      const weak = Math.round((t.cut * master.rings.weak) / 100);
      out[id] = { id, name: t.name, price: t.price, description: RING_INFO[kind].text(t.cut, weak), effect: { kind: 'ring', guards, cut: t.cut } };
    });
  }
  // 二重耐性の指輪は店では売らない（敵が落とす）。値段は、店に並べないので意味がない（1）
  for (const pair of DUAL_PAIRS) {
    const [a, b] = pairElements(pair);
    master.rings.dualCut.forEach((cut, i) => {
      const id = dualRingId(pair, i + 1);
      out[id] = {
        id,
        name: dualRingName(pair, i + 1),
        price: 1,
        description: `${ELEMENT_WORD[a]}と${ELEMENT_WORD[b]}のダメージを、それぞれ${cut}%カットする。弱点はない`,
        effect: { kind: 'ring', guards: [...elementGuards(a, cut), ...elementGuards(b, cut)], cut },
      };
    });
  }
  for (const id of SUPPLY_IDS) out[id] = { id, ...master.supplies[id], description: SUPPLY_INFO[id].text, effect: SUPPLY_INFO[id].effect };
  for (const id of SPELLBOOK_IDS) {
    out[id] = { id, ...master.spellbooks[id], description: SPELLBOOK_TEXT[id], effect: { kind: 'spellbook', spell: id.slice('book_'.length) as SpellId } };
  }
  return out;
}

// ===== 確かめる =====

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const intIn = (v: unknown, r: { min: number; max: number }) => typeof v === 'number' && Number.isInteger(v) && v >= r.min && v <= r.max;

/** 設定の直すところ（日本語の文）。なければ空 */
export function itemProblems(data: unknown): string[] {
  const out: string[] = [];
  if (!isObj(data)) return ['品物の設定が読めない'];
  const names = new Map<string, string>();
  const checkName = (label: string, name: unknown) => {
    if (typeof name !== 'string' || !name.trim()) return out.push(`${label}：名前が空になっている`);
    if (name.length > ITEM_LIMITS.name.max) return out.push(`${label}：名前は${ITEM_LIMITS.name.max}文字までにする`);
    const other = names.get(name.trim());
    if (other) return out.push(`${label}：名前「${name}」が、${other}と同じになっている`);
    names.set(name.trim(), label);
  };
  const checkInt = (label: string, what: string, v: unknown, r: { min: number; max: number }) => {
    if (!intIn(v, r)) out.push(`${label}：${what}は${r.min}〜${r.max}の整数にする`);
  };
  const tiers = (group: unknown, base: string, label: string, kind: 'weapon' | 'armor' | 'ring') => {
    const list = isObj(group) ? group[base] : undefined;
    const size = kind === 'ring' ? RING_LEVELS : GEAR_TIERS;
    if (!Array.isArray(list) || list.length !== size) return void out.push(`${label}：${size}段階そろっていない`);
    list.forEach((t: unknown, i) => {
      const at = `${label}の${i + 1}段目`;
      if (!isObj(t)) return void out.push(`${at}：読めない`);
      checkName(at, t.name);
      checkInt(at, '値段', t.price, ITEM_LIMITS.price);
      if (kind === 'weapon') {
        checkInt(at, '攻撃力', t.atk, ITEM_LIMITS.atk);
        checkInt(at, '魔力', t.mag, ITEM_LIMITS.mag);
      } else if (kind === 'armor') {
        checkInt(at, '守り', t.def, ITEM_LIMITS.def);
        checkInt(at, '魔力', t.mag, ITEM_LIMITS.mag);
      } else {
        checkInt(at, '耐性', t.cut, ITEM_LIMITS.cut);
      }
      // 段階が上がるほど高く、強くする（下の段より安い・弱い段は作らない）
      const prev = i > 0 && isObj(list[i - 1]) ? (list[i - 1] as Record<string, unknown>) : null;
      if (!prev) return;
      if (typeof t.price === 'number' && typeof prev.price === 'number' && t.price < prev.price) out.push(`${at}：値段が${i}段目（${prev.price}G）より安い`);
      if (kind === 'weapon' && typeof t.atk === 'number' && typeof prev.atk === 'number' && t.atk < prev.atk) out.push(`${at}：攻撃力が${i}段目より低い`);
      if (kind !== 'ring' && typeof t.mag === 'number' && typeof prev.mag === 'number' && t.mag < prev.mag) out.push(`${at}：魔力が${i}段目より低い`);
      if (kind === 'armor' && typeof t.def === 'number' && typeof prev.def === 'number' && t.def < prev.def) out.push(`${at}：守りが${i}段目より低い`);
      if (kind === 'ring' && typeof t.cut === 'number' && typeof prev.cut === 'number' && t.cut < prev.cut) out.push(`${at}：耐性が${i}段目より低い`);
    });
  };
  for (const b of WEAPON_BASES) tiers(data.weapons, b, WEAPON_INFO[b].label, 'weapon');
  for (const b of ARMOR_BASES) tiers(data.armors, b, ARMOR_INFO[b].label, 'armor');
  const rings = isObj(data.rings) ? data.rings : null;
  if (!rings) out.push('指輪の設定が読めない');
  else {
    for (const k of RING_KINDS) tiers(rings.kinds, k, RING_INFO[k].label, 'ring');
    checkInt('指輪の弱点', '大きさ（耐性の何%分か）', rings.weak, ITEM_LIMITS.weak);
    const dual = rings.dualCut;
    if (!Array.isArray(dual) || dual.length !== RING_LEVELS) out.push(`二重耐性の指輪：${RING_LEVELS}段階そろっていない`);
    else {
      dual.forEach((c: unknown, i) => {
        checkInt(`二重耐性の指輪の${i + 1}段目`, '耐性', c, ITEM_LIMITS.cut);
        if (i > 0 && typeof c === 'number' && typeof dual[i - 1] === 'number' && c < (dual[i - 1] as number)) out.push(`二重耐性の指輪の${i + 1}段目：耐性が${i}段目より低い`);
      });
    }
  }
  const plain = (group: unknown, ids: readonly string[], label: string) => {
    for (const id of ids) {
      const v = isObj(group) ? group[id] : undefined;
      const at = `${label}（${id}）`;
      if (!isObj(v)) {
        out.push(`${at}：読めない`);
        continue;
      }
      checkName(at, v.name);
      checkInt(at, '値段', v.price, ITEM_LIMITS.price);
    }
  };
  plain(data.supplies, SUPPLY_IDS, '道具');
  plain(data.spellbooks, SPELLBOOK_IDS, '呪文書');
  for (const t of INFO_TOPICS) {
    const v = isObj(data.information) ? data.information[t] : undefined;
    checkInt(`情報料（${INFO_LABELS[t]}）`, '値段', v, ITEM_LIMITS.info);
  }
  return out;
}

export function parseItemMaster(data: unknown): ItemMaster {
  const problems = itemProblems(data);
  if (problems.length) throw new Error(`品物の設定（items.json）が正しくない：\n${problems.join('\n')}`);
  return data as ItemMaster;
}

export function serializeItemMaster(master: ItemMaster): string {
  return `${JSON.stringify(master, null, 2)}\n`;
}

/** 変えたところを、日本語の文で並べる（公開の欄とコミットの説明に使う） */
export function describeItemChanges(before: ItemMaster, after: ItemMaster): string[] {
  const out: string[] = [];
  const tierFields = { name: '名前', atk: '攻撃力', mag: '魔力', def: '守り', cut: '耐性', price: '値段' } as const;
  const diff = (label: string, a: Record<string, unknown>, b: Record<string, unknown>) => {
    for (const [k, word] of Object.entries(tierFields)) {
      if (k in b && a[k] !== b[k]) out.push(`${label}：${word} ${String(a[k])} → ${String(b[k])}`);
    }
  };
  for (const b of WEAPON_BASES) after.weapons[b].forEach((t, i) => diff(`${before.weapons[b][i]?.name ?? WEAPON_INFO[b].label}（${i + 1}段目）`, before.weapons[b][i] ?? {}, t));
  for (const b of ARMOR_BASES) after.armors[b].forEach((t, i) => diff(`${before.armors[b][i]?.name ?? ARMOR_INFO[b].label}（${i + 1}段目）`, before.armors[b][i] ?? {}, t));
  for (const k of RING_KINDS) after.rings.kinds[k].forEach((t, i) => diff(`${before.rings.kinds[k][i]?.name ?? RING_INFO[k].label}（${i + 1}段目）`, before.rings.kinds[k][i] ?? {}, t));
  after.rings.dualCut.forEach((c, i) => {
    if (before.rings.dualCut[i] !== c) out.push(`二重耐性の指輪（${i + 1}段目）：耐性 ${String(before.rings.dualCut[i])} → ${c}`);
  });
  if (before.rings.weak !== after.rings.weak) out.push(`指輪の弱点の大きさ：${before.rings.weak} → ${after.rings.weak}`);
  for (const id of SUPPLY_IDS) diff(before.supplies[id].name, before.supplies[id], after.supplies[id]);
  for (const id of SPELLBOOK_IDS) diff(before.spellbooks[id].name, before.spellbooks[id], after.spellbooks[id]);
  for (const t of INFO_TOPICS) {
    if (before.information[t] !== after.information[t]) out.push(`情報料（${INFO_LABELS[t]}）：${before.information[t]} → ${after.information[t]}`);
  }
  return out;
}
