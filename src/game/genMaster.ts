// ダンジョンの設定ファイル（src/game/dungeons/<ID>.json。1つのファイルが、プレイヤーの選べるダンジョン1つ）の形を決め、正しいかを確かめる。
// ファイルは、開発用の管理画面（?view=admin の「名前と説明」から「魔法」までのタブ。src/ui/Admin.tsx、src/ui/GenPanels.tsx）から、
// 書き換える・複製して新しく作る・消すことができる。読み込むのは dungeons.ts。
// name と description はダンジョンを選ぶ画面に出す名前と説明、
// floors は階の数と広さ・満腹度、rooms は小部屋の多さと大きさ、enemies は敵の数と置き方（部屋に集める・部屋には置かない・群れ部屋など）、
// growth は敵を倒したときのレベルの上がり方と強敵の報酬の倍率、magic は魔力と魔法の強さ、spells は呪文ごとの魔力と効き目、
// encounters はダンジョンの属性ごとに出る敵（敵のマスター enemies.json から選ぶ）。
// 読めない値が入っていたら、ゲームを動かさずにエラーにする（テストで見つかるので、公開はされない）

import { cleanEncounters, describeEncounterChanges, encounterProblems, type EnemyMaster, type Encounters } from './enemyMaster';
import type { EnemyId, SpellId } from './types';

