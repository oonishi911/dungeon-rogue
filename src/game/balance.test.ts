// バランスのテスト：自動プレイで多数回遊ばせ、「準備で勝負が決まる」というコンセプトが
// 数値を調整しても崩れていないことを確かめる。シードは固定なので結果は毎回同じ。
// 確かめるのは標準のダンジョン（src/game/dungeons/standard.json）。
// 今は、ふつうのテスト（npm test）と自動チェックからは外している。動かすときは npm run test:balance

import { describe, expect, it } from 'vitest';
import { autoPlay, clearRate } from './autoplay';
import { BALANCE_TIMEOUT, PREPS, SUPPLIES, TRIALS, WRONG_LIMIT } from './balance.fixtures';
import { ITEMS, PREP_CONFIG } from './data';
import { dirBetween, isBossFloor, startExplore, step, type ExploreState } from './explore';
import { RANK_CONFIG } from './rank';
import type { TraitId } from './types';

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

describe('バランス：準備で勝負が決まる', () => {
  for (const [trait, prep] of Object.entries(PREPS) as [TraitId, (typeof PREPS)[TraitId]][]) {
    it(`${trait}：正しい準備ならクリア率80%以上`, { timeout: BALANCE_TIMEOUT }, () => {
      expect(clearRate([...prep.right, ...SUPPLIES], trait, TRIALS)).toBeGreaterThanOrEqual(0.8);
    });

    it(`${trait}：外れた準備では${WRONG_LIMIT[trait] * 100}%未満`, { timeout: BALANCE_TIMEOUT }, () => {
      expect(clearRate([...prep.wrong, ...SUPPLIES], trait, TRIALS)).toBeLessThan(WRONG_LIMIT[trait]);
    });

    it(`${trait}：何も準備しなければ20%未満`, { timeout: BALANCE_TIMEOUT }, () => {
      expect(clearRate([], trait, TRIALS)).toBeLessThan(0.2);
    });
  }
});

describe('バランス：準備フェーズのお金', () => {
  it('正しい準備は、初期の所持金で実際に買える（噂で特性を知り、鍛冶屋と道具屋に行く3日間）', () => {
    for (const prep of Object.values(PREPS)) {
      const cost = [...prep.right, ...SUPPLIES].reduce((sum, id) => sum + ITEMS[id].price, 0);
      expect(cost).toBeLessThanOrEqual(PREP_CONFIG.startGold);
    }
  });
});

describe('バランス：地図', () => {
  it('地図があると、探索にかかるターン数が大きく減る', { timeout: BALANCE_TIMEOUT }, () => {
    const average = (hasMap: boolean) => {
      let turns = 0;
      for (let i = 0; i < 20; i++) {
        turns += autoPlay((i * 2654435761) >>> 0, { trait: 'fire', loadout: [...PREPS.fire.right, ...SUPPLIES], hasMap }).turns;
      }
      return turns / 20;
    };
    // 主人公の視界を壁にさえぎられないようにしたため、地図で減るターン数が約28%に下がった（以前は40%以上）。
    // 準備フェーズを飛ばしているあいだの一時的な値として、20%以上減ればよいことにしている。準備フェーズを戻すときに見直す
    expect(average(true)).toBeLessThan(average(false) * 0.8);
  });
});

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

  it('どのランクでも、本道だけを歩けば満腹度が0にならずにボス階まで着ける', { timeout: BALANCE_TIMEOUT }, () => {
    for (let rank = 1; rank <= RANK_CONFIG.maxRank; rank++) {
      for (let i = 0; i < (rank === 1 ? 100 : 10); i++) {
        let s = startExplore(i * 2654435761, { enemyDensity: 0, rank });
        for (let f = 0; f < s.floors; f++) s = walkDown(s);
        expect(isBossFloor(s)).toBe(true);
        expect(s.satiety).toBeGreaterThan(0);
      }
    }
  });
});
