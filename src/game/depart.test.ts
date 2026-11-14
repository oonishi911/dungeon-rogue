import { describe, expect, it } from 'vitest';
import { favorableSpellbooks } from './bestLoadout';
import { FAVORABLE_GEAR, START_SPELLBOOKS, START_SUPPLIES } from './data';
import { depart } from './depart';
import { DEFAULT_DUNGEON, DEFAULT_DUNGEON_ID } from './dungeons';
import { traitForSeed } from './explore';

describe('depart（ダンジョンへの出発）', () => {
  it('特性は、階層の形と同じシードから決まる', () => {
    for (let i = 0; i < 10; i++) expect(depart(i * 977).trait).toBe(traitForSeed(i * 977));
  });

  it('有利な装備と回復薬2つに、そのダンジョンで有利な呪文書2冊を足して持っていく', () => {
    for (let i = 0; i < 10; i++) {
      const r = depart(i * 977);
      const books = favorableSpellbooks(r.trait, DEFAULT_DUNGEON, FAVORABLE_GEAR[r.trait], START_SPELLBOOKS);
      expect(r.dungeon).toBe(DEFAULT_DUNGEON_ID);
      expect(r.loadout).toEqual([...FAVORABLE_GEAR[r.trait], ...START_SUPPLIES, ...books]);
      expect(books).toHaveLength(2);
    }
  });
});
