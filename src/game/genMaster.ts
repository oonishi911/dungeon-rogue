// ダンジョンの設定（src/game/dungeonGen.json）を読み、正しい形かを確かめる。
// dungeonGen.json は、開発用の管理画面（?view=gen、src/ui/GenAdmin.tsx）から書き換えて公開できる。
// floors は階の数とランクごとの広さ、rooms は小部屋の多さと大きさ、enemies は敵の数と置き方（部屋に集める・部屋には置かない・群れ部屋など）、
// growth は敵を倒したときのレベルの上がり方と強敵の報酬の倍率、magic は魔力と魔法の強さ、spells は呪文ごとの魔力と効き目。
// 読めない値が入っていたら、ゲームを動かさずにエラーにする（テストで見つかるので、公開はされない）

import raw from './dungeonGen.json';
import type { SpellId } from './types';

/** ランクの数（広さをランクごとに決めるので、sizes はこの数だけ並ぶ） */
export const RANK_COUNT = 9;

/** 階の数と広さ（explore.ts、rank.ts） */
export interface FloorSettings {
  count: number; // 通常の階の数。その下にボスの階がある
  sizes: number[]; // ランクごとの階の広さ（一辺のマス数）。ランク1から順に RANK_COUNT 個
}

/** 小部屋の置き方（map.ts） */
export interface RoomSettings {
  attemptRate: number; // 迷路のセル数に対する、部屋を置こうとする回数の割合。大きいほど部屋が増え、迷路の通路が減る
  minSize: number; // 部屋の一辺の最小（奇数）
  maxSize: number; // 部屋の一辺の最大（奇数）
}

/** 敵を置く場所。mixed：部屋にも通路にも（roomWeight で部屋の選ばれやすさを変える）、rooms：部屋だけ、corridors：通路だけ */
export const PLACEMENTS = ['mixed', 'rooms', 'corridors'] as const;
export type Placement = (typeof PLACEMENTS)[number];
export const PLACEMENT_LABELS: Record<Placement, string> = { mixed: '部屋にも通路にも', rooms: '部屋だけ', corridors: '通路だけ' };

/** 敵の数と置き方（enemies.ts） */
export interface EnemySettings {
  amount: number; // 通常の敵の数の倍率（1：今の数。ランクで広くなるほど増える分は、そのまま）
  placement: Placement;
  roomWeight: number; // mixed のとき、部屋の床が通路の床の何倍選ばれやすいか（1：同じ、0：部屋に置かない）
  nestChance: number; // 部屋が「群れ部屋」（敵がまとまっている部屋）になる確率（0〜1）。群れの敵は通常の敵とは別に足す。通路だけのときは作らない
  nestMin: number; // 群れ部屋に置く敵の数の最小
  nestMax: number; // 群れ部屋に置く敵の数の最大
  stayInRoom: boolean; // 部屋に置いた敵は、主人公に気付くまで部屋の中だけを歩く
}

/** 敵を倒したときのレベルの上がり方と、強敵の報酬の倍率（data.ts の REWARD_CONFIG） */
export interface GrowthSettings {
  expBase: number; // レベル1→2に必要な経験値
  expStep: number; // レベルが1上がるごとに、次に必要な経験値が増える量
  hpPerLevel: number; // 1レベルで増える最大HP（上がった分だけHPも回復する）
  atkPerLevel: number; // 1レベルで増える攻撃力
  maxLevel: number; // レベルの上限
  eliteRate: number; // 強敵を倒したときの金貨と経験値の倍率
}

/** 魔力と魔法の強さ（magic.ts） */
export interface MagicSettings {
  maxMp: number; // 魔力の最大
  regenEvery: number; // 何行動ごとに魔力が1回復するか
  power: number; // 魔法の強さのもと（呪文のダメージ＝これ×呪文の倍率。防御は無視する）
  staffPower: number; // 杖を持っているときの、魔法の強さの倍率
  staffMp: number; // 杖を持っているときに増える魔力の最大
  noiseRadius: number; // 唱えると、このマス数以内のうろついている敵が気付く（0：気付かない）
}

/** 呪文ごとの設定。どの呪文にも cost（使う魔力）があり、ほかの項目は呪文の働きごとに違う（SPELL_FIELDS） */
export type SpellSettings = Record<SpellId, Record<string, number>>;

