// 開発用の管理画面（?view=admin）の、画面に関わらない決まり：
// 敵のマスターデータ（enemies.json）とダンジョンの設定（dungeonGen.json）をまとめて扱う。
// ・タブの一覧と、住所（?view=・?tab=）から開くタブを決めること
// ・どのタブの値を変えたか
// ・「変更を公開」で保存するファイルと、コミットの説明、直すところの一覧

import { describeChanges, masterProblems, serializeEnemyMaster, type EnemyMaster } from './enemyMaster';
import { describeGenChanges, genProblems, serializeGenSettings, type GenSettings } from './genMaster';

export const ENEMY_FILE = 'src/game/enemies.json';
export const GEN_FILE = 'src/game/dungeonGen.json';

/** 管理画面で扱うデータ全部 */
export interface AdminData {
  enemies: EnemyMaster;
  gen: GenSettings;
}

/** 中身だけを写す（画面で変えるデータを、公開版のデータから切り離すため） */
export const copyJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// ===== タブ =====

/**
 * タブの一覧。part は、どちらのデータの設定か（敵：enemies.json、ダンジョン：dungeonGen.json）。
 * ダンジョンの設定のタブでだけ、変えた値で作ったマップの見本を出す
 */
export const ADMIN_TABS = [
  { id: 'enemies', label: '敵', part: 'enemies' },
  { id: 'pool', label: 'ダンジョンに出る敵', part: 'enemies' },
  { id: 'floors', label: '階の数と広さ', part: 'gen' },
  { id: 'rooms', label: '小部屋', part: 'gen' },
  { id: 'placement', label: '敵の数と置き方', part: 'gen' },
  { id: 'growth', label: 'レベルと強敵の報酬', part: 'gen' },
  { id: 'magic', label: '魔法', part: 'gen' },
] as const;

export type AdminTab = (typeof ADMIN_TABS)[number]['id'];

export const showsPreview = (tab: AdminTab): boolean => ADMIN_TABS.find((t) => t.id === tab)?.part === 'gen';

/**
 * 開いたときのタブ。住所の tab= で指す（?tab=magic）。
 * 前の住所も使える：?view=enemies は「敵」、?view=gen は「階の数と広さ」（?view=gen&tab=enemies の「敵の数と置き方」は placement になった）
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

/** 選んだタブを入れた住所（読み込み直しても、同じタブが開くように。?view=admin にそろえる） */
export function adminTabUrl(href: string, tab: AdminTab): URL {
  const url = new URL(href);
  url.searchParams.set('view', 'admin');
  url.searchParams.set('tab', tab);
  return url;
}

/** そのタブの値を、公開している値から変えたか */
export function tabChanged(tab: AdminTab, base: AdminData, draft: AdminData): boolean {
  const parts: Record<AdminTab, (d: AdminData) => unknown> = {
    enemies: (d) => d.enemies.enemies,
    pool: (d) => d.enemies.dungeons,
    floors: (d) => d.gen.floors,
    rooms: (d) => d.gen.rooms,
    placement: (d) => d.gen.enemies,
    growth: (d) => d.gen.growth,
    magic: (d) => [d.gen.magic, d.gen.spells],
  };
  return stable(parts[tab](base)) !== stable(parts[tab](draft));
}

/** 同じ中身なら、項目の並び順が違っても同じ文字列にする（配列の並び順は、そのまま。敵を足してすぐ消したときなどに、変えたことにしないため） */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))) : v,
  );
}

// ===== 公開 =====

/** 保存するファイル1つ。base は、公開版の今の中身（リポジトリのものがこれと違えば、上書きしないで止める） */
export interface PublishFile {
  path: string;
  text: string;
  base: string;
}

export interface PublishPlan {
  /** 変えたところ（日本語の文） */
  changes: string[];
  /** 直すところ（あるあいだは公開できない） */
  problems: string[];
  /** 保存するファイル（変えたほうだけ。両方変えたときは2つ。1回のコミットでまとめて保存する） */
  files: PublishFile[];
  /** コミットの説明 */
  message: string;
}

/** 公開版 base から draft に変えるときの、保存するファイルと説明 */
export function planPublish(base: AdminData, draft: AdminData): PublishPlan {
  const enemyChanges = describeChanges(base.enemies, draft.enemies);
  const genChanges = describeGenChanges(base.gen, draft.gen);
  const files: PublishFile[] = [];
  if (enemyChanges.length) files.push({ path: ENEMY_FILE, text: serializeEnemyMaster(draft.enemies), base: serializeEnemyMaster(base.enemies) });
  if (genChanges.length) files.push({ path: GEN_FILE, text: serializeGenSettings(draft.gen), base: serializeGenSettings(base.gen) });

  const changes = [...enemyChanges, ...genChanges];
  const what = enemyChanges.length && genChanges.length ? '敵のデータとダンジョンの設定' : enemyChanges.length ? '敵のデータ' : 'ダンジョンの設定';
  return {
    changes,
    problems: [...masterProblems(draft.enemies), ...genProblems(draft.gen)],
    files,
    message: `${what}を更新する（管理画面から）\n\n${changes.map((c) => `- ${c}`).join('\n')}`,
  };
}
