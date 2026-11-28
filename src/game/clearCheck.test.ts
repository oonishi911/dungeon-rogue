// 管理画面の「クリア率を測る」（clearCheck.ts）
import { describe, expect, it } from 'vitest';
import { TRAIT_NAMES } from './balanceReport';
import { checkSteps, checkWarnings, measureCheck, withDungeon, type ClearCheck, type TraitRates } from './clearCheck';
import { DEFAULT_DUNGEON_ID, dungeonOf, hasDungeon } from './dungeons';

const all = (v: number): TraitRates => ({ fire: v, ice: v, neutral: v, light: v, dark: v });

describe('下書きの設定に差し替える', () => {
  it('差し替えているあいだだけ、その設定で引ける。終わったら元に戻す（エラーでも）', () => {
    const before = dungeonOf(DEFAULT_DUNGEON_ID);
    const draft = { ...before, name: '下書き' };
    expect(withDungeon(DEFAULT_DUNGEON_ID, draft, () => dungeonOf(DEFAULT_DUNGEON_ID).name)).toBe('下書き');
    expect(dungeonOf(DEFAULT_DUNGEON_ID)).toBe(before);
    expect(() =>
      withDungeon(DEFAULT_DUNGEON_ID, draft, () => {
        throw new Error('x');
      }),
    ).toThrow('x');
    expect(dungeonOf(DEFAULT_DUNGEON_ID)).toBe(before);
  });

  it('まだ公開していないダンジョンも、そのあいだだけ足して測れる', () => {
    const draft = { ...dungeonOf(DEFAULT_DUNGEON_ID), name: '新しい' };
    expect(withDungeon('new_one', draft, () => hasDungeon('new_one'))).toBe(true);
    expect(hasDungeon('new_one')).toBe(false);
  });
});

describe('測る', () => {
  it('公開版と下書きの5属性ずつを順に測り、進み具合を知らせる', () => {
    expect(checkSteps(true)).toHaveLength(10);
    expect(checkSteps(false)).toHaveLength(5);
    const d = dungeonOf(DEFAULT_DUNGEON_ID);
    const seen: number[] = [];
    const r = measureCheck(DEFAULT_DUNGEON_ID, d, d, 1, (done) => seen.push(done));
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(r.before).toEqual(r.after); // 同じ設定なら同じ結果
    const n = measureCheck(DEFAULT_DUNGEON_ID, null, d, 1);
    expect(n.before).toBeNull();
  });
});

describe('気を付けること', () => {
  const check = (after: TraitRates, before: TraitRates | null = null): ClearCheck => ({ trials: 20, before, after });

  it('目標のあたりで、公開版からあまり動かなければ、何も出さない', () => {
    expect(checkWarnings(check(all(0.7), all(0.65)), TRAIT_NAMES)).toEqual([]);
  });

  it('低すぎる・高すぎる', () => {
    expect(checkWarnings(check(all(0.3)), TRAIT_NAMES).join()).toContain('かなり低い');
    expect(checkWarnings(check(all(0.95)), TRAIT_NAMES).join()).toContain('かなり高い');
  });

  it('属性ごとに低すぎるものを名前で出す', () => {
    const w = checkWarnings(check({ ...all(0.75), dark: 0.1 }), TRAIT_NAMES).join();
    expect(w).toContain('闇');
    expect(w).not.toContain('炎');
  });

  it('公開版から大きく下がる（管理画面で成長を変えて0%になった、のような変更）', () => {
    const w = checkWarnings(check(all(0), all(0.71)), TRAIT_NAMES).join();
    expect(w).toContain('71% から 0% へ、大きく下がる');
  });
});
