// ランク3のバランス：ランクを上げても、正しい準備なら踏破できる。
// 広いマップは計算に時間がかかるので、ランクごとにファイルを分けて並列に実行する。

import { describe, expect, it } from 'vitest';
import { clearRate } from './autoplay';
import { PREPS, SUPPLIES, TRIALS } from './balance.fixtures';
import type { TraitId } from './types';

describe('バランス：ランク3', () => {
  for (const [trait, prep] of Object.entries(PREPS) as [TraitId, (typeof PREPS)[TraitId]][]) {
    it(`${trait}：正しい準備ならクリア率80%以上`, { timeout: 60_000 }, () => {
      expect(clearRate([...prep.right, ...SUPPLIES], trait, TRIALS, { rank: 3 })).toBeGreaterThanOrEqual(0.8);
    });
  }
});
