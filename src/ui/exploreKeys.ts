// 探索画面のキーボード操作の割り当て。

import type { Dir, ExploreAction } from '../game/exploreTypes';

export const KEY_DIRS: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};

// 呪文は z・x・c キーで唱える（持ってきた順）
export const SPELL_KEYS = ['z', 'x', 'c'] as const;

export const KEY_ACTIONS: Record<string, ExploreAction> = {
  ' ': { kind: 'wait' },
  '.': { kind: 'wait' },
};
