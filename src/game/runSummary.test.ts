// 中断した探索の見出し（src/game/runSummary.ts）
import { describe, expect, it } from 'vitest';
import { depart } from './depart';
import { dungeonOf } from './dungeons';
import { startExplore } from './explore';
import { packRun, parseRun } from './runSave';
import { newSave } from './save';
import { agoText, summarizeRun } from './runSummary';

const MIN = 60_000;

describe('いつ中断したか', () => {
  it('1分未満は「たった今」、そのあとは分・時間・日で言う', () => {
    expect(agoText(0)).toBe('たった今');
    expect(agoText(59_999)).toBe('たった今');
    expect(agoText(-5000)).toBe('たった今'); // 時計がずれても壊れない
    expect(agoText(3 * MIN)).toBe('3分前');
    expect(agoText(59 * MIN)).toBe('59分前');
    expect(agoText(60 * MIN)).toBe('1時間前');
    expect(agoText(23 * 60 * MIN)).toBe('23時間前');
    expect(agoText(48 * 60 * MIN)).toBe('2日前');
  });
});

describe('中断した探索の見出し', () => {
  const outcome = depart(1, 'standard', ['sword']);
  const state = startExplore(5, { dungeon: 'standard', trait: outcome.trait, loadout: outcome.loadout });

  it('ダンジョンの名前・階・レベル・体力・ターン・いつ中断したかを出す', () => {
    const run = parseRun(JSON.stringify(packRun(newSave(), outcome, 5, state, 1_000_000)))!;
    expect(run.savedAt).toBe(1_000_000);
    const sum = summarizeRun(run, 1_000_000 + 12 * MIN);
    expect(sum).toEqual({
      dungeonName: dungeonOf('standard').name,
      floor: 1,
      floors: state.floors + 1,
      bossFloor: false,
      level: state.level,
      hp: state.stats.hp,
      maxHp: state.stats.maxHp,
      turn: 0,
      gold: state.gold,
      defeated: 0,
      ago: '12分前',
    });
  });

  it('保存した時刻がない前の版の保存でも読める（いつかは出さない）', () => {
    const packed = JSON.parse(JSON.stringify(packRun(newSave(), outcome, 5, state)));
    delete packed.savedAt;
    const run = parseRun(JSON.stringify(packed))!;
    expect(run.savedAt).toBeNull();
    expect(summarizeRun(run, Date.now()).ago).toBeNull();
    expect(parseRun(JSON.stringify({ ...packed, savedAt: 'x' }))!.savedAt).toBeNull();
  });
});
