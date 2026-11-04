// バランスのテスト：自動プレイで多数回遊ばせ、「準備で勝負が決まる」というコンセプトが
// 数値を調整しても崩れていないことを確かめる。シードは固定なので結果は毎回同じ。

import { describe, expect, it } from 'vitest';
import { autoPlay, clearRate } from './autoplay';
import { PREPS, SUPPLIES, TRIALS, WRONG_LIMIT } from './balance.fixtures';
import { ITEMS, PREP_CONFIG } from './data';
import type { TraitId } from './types';

describe('自動プレイ', () => {
  it('AIは不正な行動を選ばず、最後まで遊び切る', () => {
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
    it(`${trait}：正しい準備ならクリア率80%以上`, { timeout: 30_000 }, () => {
      expect(clearRate([...prep.right, ...SUPPLIES], trait, TRIALS)).toBeGreaterThanOrEqual(0.8);
    });

    it(`${trait}：外れた準備では${WRONG_LIMIT[trait] * 100}%未満`, { timeout: 30_000 }, () => {
      expect(clearRate([...prep.wrong, ...SUPPLIES], trait, TRIALS)).toBeLessThan(WRONG_LIMIT[trait]);
    });

    it(`${trait}：何も準備しなければ20%未満`, { timeout: 30_000 }, () => {
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
  it('地図があると、探索にかかるターン数が大きく減る', { timeout: 30_000 }, () => {
    const average = (hasMap: boolean) => {
      let turns = 0;
      for (let i = 0; i < 20; i++) {
        turns += autoPlay((i * 2654435761) >>> 0, { trait: 'fire', loadout: [...PREPS.fire.right, ...SUPPLIES], hasMap }).turns;
      }
      return turns / 20;
    };
    expect(average(true)).toBeLessThan(average(false) * 0.6);
  });
});
