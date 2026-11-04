import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../game/data';
import { CLOAKS, PALETTE, SPRITES } from './data';

describe('ドット絵のデータ', () => {
  const cloakKeys = Object.keys(CLOAKS.none);

  for (const [name, rows] of Object.entries(SPRITES)) {
    it(`${name}：32×32で、使っている文字はすべて色が決まっている`, () => {
      expect(rows).toHaveLength(32);
      for (const row of rows) {
        expect(row).toHaveLength(32);
        for (const ch of row) {
          expect(ch === '.' || ch in PALETTE || cloakKeys.includes(ch)).toBe(true);
        }
      }
    });
  }

  it('すべての敵に絵がある', () => {
    for (const id of Object.keys(ENEMIES)) expect(id in SPRITES).toBe(true);
  });
});
