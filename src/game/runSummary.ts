// 中断した探索の見出し（「続きから」の画面に出す、どこまで進んだか）。docs/resume.md

import { dungeonOf } from './dungeons';
import type { ResumedRun } from './runSave';

export interface RunSummary {
  dungeonName: string;
  floor: number; // 今いる階（1始まり。ボスの階は、いちばん下の階）
  floors: number; // ボスの階までふくめた、ダンジョンの階の数
  bossFloor: boolean; // ボスの階にいるか
  level: number;
  hp: number;
  maxHp: number;
  turn: number;
  gold: number;
  defeated: number; // 倒した敵の数
  ago: string | null; // いつ中断したか（「3分前」。わからなければ null）
}

/** 経った時間を、短い言い方にする（1分未満は「たった今」、そのあとは分・時間・日） */
export function agoText(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60000);
  if (min < 1) return 'たった今';
  if (min < 60) return `${min}分前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}時間前`;
  return `${Math.floor(hour / 24)}日前`;
}

export function summarizeRun(run: ResumedRun, now: number): RunSummary {
  const s = run.state;
  return {
    dungeonName: dungeonOf(run.outcome.dungeon).name,
    floor: s.floor + 1,
    floors: s.floors + 1,
    bossFloor: s.floor >= s.floors,
    level: s.level,
    hp: s.stats.hp,
    maxHp: s.stats.maxHp,
    turn: s.turn,
    gold: s.gold,
    defeated: s.defeated,
    ago: run.savedAt === null ? null : agoText(now - run.savedAt),
  };
}
