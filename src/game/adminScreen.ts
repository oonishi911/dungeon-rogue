// 開発用の管理画面（?view=admin）の、画面に関わらない決まり：
// 敵のマスターデータ（enemies.json）と、品物の設定（items.json）と、ダンジョンの設定ファイル（src/game/dungeons/<ID>.json。いくつもある）をまとめて扱う。
// ・タブの一覧と、住所（?view=・?tab=・?dungeon=）から開くタブと、直すダンジョンを決めること
// ・どのタブ・どのダンジョンの値を変えたか
// ・ダンジョンを複製して作る・消す、敵をすべてのダンジョンから外して消す
// ・「変更を公開」で保存する（作る・書き換える・消す）ファイルと、コミットの説明、直すところの一覧

import { DEFAULT_DUNGEON_ID, dungeonPath, sortDungeonIds } from './dungeons';
import { describeChanges, encountersWithout, masterProblems, removeEnemy, serializeEnemyMaster, traitsWithBoss, TRAIT_LABELS, type EnemyMaster } from './enemyMaster';
import { describeDungeonChanges, DUNGEON_LIMITS, dungeonProblems, serializeDungeon, type DungeonFile } from './genMaster';
import { describeItemChanges, itemProblems, serializeItemMaster, type ItemMaster } from './itemMaster';
import type { EnemyId } from './types';

export const ENEMY_FILE = 'src/game/enemies.json';
export const ITEM_FILE = 'src/game/items.json';

/** 管理画面で扱うデータ全部。dungeons はダンジョンの ID（ファイルの名前）ごと */
export interface AdminData {
  enemies: EnemyMaster;
  items: ItemMaster;
  dungeons: Record<string, DungeonFile>;
}

/** 中身だけを写す（画面で変えるデータを、公開版のデータから切り離すため） */
export const copyJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// ===== タブ =====

/**
 * タブの一覧。part は、どちらのデータの設定か（enemies：敵のマスター enemies.json、dungeon：選んでいるダンジョンの設定ファイル）。
 * マップと探索の設定のタブでだけ、変えた値で作ったマップの見本を出す
 */
export const ADMIN_TABS = [
  { id: 'enemies', label: '敵', part: 'enemies' },
  { id: 'items', label: '品物', part: 'items' },
  { id: 'about', label: '名前と説明', part: 'dungeon' },
  { id: 'pool', label: 'ダンジョンに出る敵', part: 'dungeon' },
  { id: 'floors', label: '階の数・広さ・満腹度', part: 'dungeon' },
  { id: 'rooms', label: '小部屋', part: 'dungeon' },
  { id: 'placement', label: '敵の数と置き方', part: 'dungeon' },
  { id: 'growth', label: 'レベルと強敵の報酬', part: 'dungeon' },
  { id: 'magic', label: '魔法', part: 'dungeon' },
] as const;

export type AdminTab = (typeof ADMIN_TABS)[number]['id'];

const PREVIEW_TABS: readonly AdminTab[] = ['floors', 'rooms', 'placement', 'growth', 'magic'];
export const showsPreview = (tab: AdminTab): boolean => PREVIEW_TABS.includes(tab);

/** ダンジョンの設定のタブか（タブの上に、直すダンジョンを選ぶ欄を出す） */
export const isDungeonTab = (tab: AdminTab): boolean => ADMIN_TABS.find((t) => t.id === tab)?.part === 'dungeon';

/**
 * 開いたときのタブ。住所の tab= で指す（?tab=magic）。
 * 前の住所も使える：?view=enemies は「敵」、?view=gen は「階の数・広さ・満腹度」（?view=gen&tab=enemies の「敵の数と置き方」は placement になった）
 */
export function adminTabFromUrl(search: string): AdminTab {
  const params = new URLSearchParams(search);
  const view = params.get('view');
  const want = params.get('tab');
  if (view === 'gen' && want === 'enemies') return 'placement';
  const tab = ADMIN_TABS.find((t) => t.id === want);
  if (tab) return tab.id;
  return view === 'gen' ? 'floors' : 'enemies';
}

/** 開いたときに直すダンジョン。住所の dungeon= で指す（ないダンジョンなら標準） */
export function adminDungeonFromUrl(search: string, ids: readonly string[]): string {
  const want = new URLSearchParams(search).get('dungeon');
  return want && ids.includes(want) ? want : DEFAULT_DUNGEON_ID;
}

/** 選んだタブとダンジョンを入れた住所（読み込み直しても、同じタブが開くように。?view=admin にそろえる） */
export function adminTabUrl(href: string, tab: AdminTab, dungeon: string = DEFAULT_DUNGEON_ID): URL {
  const url = new URL(href);
  url.searchParams.set('view', 'admin');
  url.searchParams.set('tab', tab);
  if (dungeon === DEFAULT_DUNGEON_ID) url.searchParams.delete('dungeon');
  else url.searchParams.set('dungeon', dungeon);
  return url;
}