export interface GenSettings {
  floors: FloorSettings;
  rooms: RoomSettings;
  enemies: EnemySettings;
  growth: GrowthSettings;
  magic: MagicSettings;
  spells: SpellSettings;
}

/** 魔力と魔法の強さの項目（名前・範囲・整数か） */
export const MAGIC_FIELDS: { key: keyof MagicSettings; label: string; min: number; max: number; step: number; hint: string }[] = [
  { key: 'maxMp', label: '魔力の最大', min: 0, max: 200, step: 1, hint: '探索を始めるときは、魔力がいっぱい' },
  { key: 'regenEvery', label: '魔力が1回復する行動数', min: 1, max: 100, step: 1, hint: 'この行動数ごとに、魔力が1回復する' },
  { key: 'power', label: '魔法の強さ', min: 0, max: 100, step: 1, hint: '呪文のダメージ＝魔法の強さ×呪文の倍率（敵の防御は無視する）' },
  { key: 'staffPower', label: '杖での魔法の強さの倍率', min: 1, max: 5, step: 0.1, hint: '杖を持っていると、魔法がこの倍だけ強くなる' },
  { key: 'staffMp', label: '杖で増える魔力の最大', min: 0, max: 100, step: 1, hint: '' },
  { key: 'noiseRadius', label: '唱えると気付かれる距離', min: 0, max: 20, step: 1, hint: 'このマス数以内の、うろついている敵が気付く（0：気付かない）' },
];

/** 呪文ごとの項目（名前・範囲・整数か）。どの呪文も最初は cost */
export const SPELL_FIELDS: Record<SpellId, { key: string; label: string; min: number; max: number; step: number; integer: boolean }[]> = (() => {
  const cost = { key: 'cost', label: '使う魔力', min: 0, max: 99, step: 1, integer: true };
  const power = { key: 'power', label: 'ダメージの倍率', min: 0, max: 10, step: 0.1, integer: false };
  const range = { key: 'range', label: '届くマス数', min: 1, max: 20, step: 1, integer: true };
  const bolt = [cost, power, range];
  return {
    shockwave: [
      cost,
      power,
      { key: 'push', label: '吹き飛ばすマス数', min: 0, max: 10, step: 1, integer: true },
      { key: 'crash', label: 'ぶつかったときの追加ダメージ', min: 0, max: 99, step: 1, integer: true },
    ],
    sweep: [cost, power, range],
    fire_bolt: bolt,
    ice_bolt: bolt,
    light_lance: bolt,
    dark_bolt: bolt,
    heal: [cost, { key: 'amount', label: '回復するHP', min: 0, max: 999, step: 1, integer: true }],
    regen: [
      cost,
      { key: 'amount', label: '1ターンに回復するHP', min: 0, max: 99, step: 1, integer: true },
      { key: 'turns', label: '続くターン数', min: 1, max: 99, step: 1, integer: true },
    ],
  };
})();

/** 呪文の名前（変更の説明と管理画面で使う。ゲームの中の名前は data.ts の SPELLS と同じ） */
export const SPELL_NAMES: Record<SpellId, string> = {
  shockwave: '衝撃波',
  sweep: 'なぎ払い',
  fire_bolt: '炎の矢',
  ice_bolt: '氷の矢',
  light_lance: '光の槍',
  dark_bolt: '闇の矢',
  heal: '癒し',
  regen: '再生',
};

/** 値の範囲（管理画面の入力欄も、この範囲にする）。step は管理画面で1回に動かす量 */
export const GEN_LIMITS = {
  floorCount: { min: 1, max: 10, step: 1 },
  floorSize: { min: 20, max: 100, step: 1 }, // map.ts の MAP_CONFIG（作れるマップの広さ）と同じ範囲
  attemptRate: { min: 0, max: 0.3, step: 0.01 },
  amount: { min: 0, max: 3, step: 0.1 },
  roomSize: { min: 3, max: 15, step: 2 },
  weight: { min: 0, max: 10, step: 0.5 },
  nestChance: { min: 0, max: 1, step: 0.05 },
  nestCount: { min: 1, max: 12, step: 1 },
  expBase: { min: 1, max: 999, step: 1 },
  expStep: { min: 0, max: 999, step: 1 },
  hpPerLevel: { min: 0, max: 50, step: 1 },
  atkPerLevel: { min: 0, max: 10, step: 1 },
  maxLevel: { min: 1, max: 99, step: 1 },
  eliteRate: { min: 0, max: 10, step: 0.5 },
} as const;

