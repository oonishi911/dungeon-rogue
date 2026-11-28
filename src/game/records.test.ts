// ダンジョンごとの記録（records.ts）
import { describe, expect, it } from 'vitest';
import { DEFAULT_DUNGEON_ID, dungeonOf } from './dungeons';
import { bestFloorText, bossesOf, parseRecords, recordRun } from './records';
import { newSave, parseSave } from './save';

const D = DEFAULT_DUNGEON_ID;

describe('ダンジョンごとの記録', () => {
  it('挑んだ回数・いちばん深い階・踏破した回数を足す', () => {
    let r = recordRun({}, D, { outcome: 'defeated', floorReached: 2 });
    expect(r[D]).toEqual({ tries: 1, best: 2, clears: 0 });
    r = recordRun(r, D, { outcome: 'retired', floorReached: 1 });
    expect(r[D]).toEqual({ tries: 2, best: 2, clears: 0 });
    const deepest = dungeonOf(D).floors.count + 1;
    r = recordRun(r, D, { outcome: 'cleared', floorReached: deepest });
    expect(r[D]).toEqual({ tries: 3, best: deepest, clears: 1 });
  });

  it('いちばん深い階の言い方（最深部は「最深部」）', () => {
    const count = dungeonOf(D).floors.count;
    expect(bestFloorText(D, 0)).toBeNull();
    expect(bestFloorText(D, 1)).toBe('地下1階');
    expect(bestFloorText(D, count + 1)).toBe('最深部');
  });

  it('おかしな記録・今ないダンジョンの記録は読まない。ない昔のセーブは空', () => {
    expect(parseRecords({ [D]: { tries: 2, best: 1, clears: 0 }, nowhere: { tries: 1, best: 1, clears: 0 }, broken: 3 })).toEqual({ [D]: { tries: 2, best: 1, clears: 0 } });
    expect(parseRecords({ [D]: { tries: -1, best: 1, clears: 0 } })).toEqual({});
    expect(parseRecords(undefined)).toEqual({});
    const { records: _r, ...old } = newSave();
    expect(parseSave(JSON.stringify(old))?.records).toEqual({});
    const saved = { ...newSave(), records: { [D]: { tries: 3, best: 2, clears: 1 } } };
    expect(parseSave(JSON.stringify(saved))?.records).toEqual(saved.records);
  });

  it('奥のボスは、属性ごと（重ならない）', () => {
    const b = bossesOf(D);
    expect(b.length).toBeGreaterThan(0);
    expect(new Set(b).size).toBe(b.length);
  });
});
