// バランスのテスト：自動プレイで多数回遊ばせ、「準備で勝負が決まる」というコンセプトが
// 数値を調整しても崩れていないことを確かめる。シードは固定なので結果は毎回同じ。

import { describe, expect, it } from 'vitest';
import { autoPlay, clearRate } from './autoplay';
import type { ItemId, TraitId } from './types';

const TRIALS = 40;
const SUPPLIES: ItemId[] = ['potion', 'potion'];

/**
 * ダンジョンごとの正しい準備と、外れた準備。
 * 正しい準備：その属性に効く防具＋出やすい体質に効く武器。外れた準備：効かない防具と武器。
 */
const PREPS: Record<TraitId, { right: ItemId[]; wrong: ItemId[] }> = {
  fire: { right: ['sword', 'fire_cloak'], wrong: ['staff', 'ice_cloak'] },
  ice: { right: ['hammer', 'ice_cloak'], wrong: ['sword', 'fire_cloak'] },
  neutral: { right: ['hammer', 'plate'], wrong: ['sword', 'light_robe'] },
  light: { right: ['hammer', 'light_robe'], wrong: ['staff', 'dark_robe'] },
  dark: { right: ['staff', 'dark_robe'], wrong: ['sword', 'light_robe'] },
};

/**
 * 外れた準備のクリア率の上限。
 * 無属性のダンジョンは「どの武器でも戦える」「鎧は保険なので効きが弱い」設計なので、外れても差が小さい。
 */
const WRONG_LIMIT: Record<TraitId, number> = { fire: 0.2, ice: 0.2, neutral: 0.4, light: 0.2, dark: 0.2 };

describe('自動プレイ', () => {
  it('AIは不正な行動を選ばず、最後まで遊び切る', () => {
    for (let i = 0; i < 10; i++) {
      const r = autoPlay(i * 7919, { loadout: ['sword', 'plate', 'potion', 'food', 'fire_whetstone'] });
      expect(['reached_bottom', 'defeated']).toContain(r.outcome);
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
