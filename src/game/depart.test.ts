import { describe, expect, it } from 'vitest';
import { depart } from './depart';
import { DEFAULT_DUNGEON_ID } from './dungeons';
import { traitForSeed } from './explore';

describe('depart（ダンジョンへの出発）', () => {
  it('特性は、階層の形と同じシードから決まる', () => {
    for (let i = 0; i < 10; i++) expect(depart(i * 977).trait).toBe(traitForSeed(i * 977));
  });

  it('持ち物は、店で選んだものだけ（何も選ばなければ何も持たない）', () => {
    expect(depart(1).loadout).toEqual([]);
    expect(depart(1, DEFAULT_DUNGEON_ID, ['sword', 'potion'])).toEqual({ dungeon: DEFAULT_DUNGEON_ID, trait: traitForSeed(1), loadout: ['sword', 'potion'] });
  });
});