/** タブごとの、ダンジョンの設定ファイルの中の場所 */
const DUNGEON_PARTS: Record<Exclude<AdminTab, 'enemies' | 'items'>, (d: DungeonFile) => unknown> = {
  about: (d) => [d.name, d.description],
  pool: (d) => d.encounters,
  floors: (d) => d.floors,
  rooms: (d) => d.rooms,
  placement: (d) => d.enemies,
  growth: (d) => d.growth,
  magic: (d) => [d.magic, d.spells],
};

/**
 * そのタブの値を、公開している値から変えたか。ダンジョンの設定のタブは、dungeon（直しているダンジョンの ID）の分を比べる
 * （新しく作ったダンジョンは、どのタブも「変えた」）
 */
export function tabChanged(tab: AdminTab, base: AdminData, draft: AdminData, dungeon: string = DEFAULT_DUNGEON_ID): boolean {
  if (tab === 'enemies') return stable(base.enemies.enemies) !== stable(draft.enemies.enemies);
  if (tab === 'items') return stable(base.items) !== stable(draft.items);
  const b = base.dungeons[dungeon];
  const d = draft.dungeons[dungeon];
  if (!b || !d) return Boolean(d);
  return stable(DUNGEON_PARTS[tab](b)) !== stable(DUNGEON_PARTS[tab](d));
}

/** ダンジョンの様子（ダンジョンを選ぶ欄に出す）。new：新しく作る、changed：変えた、same：変えていない */
export function dungeonStatus(id: string, base: AdminData, draft: AdminData): 'new' | 'changed' | 'same' {
  const b = base.dungeons[id];
  const d = draft.dungeons[id];
  if (!b) return 'new';
  return d && stable(b) !== stable(d) ? 'changed' : 'same';
}

/** 同じ中身なら、項目の並び順が違っても同じ文字列にする（配列の並び順は、そのまま。敵を足してすぐ消したときなどに、変えたことにしないため） */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))) : v,
  );
}

// ===== ダンジョンを作る・消す、敵を消す =====

/** 新しいダンジョンの ID の決まり（入力欄で使う）。taken：今あるダンジョンの ID */
export function dungeonIdRule(taken: Iterable<string>) {
  return {
    max: DUNGEON_LIMITS.id.max,
    pattern: { test: DUNGEON_LIMITS.id.pattern, text: `英小文字で始まり、英小文字・数字・_ だけの2〜${DUNGEON_LIMITS.id.max}文字（ファイルの名前になる）` },
    taken: new Set(taken),
    takenText: 'ほかのダンジョンの ID です',
  };
}

/** ダンジョンの名前の決まり（入力欄で使う）。taken：ほかのダンジョンの名前 */
export function dungeonNameRule(taken: Iterable<string>) {
  return { max: DUNGEON_LIMITS.name.max, taken: new Set(taken), takenText: 'ほかのダンジョンの名前です' };
}

/** from のダンジョンを写して、新しいダンジョン（ID は id、名前は name）を作る。並びは最後 */
export function duplicateDungeon(data: AdminData, from: string, id: string, name: string): AdminData {
  const source = data.dungeons[from];
  if (!source || data.dungeons[id]) return data;
  return { ...data, dungeons: { ...data.dungeons, [id]: { ...copyJson(source), name } } };
}

/** ダンジョンを消す（標準のダンジョンは消せない） */
export function removeDungeon(data: AdminData, id: string): AdminData {
  if (id === DEFAULT_DUNGEON_ID || !data.dungeons[id]) return data;
  const dungeons = { ...data.dungeons };
  delete dungeons[id];
  return { ...data, dungeons };
}

/** その敵をボスにしているところ（「標準の炎」のように。消す前に、ボスを変えてもらう） */
export function bossUses(data: AdminData, id: EnemyId): string[] {
  return sortDungeonIds(Object.keys(data.dungeons)).flatMap((d) =>
    traitsWithBoss(data.dungeons[d]!.encounters, id).map((t) => `${data.dungeons[d]!.name}の${TRAIT_LABELS[t]}`),
  );
}

/** 敵を消す。敵のマスターから消し、すべてのダンジョンの道中からも外す */
export function removeEnemyEverywhere(data: AdminData, id: EnemyId): AdminData {
  const dungeons = Object.fromEntries(Object.entries(data.dungeons).map(([d, file]) => [d, { ...file, encounters: encountersWithout(file.encounters, id) }]));
  return { ...data, enemies: removeEnemy(data.enemies, id), dungeons };
}

// ===== 公開 =====

/**
 * 保存するファイル1つ。
 * text：保存する中身（null なら、ファイルを消す）。base：公開版の今の中身（null なら、まだないファイルを作る）。
 * リポジトリのものが base と違えば（ほかの変更が先に入っていれば）、上書きしないで止める
 */
