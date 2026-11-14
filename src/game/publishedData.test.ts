// 公開する設定ファイル（管理画面で変えるもの）そのものを確かめるテスト。
// ほかのふつうのテストは、テスト用の決まった設定（src/game/testdata/）で動く（vite.config.ts の testData）。
// ここだけは本物のファイルを読み、「正しい形か」「管理画面で書き出した形のままか」だけを見る。
// 値段や強さが遊びやすいかは見ない（それはバランスのテスト）。管理画面は正しくない設定を公開させないので、ふつうはここも落ちない。
import { describe, expect, it } from 'vitest';
import enemiesText from './enemies.json?raw';
import itemsText from './items.json?raw';
import { masterProblems, parseEnemyMaster, serializeEnemyMaster } from './enemyMaster';
import { dungeonProblems, parseDungeon, serializeDungeon } from './genMaster';
import { DEFAULT_DUNGEON_ID } from './dungeons';
import { itemProblems, parseItemMaster, serializeItemMaster } from './itemMaster';

const DUNGEON_TEXTS = import.meta.glob<string>('./dungeons/*.json', { eager: true, query: '?raw', import: 'default' });
const idOf = (path: string) => path.replace(/^.*\//, '').replace(/\.json$/, '');

describe('品物の設定（src/game/items.json）', () => {
  it('正しい形になっていて、書き出すと同じ中身になる', () => {
    expect(itemProblems(JSON.parse(itemsText))).toEqual([]);
    expect(serializeItemMaster(parseItemMaster(JSON.parse(itemsText)))).toBe(itemsText);
  });
});

describe('敵の設定（src/game/enemies.json）', () => {
  it('正しい形になっていて、書き出すと同じ中身になる', () => {
    expect(masterProblems(JSON.parse(enemiesText))).toEqual([]);
    expect(serializeEnemyMaster(parseEnemyMaster(JSON.parse(enemiesText)))).toBe(enemiesText);
  });
});

describe('ダンジョンの設定（src/game/dungeons/）', () => {
  const enemies = parseEnemyMaster(JSON.parse(enemiesText));

  it('標準のダンジョンがある', () => {
    expect(Object.keys(DUNGEON_TEXTS).map(idOf)).toContain(DEFAULT_DUNGEON_ID);
  });

  it('どのファイルも正しい形になっていて（出る敵は敵の設定にいて、ボスはボスの敵）、書き出すと同じ中身になる', () => {
    for (const [path, text] of Object.entries(DUNGEON_TEXTS)) {
      expect(dungeonProblems(JSON.parse(text), enemies), path).toEqual([]);
      const d = parseDungeon(idOf(path), JSON.parse(text), enemies);
      for (const e of Object.values(d.encounters)) expect(enemies.enemies[e.boss]?.boss, path).toBe(true);
      expect(serializeDungeon(d), path).toBe(text);
    }
  });
});