/** 項目の名前（管理画面と、変更の説明で使う） */
export const GEN_LABELS = {
  floorCount: '階の数',
  floorSize: '階の広さ',
  attemptRate: '部屋の多さ',
  minSize: '部屋の大きさ（最小）',
  maxSize: '部屋の大きさ（最大）',
  amount: '敵の数の倍率',
  placement: '敵を置く場所',
  roomWeight: '部屋の選ばれやすさ',
  nestChance: '群れ部屋になる確率',
  nestMin: '群れの敵の数（最小）',
  nestMax: '群れの敵の数（最大）',
  stayInRoom: '部屋の敵は部屋から出ない',
  expBase: '最初のレベルアップに要る経験値',
  expStep: '1レベルごとに増える必要経験値',
  hpPerLevel: '1レベルで増える最大HP',
  atkPerLevel: '1レベルで増える攻撃',
  maxLevel: 'レベルの上限',
  eliteRate: '強敵の金貨と経験値の倍率',
} as const;

/** 形のおかしいところを、すべて日本語の文で返す（なければ空） */
export function genProblems(data: unknown): string[] {
  const problems: string[] = [];
  if (!isObject(data) || !isObject(data.floors) || !isObject(data.rooms) || !isObject(data.enemies) || !isObject(data.growth) || !isObject(data.magic) || !isObject(data.spells)) {
    return ['floors・rooms・enemies・growth・magic・spells のどれかがない'];
  }
  const { rooms, enemies } = data;
  const num = (v: unknown, label: string, lim: { min: number; max: number }) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lim.min || v > lim.max) problems.push(`${label}：${lim.min}〜${lim.max}の数にする`);
  };
  const { floors } = data;
  num(floors.count, GEN_LABELS.floorCount, GEN_LIMITS.floorCount);
  if (typeof floors.count === 'number' && !Number.isInteger(floors.count)) problems.push(`${GEN_LABELS.floorCount}：整数にする`);
  const sizes = floors.sizes;
  if (!Array.isArray(sizes) || sizes.length !== RANK_COUNT) {
    problems.push(`${GEN_LABELS.floorSize}：ランク1〜${RANK_COUNT}の${RANK_COUNT}個を並べる`);
  } else {
    sizes.forEach((v: unknown, i) => {
      const label = `ランク${i + 1}の${GEN_LABELS.floorSize}`;
      num(v, label, GEN_LIMITS.floorSize);
      if (typeof v === 'number' && !Number.isInteger(v)) problems.push(`${label}：整数にする`);
      const prev: unknown = sizes[i - 1];
      if (i > 0 && typeof v === 'number' && typeof prev === 'number' && v < prev) problems.push(`${label}：ランク${i}の広さ（${prev}）以上にする`);
    });
  }
  num(rooms.attemptRate, GEN_LABELS.attemptRate, GEN_LIMITS.attemptRate);
  for (const k of ['minSize', 'maxSize'] as const) {
    const v = rooms[k];
    num(v, GEN_LABELS[k], GEN_LIMITS.roomSize);
    if (typeof v === 'number' && (!Number.isInteger(v) || v % 2 === 0)) problems.push(`${GEN_LABELS[k]}：奇数にする`);
  }
  if (typeof rooms.minSize === 'number' && typeof rooms.maxSize === 'number' && rooms.minSize > rooms.maxSize) {
    problems.push('部屋の大きさ：最小を最大以下にする');
  }
  num(enemies.amount, GEN_LABELS.amount, GEN_LIMITS.amount);
  if (!PLACEMENTS.includes(enemies.placement as Placement)) problems.push(`${GEN_LABELS.placement}：${PLACEMENTS.join('・')}のどれかにする`);
  num(enemies.roomWeight, GEN_LABELS.roomWeight, GEN_LIMITS.weight);
  num(enemies.nestChance, GEN_LABELS.nestChance, GEN_LIMITS.nestChance);
  for (const k of ['nestMin', 'nestMax'] as const) {
    const v = enemies[k];
    num(v, GEN_LABELS[k], GEN_LIMITS.nestCount);
    if (typeof v === 'number' && !Number.isInteger(v)) problems.push(`${GEN_LABELS[k]}：整数にする`);
  }
  if (typeof enemies.nestMin === 'number' && typeof enemies.nestMax === 'number' && enemies.nestMin > enemies.nestMax) {
    problems.push('群れの敵の数：最小を最大以下にする');
  }
  const { growth } = data;
  for (const k of ['expBase', 'expStep', 'hpPerLevel', 'atkPerLevel', 'maxLevel'] as const) {
    num(growth[k], GEN_LABELS[k], GEN_LIMITS[k]);
    if (typeof growth[k] === 'number' && !Number.isInteger(growth[k])) problems.push(`${GEN_LABELS[k]}：整数にする`);
  }
  num(growth.eliteRate, GEN_LABELS.eliteRate, GEN_LIMITS.eliteRate);
  const { magic, spells } = data;
  for (const f of MAGIC_FIELDS) {
    num(magic[f.key], f.label, f);
    if (Number.isInteger(f.step) && typeof magic[f.key] === 'number' && !Number.isInteger(magic[f.key])) problems.push(`${f.label}：整数にする`);
  }
  for (const [id, fields] of Object.entries(SPELL_FIELDS) as [SpellId, (typeof SPELL_FIELDS)[SpellId]][]) {
    const spell = spells[id];
    if (!isObject(spell)) {
      problems.push(`${SPELL_NAMES[id]}の設定がない`);
      continue;
    }
    for (const f of fields) {
      const label = `${SPELL_NAMES[id]}の${f.label}`;
      num(spell[f.key], label, f);
      if (f.integer && typeof spell[f.key] === 'number' && !Number.isInteger(spell[f.key])) problems.push(`${label}：整数にする`);
    }
  }
  if (typeof enemies.stayInRoom !== 'boolean') problems.push(`${GEN_LABELS.stayInRoom}：true か false にする`);
  return problems;
}

