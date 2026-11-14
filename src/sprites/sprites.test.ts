import { describe, expect, it } from 'vitest';
import { baseItemOf } from '../game/itemMaster';
import { ENEMIES, ITEMS } from '../game/data';
import { CLOAKS, PALETTE, SPRITES } from './data';
import { cloakOf, ENEMY_LOOKS } from './looks';

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

  it('すべての敵に見た目があり、色の差し替えは絵で使っている文字だけ', () => {
    for (const id of Object.keys(ENEMIES)) {
      const look = ENEMY_LOOKS[id]!;
      expect(look.sprite in SPRITES).toBe(true);
      const used = new Set(SPRITES[look.sprite].join(''));
      for (const ch of Object.keys(look.recolor ?? {})) expect(used.has(ch)).toBe(true);
    }
  });

  it('すべての防具にマントの色がある（段階が違っても、同じ種類なら同じ色）', () => {
    for (const item of Object.values(ITEMS)) {
      if (item.effect.kind === 'armor') expect(cloakOf(item.id)).toBe(baseItemOf(item.id));
    }
    expect(cloakOf(null)).toBe('none');
  });
});
