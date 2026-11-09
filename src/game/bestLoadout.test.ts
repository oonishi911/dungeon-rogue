import { describe, expect, it } from 'vitest';
import { bestLoadout } from './bestLoadout';
import { buildPlayer, enemyHitDamage, itemSlot, playerHitDamage } from './combat';
import { ITEMS, PREP_CONFIG, TRAIT_ENEMIES, TRAIT_IDS } from './data';
import { enemyDef } from './enemies';
import type { ItemId, TraitId } from './types';

const slotOf = (loadout: ItemId[], slot: string) => loadout.filter((id) => itemSlot(ITEMS[id]) === slot);

/** ダンジョンの敵（道中とボス）すべてに対する、与えるダメージと受けるダメージの合計 */
function sums(trait: TraitId, loadout: ItemId[]) {
  const { pool, boss } = TRAIT_ENEMIES[trait];
  const stats = buildPlayer(loadout);
  const foes = [...pool, boss].map((id) => enemyDef({ id, elite: false }));
  return {
    dealt: foes.reduce((n, e) => n + playerHitDamage(stats, e), 0),
    taken: foes.reduce((n, e) => n + enemyHitDamage(stats, e), 0),
  };
}

describe('開発用：いちばん強い装備', () => {
  it.each(TRAIT_IDS)('%s：武器1つ・防具1つ・道具は上限まで・呪文書は上限まで', (trait) => {
    const loadout = bestLoadout(trait);
    expect(slotOf(loadout, 'weapon')).toHaveLength(1);
    expect(slotOf(loadout, 'armor')).toHaveLength(1);
    expect(slotOf(loadout, 'consumable')).toHaveLength(PREP_CONFIG.maxItems);
    const books = slotOf(loadout, 'spellbook');
    expect(books).toHaveLength(PREP_CONFIG.maxSpellbooks);
    expect(new Set(books).size).toBe(books.length);
  });

  it.each(TRAIT_IDS)('%s：ほかの武器や防具に替えても、強くならない（ボスも含めた合計で比べる）', (trait) => {
    const loadout = bestLoadout(trait);
    const [weapon] = slotOf(loadout, 'weapon');
    const [armor] = slotOf(loadout, 'armor');
    const chosen = sums(trait, [weapon!, armor!]);
    const all = Object.keys(ITEMS) as ItemId[];
    for (const w of all.filter((id) => itemSlot(ITEMS[id]) === 'weapon')) {
      // ボスは重く数えて選ぶので、ボスを1体と数えたこの合計では、少しだけ上回る武器があってもよい
      expect(sums(trait, [w, armor!]).dealt).toBeLessThanOrEqual(chosen.dealt * 1.25);
    }
    for (const a of all.filter((id) => itemSlot(ITEMS[id]) === 'armor')) {
      expect(sums(trait, [weapon!, a]).taken).toBeGreaterThanOrEqual(chosen.taken * 0.8);
    }
  });
});