export interface PublishFile {
  path: string;
  text: string | null;
  base: string | null;
}

export interface PublishPlan {
  /** 変えたところ（日本語の文） */
  changes: string[];
  /** 直すところ（あるあいだは公開できない） */
  problems: string[];
  /** 保存するファイル（変えたものだけ。いくつあっても、1回のコミットでまとめて保存する） */
  files: PublishFile[];
  /** コミットの説明 */
  message: string;
}

/** 公開版 base から draft に変えるときの、保存するファイルと説明 */
export function planPublish(base: AdminData, draft: AdminData): PublishPlan {
  const enemyChanges = describeChanges(base.enemies, draft.enemies);
  const files: PublishFile[] = [];
  if (enemyChanges.length) files.push({ path: ENEMY_FILE, text: serializeEnemyMaster(draft.enemies), base: serializeEnemyMaster(base.enemies) });
  const itemChanges = serializeItemMaster(base.items) === serializeItemMaster(draft.items) ? [] : describeItemChanges(base.items, draft.items);
  if (serializeItemMaster(base.items) !== serializeItemMaster(draft.items)) {
    files.push({ path: ITEM_FILE, text: serializeItemMaster(draft.items), base: serializeItemMaster(base.items) });
  }

  const names = (id: EnemyId) => draft.enemies.enemies[id]?.name || base.enemies.enemies[id]?.name || id;
  const alive = (id: EnemyId) => id in draft.enemies.enemies;
  const dungeonChanges: string[] = [];
  for (const id of sortDungeonIds([...new Set([...Object.keys(base.dungeons), ...Object.keys(draft.dungeons)])])) {
    const b = base.dungeons[id];
    const d = draft.dungeons[id];
    const path = dungeonPath(id);
    if (!b && d) {
      dungeonChanges.push(`ダンジョン「${d.name}」（${id}）を作る`);
      files.push({ path, text: serializeDungeon(d), base: null });
    } else if (b && !d) {
      dungeonChanges.push(`ダンジョン「${b.name}」（${id}）を消す`);
      files.push({ path, text: null, base: serializeDungeon(b) });
    } else if (b && d && serializeDungeon(b) !== serializeDungeon(d)) {
      // 書く文がないのは、消した敵が道中から外れただけのとき（敵を「消す」に含めるので、ふつうは書かない）
      const removed = Object.values(b.encounters).some((e) => e.pool.some((id) => !alive(id)));
      const lines = describeDungeonChanges(b, d, names, alive);
      dungeonChanges.push(...(lines.length ? lines : [removed ? '消した敵を、道中に出る敵から外す' : '設定を変更']).map((c) => `${d.name}：${c}`));
      files.push({ path, text: serializeDungeon(d), base: serializeDungeon(b) });
    }
  }

  const itemLines = itemChanges.length || !files.some((f) => f.path === ITEM_FILE) ? itemChanges : ['品物の設定を変更'];
  const changes = [...enemyChanges, ...itemLines.map((c) => `品物：${c}`), ...dungeonChanges];
  const parts = [enemyChanges.length && '敵のデータ', itemLines.length && '品物の設定', dungeonChanges.length && 'ダンジョンの設定'].filter(Boolean);
  const what = parts.length ? parts.join('と') : 'ダンジョンの設定';
  return {
    changes,
    problems: [...masterProblems(draft.enemies), ...itemProblems(draft.items).map((p) => `品物：${p}`), ...draftDungeonProblems(draft)],
    files,
    message: `${what}を更新する（管理画面から）\n\n${changes.map((c) => `- ${c}`).join('\n')}`,
  };
}

/** ダンジョンの設定ファイルの、直すところ（どのダンジョンのことかを頭に付ける）。ID と、名前が重なっていないかも確かめる */
function draftDungeonProblems(draft: AdminData): string[] {
  const problems: string[] = [];
  if (!draft.dungeons[DEFAULT_DUNGEON_ID]) problems.push(`標準のダンジョン（${DEFAULT_DUNGEON_ID}）は消せません`);
  const seen = new Map<string, string>();
  for (const id of sortDungeonIds(Object.keys(draft.dungeons))) {
    const d = draft.dungeons[id]!;
    const label = typeof d.name === 'string' && d.name.trim() ? d.name : id;
    if (!DUNGEON_LIMITS.id.pattern.test(id)) problems.push(`${label}：ID（${id}）は、英小文字で始まり、英小文字・数字・_ だけの2〜${DUNGEON_LIMITS.id.max}文字にする`);
    problems.push(...dungeonProblems(d, draft.enemies).map((p) => `${label}：${p}`));
    const name = typeof d.name === 'string' ? d.name.trim() : '';
    if (name && seen.has(name)) problems.push(`${label}（${id}）：ほかのダンジョン（${seen.get(name)}）と同じ名前になっている`);
    else if (name) seen.set(name, id);
  }
  return problems;
}
