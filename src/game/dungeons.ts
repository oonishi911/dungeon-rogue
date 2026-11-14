// プレイヤーが選べるダンジョンの一覧。src/game/dungeons/ にある設定ファイル（<ID>.json）を、すべて読み込む。
// ファイルを足すと、選ぶ画面にそのまま並ぶ（プログラムに一覧を書く必要はない）。ファイルは管理画面（?view=admin）から作る・直す・消すことができる。
// どの設定も、読み込むときに形を確かめる（おかしければエラーになり、テストで見つかるので公開されない）。
// 探索の状態には、遊んでいるダンジョンの ID だけを持たせ（ExploreState.dungeon）、設定はここから引く。

import { ENEMY_MASTER } from './data';
import { parseDungeon, type DungeonFile } from './genMaster';

/** 標準のダンジョン。いちばん先に並び、消すことはできない（ダンジョンを選ぶ前の画面や、前の版の途中保存はこれを使う） */
export const DEFAULT_DUNGEON_ID = 'standard';

/** 設定ファイルを置くフォルダ（リポジトリの中の場所。管理画面からの保存に使う） */
export const DUNGEON_DIR = 'src/game/dungeons';

/** ダンジョンの設定ファイルの、リポジトリの中の場所 */
export const dungeonPath = (id: string): string => `${DUNGEON_DIR}/${id}.json`;

/** ID を、標準のダンジョンを先頭に、あとは ID の順に並べる（選ぶ画面と管理画面での並び順） */
export function sortDungeonIds(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => (a === DEFAULT_DUNGEON_ID ? -1 : b === DEFAULT_DUNGEON_ID ? 1 : a < b ? -1 : a > b ? 1 : 0));
}

const files = import.meta.glob<unknown>('./dungeons/*.json', { eager: true, import: 'default' });

/** ダンジョンの設定（ID ごと。並び順は sortDungeonIds） */
export const DUNGEONS: Readonly<Record<string, DungeonFile>> = (() => {
  const loaded = Object.entries(files).map(([path, data]) => {
    const id = path.replace(/^.*\//, '').replace(/\.json$/, '');
    return [id, parseDungeon(id, data, ENEMY_MASTER)] as const;
  });
  const byId = Object.fromEntries(loaded);
  return Object.fromEntries(sortDungeonIds(Object.keys(byId)).map((id) => [id, byId[id]!]));
})();

/** ダンジョンの ID の一覧（標準が先頭） */
export const DUNGEON_IDS: readonly string[] = Object.keys(DUNGEONS);

if (!DUNGEONS[DEFAULT_DUNGEON_ID]) throw new Error(`標準のダンジョンの設定（${dungeonPath(DEFAULT_DUNGEON_ID)}）がありません`);

/** ある ID のダンジョンがあるか（途中保存を読むときに確かめる） */
export function hasDungeon(id: string): boolean {
  return Object.hasOwn(DUNGEONS, id);
}

/** ID のダンジョンの設定。ないときはエラーにする（途中保存などは、hasDungeon で先に確かめる） */
export function dungeonOf(id: string): DungeonFile {
  const d = hasDungeon(id) ? DUNGEONS[id] : undefined;
  if (!d) throw new Error(`ダンジョンの設定がありません：${id}`);
  return d;
}

/** 標準のダンジョンの設定（ダンジョンを指定しないときに使う） */
export const DEFAULT_DUNGEON: DungeonFile = dungeonOf(DEFAULT_DUNGEON_ID);
