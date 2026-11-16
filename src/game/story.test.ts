import { describe, expect, it } from 'vitest';
import { newSave, parseSave } from './save';
import { BOSS_ECHOES, ENDING, MEMORIES, REWIND_LINES, STORY_CONFIG, echoOf, gainMemory, rewindLine, storyDone } from './story';
import { ENEMIES } from './data';

describe('ストーリー（story.ts）', () => {
  it('記憶は、決めた数だけある。どれも題と文章がある', () => {
    expect(MEMORIES).toHaveLength(STORY_CONFIG.memories);
    for (const m of MEMORIES) {
      expect(m.title).not.toBe('');
      expect(m.lines.length).toBeGreaterThanOrEqual(3);
      expect(m.lines.length).toBeLessThanOrEqual(6); // スマホで短く読める長さ
    }
    expect(ENDING.length).toBeGreaterThan(0);
  });

  it('5体のボスすべてに、倒したときの一文がある（ボスは敵のマスターのboss）', () => {
    const bosses = Object.entries(ENEMIES).filter(([, e]) => e.boss).map(([id]) => id);
    expect(bosses.sort()).toEqual(Object.keys(BOSS_ECHOES).sort());
    expect(echoOf('flame_beast')).toContain('炎の魔獣');
    expect(echoOf('unknown_boss')).toBeNull();
  });

  it('記憶は1つずつ増え、上限で止まる。5つめで物語が終わる', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(gainMemory)).toEqual([1, 2, 3, 4, 5, 5, 5]);
    expect([0, 4, 5].map(storyDone)).toEqual([false, false, true]);
  });

  it('時が巻き戻る一文は、挑戦の回数で順に入れ替わる', () => {
    expect(rewindLine(1)).toBe(REWIND_LINES[0]);
    expect(rewindLine(2)).toBe(REWIND_LINES[1]);
    expect(rewindLine(1 + REWIND_LINES.length)).toBe(REWIND_LINES[0]);
    expect(rewindLine(0)).toBe(REWIND_LINES[0]);
  });
});

describe('記憶のセーブ', () => {
  it('最初は0。保存して読み直しても同じ', () => {
    expect(newSave().memories).toBe(0);
    const s = { ...newSave(), memories: 3 };
    expect(parseSave(JSON.stringify(s))).toEqual(s);
  });

  it('記憶の欄がない昔の記録は0から。壊れた値も0。上限を超える値は上限まで', () => {
    const { memories: _omit, ...old } = { ...newSave(), run: 2 };
    expect(parseSave(JSON.stringify(old))!.memories).toBe(0);
    expect(parseSave(JSON.stringify({ ...newSave(), memories: -1 }))!.memories).toBe(0);
    expect(parseSave(JSON.stringify({ ...newSave(), memories: 'x' }))!.memories).toBe(0);
    expect(parseSave(JSON.stringify({ ...newSave(), memories: 99 }))!.memories).toBe(STORY_CONFIG.memories);
  });
});
