// ダンジョンに入ったときのHPと最大HP（ダンジョンの設定 growth.startHp・startMaxHp。管理画面の「HP・レベル・強敵の報酬」）
import { afterEach, describe, expect, it } from 'vitest';
import { COMBAT_CONFIG } from './data';
import { DEFAULT_DUNGEON_ID, dungeonOf } from './dungeons';
import { startExplore, startStats } from './explore';
import { buildPlayer } from './combat';
import { genProblems } from './genMaster';

const growth = dungeonOf(DEFAULT_DUNGEON_ID).growth;
const saved = { startHp: growth.startHp, startMaxHp: growth.startMaxHp };
afterEach(() => {
  Object.assign(growth, saved);
});

describe('入ったときのHP', () => {
  it('設定どおりのHPと最大HPで始まる', () => {
    growth.startMaxHp = 80;
    growth.startHp = 50;
    const s = startExplore(1, { dungeon: DEFAULT_DUNGEON_ID });
    expect(s.stats.maxHp).toBe(80);
    expect(s.stats.hp).toBe(50);
  });

  it('設定を変えても、攻撃力・守りなどほかの能力は変わらない', () => {
    const base = buildPlayer([]);
    growth.startMaxHp = 30;
    growth.startHp = 30;
    const { stats } = startExplore(1, { dungeon: DEFAULT_DUNGEON_ID });
    expect({ ...stats, hp: 0, maxHp: 0 }).toEqual({ ...base, hp: 0, maxHp: 0 });
  });

  it('HPが最大HPより大きくても、最大HPに収める', () => {
    const s = startStats(buildPlayer([]), { startHp: 90, startMaxHp: 40 });
    expect(s.hp).toBe(40);
    expect(s.maxHp).toBe(40);
  });

  it('初期値は、これまでと同じ（60）', () => {
    expect(COMBAT_CONFIG.playerHp).toBe(60);
    expect(saved).toEqual({ startHp: 60, startMaxHp: 60 });
  });

});

describe('設定の確かめ', () => {
  const check = (patch: Partial<typeof growth>) => genProblems({ ...dungeonOf(DEFAULT_DUNGEON_ID), growth: { ...growth, ...patch } });
  it('範囲（1〜999の整数）と、HP ≦ 最大HP', () => {
    expect(check({ startHp: 1, startMaxHp: 999 })).toEqual([]);
    expect(check({ startHp: 0 })).toEqual(['入ったときのHP：1〜999の数にする']);
    expect(check({ startMaxHp: 1000, startHp: 10 })).toEqual(['入ったときの最大HP：1〜999の数にする']);
    expect(check({ startMaxHp: 10.5, startHp: 10 })).toEqual(['入ったときの最大HP：整数にする']);
    expect(check({ startMaxHp: 40, startHp: 41 })).toEqual(['入ったときのHP：入ったときの最大HP以下にする']);
  });
});