/** 階の数・広さ・満腹度（explore.ts、floorParams.ts） */
export interface FloorSettings {
  count: number; // 通常の階の数。その下にボスの階がある
  size: number; // 階の広さ（一辺のマス数）
  satiety: number; // 満腹度（探索のはじめの満腹度で、上限でもある）。広さや階の数からは計算しない
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
  amount: number; // 通常の敵の数の倍率（1：今の数。広さに合わせて増える分は、そのまま）
  placement: Placement;
  roomWeight: number; // mixed のとき、部屋の床が通路の床の何倍選ばれやすいか（1：同じ、0：部屋に置かない）
  nestChance: number; // 部屋が「群れ部屋」（敵がまとまっている部屋）になる確率（0〜1）。群れの敵は通常の敵とは別に足す。通路だけのときは作らない
  nestMin: number; // 群れ部屋に置く敵の数の最小
  nestMax: number; // 群れ部屋に置く敵の数の最大
  stayInRoom: boolean; // 部屋に置いた敵は、主人公に気付くまで部屋の中だけを歩く
  bossMinions: number; // ボスの部屋に、ボスといっしょに置く雑魚敵の数（道中と同じ種類から選ぶ）
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

/** マップと探索の設定（ダンジョンの設定ファイルのうち、名前・説明・出る敵を除いたもの） */
export interface GenSettings {
  floors: FloorSettings;
  rooms: RoomSettings;
  enemies: EnemySettings;
  growth: GrowthSettings;
  magic: MagicSettings;
  spells: SpellSettings;
}

/** ダンジョンの設定ファイル1つ（src/game/dungeons/<ID>.json）。ID はファイルの名前 */
export interface DungeonFile extends GenSettings {
  name: string; // ダンジョンを選ぶ画面に出す名前
  description: string; // ダンジョンを選ぶ画面に出す説明（なくてもよい）
  encounters: Encounters; // ダンジョンの属性ごとに、道中に出る敵とボス
}

/** ダンジョンの ID・名前・説明の決まり（ID はファイルの名前になる） */
export const DUNGEON_LIMITS = {
  id: { pattern: /^[a-z][a-z0-9_]{1,23}$/, max: 24 },
  name: { max: 16 },
  description: { max: 80 },
} as const;

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
  satiety: { min: 100, max: 100000, step: 100 },
  attemptRate: { min: 0, max: 0.3, step: 0.01 },
  amount: { min: 0, max: 3, step: 0.1 },
  roomSize: { min: 3, max: 15, step: 2 },
  weight: { min: 0, max: 10, step: 0.5 },
  nestChance: { min: 0, max: 1, step: 0.05 },
  nestCount: { min: 1, max: 12, step: 1 },
  bossMinions: { min: 0, max: 40, step: 1 },
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
  satiety: '満腹度',
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
  bossMinions: 'ボスの部屋の雑魚敵の数',
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
  num(floors.size, GEN_LABELS.floorSize, GEN_LIMITS.floorSize);
  if (typeof floors.size === 'number' && !Number.isInteger(floors.size)) problems.push(`${GEN_LABELS.floorSize}：整数にする`);
  num(floors.satiety, GEN_LABELS.satiety, GEN_LIMITS.satiety);
  if (typeof floors.satiety === 'number' && !Number.isInteger(floors.satiety)) problems.push(`${GEN_LABELS.satiety}：整数にする`);
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
  num(enemies.bossMinions, GEN_LABELS.bossMinions, GEN_LIMITS.bossMinions);
  if (typeof enemies.bossMinions === 'number' && !Number.isInteger(enemies.bossMinions)) problems.push(`${GEN_LABELS.bossMinions}：整数にする`);
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

/** ダンジョンの設定ファイルの、おかしいところ（名前・説明、マップと探索の設定、出る敵）。敵は master にいる敵から選ぶ */
export function dungeonProblems(data: unknown, master: Pick<EnemyMaster, 'enemies'>): string[] {
  if (!isObject(data)) return ['中身がない'];
  const problems: string[] = [];
  if (typeof data.name !== 'string' || !data.name.trim()) problems.push('名前がない');
  else if (data.name.length > DUNGEON_LIMITS.name.max) problems.push(`名前は${DUNGEON_LIMITS.name.max}文字まで`);
  if (typeof data.description !== 'string') problems.push('説明がない（なければ空の文字にする）');
  else if (data.description.length > DUNGEON_LIMITS.description.max) problems.push(`説明は${DUNGEON_LIMITS.description.max}文字まで`);
  return [...problems, ...genProblems(data), ...encounterProblems(data.encounters, master)];
}

/** ダンジョンの設定ファイルを読む。おかしいところがあれば、まとめてエラーにする */
export function parseDungeon(id: string, data: unknown, master: Pick<EnemyMaster, 'enemies'>): DungeonFile {
  const problems = [...(DUNGEON_LIMITS.id.pattern.test(id) ? [] : ['ファイルの名前（ID）は、英小文字で始まり、英小文字・数字・_ だけにする']), ...dungeonProblems(data, master)];
  if (problems.length) throw new Error(`ダンジョンの設定（src/game/dungeons/${id}.json）が正しくありません：${problems.join(' / ')}`);
  return data as DungeonFile;
}

/** リポジトリに保存する形（項目の並び順をそろえた、2つ空けの JSON。最後に改行） */
export function serializeDungeon(d: DungeonFile): string {
  const { name, description, floors, rooms, enemies, growth, magic, spells, encounters } = d;
  return `${JSON.stringify({ name, description, floors, rooms, enemies, growth, magic, spells, encounters: cleanEncounters(encounters) }, null, 2)}\n`;
}

/** ダンジョンの設定ファイルの、変えたところ（名前・説明・マップと探索の設定・出る敵）。names と alive は、敵の名前と、今も敵のデータにいるか */
export function describeDungeonChanges(before: DungeonFile, after: DungeonFile, names: (id: EnemyId) => string, alive: (id: EnemyId) => boolean): string[] {
  const out: string[] = [];
  if (before.name !== after.name) out.push(`名前：${before.name} → ${after.name}`);
  if (before.description !== after.description) out.push('説明を変更');
  return [...out, ...describeGenChanges(before, after), ...describeEncounterChanges(before.encounters, after.encounters, names, alive)];
}

/** 変えたところを、日本語の文で返す（公開するときのコミットの説明と、画面の一覧に使う） */
export function describeGenChanges(before: GenSettings, after: GenSettings): string[] {
  const out: string[] = [];
  const show = (v: number | boolean | string) =>
    typeof v === 'boolean' ? (v ? 'する' : 'しない') : typeof v === 'string' ? (PLACEMENT_LABELS[v as Placement] ?? v) : String(v);
  if (before.floors.count !== after.floors.count) out.push(`${GEN_LABELS.floorCount}：${before.floors.count} → ${after.floors.count}`);
  if (before.floors.size !== after.floors.size) out.push(`${GEN_LABELS.floorSize}：${before.floors.size} → ${after.floors.size}`);
  if (before.floors.satiety !== after.floors.satiety) out.push(`${GEN_LABELS.satiety}：${before.floors.satiety} → ${after.floors.satiety}`);
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
