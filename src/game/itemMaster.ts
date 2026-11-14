// 品物の設定（src/game/items.json）を読み、正しい形かを確かめる。
// items.json には、店で売るすべての品物の名前と値段がある。武器と防具は種類ごとに10段階あり、段階ごとに性能も決める
// （武器：攻撃力、防具：守りと、効く属性のダメージを何%に減らすか）。
// 品物の働き（回復薬はHPを15回復する、など）と、武器と体質の相性・防具の効く属性は、ここではなくプログラムで決まっている。
// items.json は、開発用の管理画面（?view=admin の「品物」タブ。src/ui/ItemPanels.tsx）から書き換えて公開できる。
// 読めない値が入っていたら、ゲームを動かさずにエラーにする（テストで見つかるので、公開はされない）

import type { ArmorGuard, GearBaseId, GearId, GearTier, ItemDef, ItemEffect, ItemId, SpellId, WeaponType } from './types';

export const GEAR_TIERS = 10;

export const WEAPON_BASES = ['sword', 'hammer', 'staff'] as const satisfies readonly (GearBaseId & WeaponType)[];
export type WeaponBaseId = (typeof WEAPON_BASES)[number];
export const ARMOR_BASES = ['fire_cloak', 'ice_cloak', 'plate', 'light_robe', 'dark_robe'] as const satisfies readonly GearBaseId[];
export type ArmorBaseId = (typeof ARMOR_BASES)[number];
export const GEAR_BASES: readonly GearBaseId[] = [...WEAPON_BASES, ...ARMOR_BASES];

export const SUPPLY_IDS = ['potion', 'food', 'fire_whetstone', 'ice_whetstone', 'holy_water', 'dark_oil'] as const satisfies readonly ItemId[];
export type SupplyId = (typeof SUPPLY_IDS)[number];
export const SPELLBOOK_IDS = [
  'book_shockwave',
  'book_sweep',
  'book_fire_bolt',
  'book_ice_bolt',
  'book_light_lance',
  'book_dark_bolt',
  'book_heal',
  'book_regen',
] as const satisfies readonly ItemId[];
export type SpellbookId = (typeof SPELLBOOK_IDS)[number];

/** 武器1段分。atk：持つと上がる攻撃力 */
export type WeaponTier = { name: string; atk: number; price: number };
/** 防具1段分。def：持つと上がる守り（受けるダメージから引く）、rate：効く属性のダメージを何%に減らすか */
export type ArmorTier = { name: string; def: number; rate: number; price: number };
/** 道具・呪文書1つ分 */
export type PlainItem = { name: string; price: number };

export type ItemMaster = {
  weapons: Record<WeaponBaseId, WeaponTier[]>;
  armors: Record<ArmorBaseId, ArmorTier[]>;
  supplies: Record<SupplyId, PlainItem>;
  spellbooks: Record<SpellbookId, PlainItem>;
};

export const ITEM_LIMITS = {
  name: { max: 16 },
  price: { min: 1, max: 99999 },
  atk: { min: 0, max: 99 },
  def: { min: 0, max: 99 },
  rate: { min: 0, max: 100 },
} as const;

// ===== 種類ごとに決まっていること（プログラムで決める） =====

/** 武器の種類の名前（管理画面の見出し）と、体質との相性の説明 */
export const WEAPON_INFO: Record<WeaponBaseId, { label: string; text: string }> = {
  sword: { label: '剣', text: '柔らかい敵によく効く。硬い敵・霊体には効きにくい' },
  hammer: { label: '槌', text: '硬い敵によく効く。霊体には効きにくい' },
  staff: { label: '杖', text: '霊体によく効く。柔らかい敵には効きにくい' },
};

/** 防具の種類の名前と、どの属性に効くか */
export const ARMOR_INFO: Record<ArmorBaseId, { label: string; guard: (rate: number) => ArmorGuard; text: (rate: number) => string }> = {
  fire_cloak: {
    label: '耐火のマント',
    guard: (rate) => ({ kind: 'component', component: 'fire', rate }),
    text: (r) => `炎のダメージを${r}%に減らす（光の攻撃は半分だけ）`,
  },
  ice_cloak: {
    label: '耐氷のマント',
    guard: (rate) => ({ kind: 'component', component: 'ice', rate }),
    text: (r) => `氷のダメージを${r}%に減らす（闇の攻撃は半分だけ）`,
  },
  plate: {
    label: '鎧',
    guard: (rate) => ({ kind: 'component', component: 'neutral', rate }),
    text: (r) => `無属性のダメージを${r}%に減らす（光・闇の攻撃は半分だけ）`,
  },
  light_robe: {
    label: '光の衣',
    guard: (rate) => ({ kind: 'whole', element: 'light', rate }),
    text: (r) => `光の攻撃を${r}%に減らす。ほかの属性には効かない`,
  },
  dark_robe: {
    label: '闇の衣',
    guard: (rate) => ({ kind: 'whole', element: 'dark', rate }),
    text: (r) => `闇の攻撃を${r}%に減らす。ほかの属性には効かない`,
  },
};

/** 道具の働きと説明 */
export const SUPPLY_INFO: Record<SupplyId, { effect: ItemEffect; text: string }> = {
  potion: { effect: { kind: 'heal', hp: 15 }, text: 'HPを15回復する' },
  food: { effect: { kind: 'food', satiety: 200 }, text: '満腹度を200回復する' },
  fire_whetstone: { effect: { kind: 'enchant', element: 'fire', hits: 5 }, text: '武器に炎の力を宿す（攻撃5回）。氷の敵によく効く' },
  ice_whetstone: { effect: { kind: 'enchant', element: 'ice', hits: 5 }, text: '武器に氷の力を宿す（攻撃5回）。炎の敵によく効く' },
  holy_water: { effect: { kind: 'enchant', element: 'light', hits: 5 }, text: '武器に光の力を宿す（攻撃5回）。闇の敵によく効く' },
  dark_oil: { effect: { kind: 'enchant', element: 'dark', hits: 5 }, text: '武器に闇の力を宿す（攻撃5回）。光の敵によく効く' },
};

