// 主人公の状態のアイコンの列（statusChips.ts）
import { describe, expect, it } from 'vitest';
import { startExplore } from '../game/explore';
import { statusChips } from './statusChips';

describe('状態のアイコン', () => {
  const base = startExplore(1, { loadout: [] });

  it('何もなければ、出さない', () => {
    expect(statusChips(base)).toEqual([]);
  });

  it('毒・鈍足・空腹・魔力の盾・再生・武器に宿った属性を、残りの数と並べる', () => {
    const s = {
      ...base,
      satiety: 0,
      ward: { cut: 50, turns: 4 },
      regen: { amount: 3, turns: 6 },
      stats: { ...base.stats, poisonTurns: 5, chillSteps: 2, enchant: { element: 'ice' as const, hits: 3 } },
    };
    const chips = statusChips(s);
    expect(chips.map((c) => c.id)).toEqual(['poison', 'chill', 'starve', 'ward', 'regen', 'enchant-ice']);
    expect(chips.map((c) => c.left)).toEqual(['5', '2歩', '', '4', '6', '3回']);
    expect(chips.every((c) => c.text.length > 0 && c.mark.length === 1)).toBe(true);
  });
});