export function parseGenSettings(data: unknown): GenSettings {
  const problems = genProblems(data);
  if (problems.length) throw new Error(`dungeonGen.json の形が正しくありません：${problems.join(' / ')}`);
  return data as GenSettings;
}

/** リポジトリに保存する形（2つ空けの JSON。最後に改行） */
export function serializeGenSettings(settings: GenSettings): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
}

/** 変えたところを、日本語の文で返す（公開するときのコミットの説明と、画面の一覧に使う） */
export function describeGenChanges(before: GenSettings, after: GenSettings): string[] {
  const out: string[] = [];
  const show = (v: number | boolean | string) =>
    typeof v === 'boolean' ? (v ? 'する' : 'しない') : typeof v === 'string' ? (PLACEMENT_LABELS[v as Placement] ?? v) : String(v);
  if (before.floors.count !== after.floors.count) out.push(`${GEN_LABELS.floorCount}：${before.floors.count} → ${after.floors.count}`);
  after.floors.sizes.forEach((size, i) => {
    const old = before.floors.sizes[i];
    if (old !== size) out.push(`ランク${i + 1}の${GEN_LABELS.floorSize}：${old} → ${size}`);
  });
  for (const group of ['rooms', 'enemies', 'growth'] as const) {
    const a = before[group] as unknown as Record<string, number | boolean | string>;
    const b = after[group] as unknown as Record<string, number | boolean | string>;
    for (const k of Object.keys(b)) {
      if (a[k] !== b[k]) out.push(`${GEN_LABELS[k as keyof typeof GEN_LABELS]}：${show(a[k]!)} → ${show(b[k]!)}`);
    }
  }
  for (const f of MAGIC_FIELDS) {
    if (before.magic[f.key] !== after.magic[f.key]) out.push(`${f.label}：${before.magic[f.key]} → ${after.magic[f.key]}`);
  }
  for (const [id, fields] of Object.entries(SPELL_FIELDS) as [SpellId, (typeof SPELL_FIELDS)[SpellId]][]) {
    for (const f of fields) {
      const a = before.spells[id][f.key];
      const b = after.spells[id][f.key];
      if (a !== b) out.push(`${SPELL_NAMES[id]}の${f.label}：${a} → ${b}`);
    }
  }
  return out;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** ゲームで使う設定 */
export const GEN_SETTINGS: GenSettings = parseGenSettings(raw);