/** 呪文書の説明（持っていくと、探索で魔力を使ってその呪文を何度でも唱えられる） */
export const SPELLBOOK_TEXT: Record<SpellbookId, string> = {
  book_shockwave: 'まわりの敵を吹き飛ばす。ダメージは控えめだが、壁や敵にぶつけると追加ダメージ',
  book_sweep: '向いた方向の数マスを貫き、並んだ敵すべてに当たる',
  book_fire_bolt: '炎の矢を放つ。氷と闇の敵によく効く',
  book_ice_bolt: '氷の矢を放つ。炎と光の敵によく効く',
  book_light_lance: '光の槍を放つ。闇の敵によく効く',
  book_dark_bolt: '闇の矢を放つ。光の敵によく効く',
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

// ===== 品物の一覧を作る =====

/** 設定から、すべての品物（ITEMS）を作る */
export function itemDefs(master: ItemMaster): Record<ItemId, ItemDef> {
  const out = {} as Record<ItemId, ItemDef>;
  for (const base of WEAPON_BASES) {
    master.weapons[base].forEach((t, i) => {
      const id = gearId(base, i + 1);
      out[id] = { id, name: t.name, price: t.price, description: `攻撃力+${t.atk}。${WEAPON_INFO[base].text}`, effect: { kind: 'weapon', weapon: base, atk: t.atk } };
    });
  }
  for (const base of ARMOR_BASES) {
    master.armors[base].forEach((t, i) => {
      const id = gearId(base, i + 1);
      const info = ARMOR_INFO[base];
      out[id] = {
        id,
        name: t.name,
        price: t.price,
        description: `${info.text(t.rate)}${t.def > 0 ? `。守り+${t.def}` : ''}`,
        effect: { kind: 'armor', guard: info.guard(t.rate / 100), def: t.def },
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
  const tiers = (group: unknown, base: string, label: string, kind: 'weapon' | 'armor') => {
    const list = isObj(group) ? group[base] : undefined;
    if (!Array.isArray(list) || list.length !== GEAR_TIERS) return void out.push(`${label}：${GEAR_TIERS}段階そろっていない`);
    list.forEach((t: unknown, i) => {
      const at = `${label}の${i + 1}段目`;
      if (!isObj(t)) return void out.push(`${at}：読めない`);
      checkName(at, t.name);
      checkInt(at, '値段', t.price, ITEM_LIMITS.price);
      if (kind === 'weapon') checkInt(at, '攻撃力', t.atk, ITEM_LIMITS.atk);
      else {
        checkInt(at, '守り', t.def, ITEM_LIMITS.def);
        checkInt(at, 'ダメージの割合', t.rate, ITEM_LIMITS.rate);
      }
      // 段階が上がるほど高く、強くする（下の段より安い・弱い段は作らない）
      const prev = i > 0 && isObj(list[i - 1]) ? (list[i - 1] as Record<string, unknown>) : null;
      if (!prev) return;
      if (typeof t.price === 'number' && typeof prev.price === 'number' && t.price < prev.price) out.push(`${at}：値段が${i}段目（${prev.price}G）より安い`);
      if (kind === 'weapon' && typeof t.atk === 'number' && typeof prev.atk === 'number' && t.atk < prev.atk) out.push(`${at}：攻撃力が${i}段目より低い`);
      if (kind === 'armor') {
        if (typeof t.def === 'number' && typeof prev.def === 'number' && t.def < prev.def) out.push(`${at}：守りが${i}段目より低い`);
        if (typeof t.rate === 'number' && typeof prev.rate === 'number' && t.rate > prev.rate) out.push(`${at}：ダメージの割合が${i}段目より大きい（弱い）`);
      }
    });
  };
  for (const b of WEAPON_BASES) tiers(data.weapons, b, WEAPON_INFO[b].label, 'weapon');
  for (const b of ARMOR_BASES) tiers(data.armors, b, ARMOR_INFO[b].label, 'armor');
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
  const tierFields = { name: '名前', atk: '攻撃力', def: '守り', rate: 'ダメージの割合', price: '値段' } as const;
  const diff = (label: string, a: Record<string, unknown>, b: Record<string, unknown>) => {
    for (const [k, word] of Object.entries(tierFields)) {
      if (k in b && a[k] !== b[k]) out.push(`${label}：${word} ${String(a[k])} → ${String(b[k])}`);
    }
  };
  for (const b of WEAPON_BASES) after.weapons[b].forEach((t, i) => diff(`${before.weapons[b][i]?.name ?? WEAPON_INFO[b].label}（${i + 1}段目）`, before.weapons[b][i] ?? {}, t));
  for (const b of ARMOR_BASES) after.armors[b].forEach((t, i) => diff(`${before.armors[b][i]?.name ?? ARMOR_INFO[b].label}（${i + 1}段目）`, before.armors[b][i] ?? {}, t));
  for (const id of SUPPLY_IDS) diff(before.supplies[id].name, before.supplies[id], after.supplies[id]);
  for (const id of SPELLBOOK_IDS) diff(before.spellbooks[id].name, before.spellbooks[id], after.spellbooks[id]);
  return out;
}
