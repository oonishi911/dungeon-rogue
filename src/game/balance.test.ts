// バランスのテスト：自動プレイで多数回遊ばせ、「準備で勝負が決まる」というコンセプトと、目標のクリア率（60%前後）が
// 数値を調整しても崩れていないことを確かめる。シードは固定なので結果は毎回同じ。
// 確かめるのは、すべてのダンジョン（src/game/dungeons/*.json）。合格の幅は balance.fixtures.ts
// 今は、ふつうのテスト（npm test）と自動チェックからは外している。動かすときは npm run test:balance
// 数字の移り変わりを残すときは npm run balance:report（docs/balance/README.md）

import { describe, expect, it } from 'vitest';
import { autoPlay, clearRate } from './autoplay';
import { BALANCE_TIMEOUT, GAP_MIN, NONE_LIMIT, PREPS, RIGHT_BAND, RIGHT_FLOOR, SUPPLIES, TRIALS, WRONG_LIMIT } from './balance.fixtures';
import { TRAITS } from './balanceReport';
import { DUNGEON_IDS, dungeonOf } from './dungeons';
import { isBossFloor, startExplore, step } from './explore';
import { type ExploreState } from './exploreTypes';
import { dirBetween } from './exploreSight';

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('自動プレイ', () => {
  it('AIは不正な行動を選ばず、最後まで遊び切る', { timeout: BALANCE_TIMEOUT }, () => {
    for (let i = 0; i < 10; i++) {
      const r = autoPlay(i * 7919, { loadout: ['sword', 'plate', 'potion', 'food', 'fire_whetstone'] });
      expect(['cleared', 'defeated']).toContain(r.outcome);
    }
  });

  it('同じシードなら同じ結果', () => {
    expect(autoPlay(42, { trait: 'ice' })).toEqual(autoPlay(42, { trait: 'ice' }));
  });
});

for (const dungeon of DUNGEON_IDS) {
  describe(`バランス：準備で勝負が決まる（${dungeonOf(dungeon).name}）`, () => {
    // 3つの条件を測るのは重いので、ダンジョンごとにまとめて1回だけ測る
    const rates = (loadoutOf: (t: (typeof TRAITS)[number]) => string[]) => TRAITS.map((t) => clearRate(loadoutOf(t) as never, t, TRIALS, { dungeon }));

    it(`正しい準備：5属性の平均が${RIGHT_BAND.min * 100}〜${RIGHT_BAND.max * 100}%で、どの属性も${RIGHT_FLOOR * 100}%以上`, { timeout: BALANCE_TIMEOUT * 2 }, () => {
      const right = rates((t) => [...PREPS[t].right, ...SUPPLIES]);
      expect(mean(right)).toBeGreaterThanOrEqual(RIGHT_BAND.min);
      expect(mean(right)).toBeLessThanOrEqual(RIGHT_BAND.max);
      for (const r of right) expect(r).toBeGreaterThanOrEqual(RIGHT_FLOOR);
    });

    it(`外れた準備：どの属性も${WRONG_LIMIT * 100}%未満で、正しい準備より平均${GAP_MIN * 100}ポイント以上低い`, { timeout: BALANCE_TIMEOUT * 2 }, () => {
      const right = rates((t) => [...PREPS[t].right, ...SUPPLIES]);
      const wrong = rates((t) => [...PREPS[t].wrong, ...SUPPLIES]);
      for (const r of wrong) expect(r).toBeLessThan(WRONG_LIMIT);
      expect(mean(right) - mean(wrong)).toBeGreaterThanOrEqual(GAP_MIN);
    });

    it(`何も準備しない：どの属性も${NONE_LIMIT * 100}%未満`, { timeout: BALANCE_TIMEOUT }, () => {
      for (const r of rates(() => [])) expect(r).toBeLessThan(NONE_LIMIT);
    });
  });
}

describe('バランス：満腹度', () => {
  /** 本道をたどって階段まで歩き、降りる（敵は歩く前に取り除く） */
  const walkDown = (state: ExploreState): ExploreState => {
    const path = state.map.mainPath;
    let s: ExploreState = { ...state, enemies: [] };
    for (let i = 1; i < path.length; i++) {
      const r = step(s, { kind: 'move', dir: dirBetween(path[i - 1]!, path[i]!) });
      if (!r.ok) throw new Error(r.error);
      s = r.value;
    }
    const r = step(s, { kind: 'descend' });
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };

  for (const dungeon of DUNGEON_IDS) {
    it(`本道だけを歩けば、満腹度が0にならずにボス階まで着ける（${dungeonOf(dungeon).name}）`, { timeout: BALANCE_TIMEOUT }, () => {
      for (let i = 0; i < 100; i++) {
        let s = startExplore(i * 2654435761, { enemyDensity: 0, dungeon });
        for (let f = 0; f < s.floors; f++) s = walkDown(s);
        expect(isBossFloor(s)).toBe(true);
        expect(s.satiety).toBeGreaterThan(0);
      }
    });
  }
});
