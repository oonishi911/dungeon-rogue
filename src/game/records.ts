// ダンジョンごとの記録（2026-11-28。docs/dungeon-records.md）：挑んだ回数・いちばん深く行った階・踏破した回数。
// 探索が終わったとき（力尽きても、リタイアしても）に足す。ダンジョンを選ぶ画面のカードに出す

import { DUNGEON_IDS, dungeonOf } from './dungeons';
import type { ExploreResult } from './exploreTypes';
import type { EnemyId } from './types';

export interface DungeonRecord {
  tries: number; // 挑んだ回数
  best: number; // いちばん深く行った階（1始まり。最深部は「階の数＋1」）
  clears: number; // 踏破した回数
}

export type DungeonRecords = Record<string, DungeonRecord>;

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** 保存された記録を読む。形がおかしい記録・今ないダンジョンの記録は捨てる（ない昔のセーブは、空） */
export function parseRecords(v: unknown): DungeonRecords {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return {};
  const out: DungeonRecords = {};
  for (const [id, r] of Object.entries(v as Record<string, unknown>)) {
    if (!DUNGEON_IDS.includes(id) || typeof r !== 'object' || r === null) continue;
    const { tries, best, clears } = r as Record<string, unknown>;
    if (isCount(tries) && isCount(best) && isCount(clears)) out[id] = { tries, best, clears };
  }
  return out;
}

/** 探索が1回終わったときの記録 */
export function recordRun(records: DungeonRecords, dungeon: string, result: Pick<ExploreResult, 'outcome' | 'floorReached'>): DungeonRecords {
  const r = records[dungeon] ?? { tries: 0, best: 0, clears: 0 };
  return {
    ...records,
    [dungeon]: {
      tries: r.tries + 1,
      best: Math.max(r.best, result.floorReached),
      clears: r.clears + (result.outcome === 'cleared' ? 1 : 0),
    },
  };
}

/** いちばん深く行った階の言い方（「地下3階」「最深部」。まだなら null） */
export function bestFloorText(dungeon: string, best: number): string | null {
  if (best <= 0) return null;
  return best > dungeonOf(dungeon).floors.count ? '最深部' : `地下${best}階`;
}

/** そのダンジョンの奥にいるボス（属性ごと。重ならない） */
export function bossesOf(dungeon: string): EnemyId[] {
  return [...new Set(Object.values(dungeonOf(dungeon).encounters).map((e) => e.boss))];
}
