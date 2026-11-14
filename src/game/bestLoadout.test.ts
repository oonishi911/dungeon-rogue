import { describe, expect, it } from 'vitest';
import { bestLoadout, favorableSpellbooks } from './bestLoadout';
import { buildPlayer, enemyHitDamage, itemSlot, playerHitDamage } from './combat';
import { FAVORABLE_GEAR, ITEMS, PREP_CONFIG, START_SPELLBOOKS, TRAIT_IDS } from './data';
import { DEFAULT_DUNGEON } from './dungeons';
import { enemyDef } from './enemies';
import type { ItemId, TraitId } from './types';

const slotOf = (loadout: ItemId[], slot: string) => loadout.filter((id) => itemSlot(ITEMS[id]) === slot);

/** 標準のダンジョンの敵（道中とボス）すべてに対する、与えるダメージと受けるダメージの合計 */
function sums(trait: TraitId, loadout: ItemId[]) {
  const { pool, boss } = DEFAULT_DUNGEON.encounters[trait];
  const stats = buildPlayer(loadout);
  const foes = [...pool, boss].map((id) => enemyDef({ id, elite: false }));
  return {
    dealt: foes.reduce((n, e) => n + playerHitDamage(stats, e), 0),
    taken: foes.reduce((n, e) => n + enemyHitDamage(stats, e), 0),
  };
}

describe('開発用：いちばん強い装備', () => {
  it.each(TRAIT_IDS)('%s：武器1つ・防具1つ・道具は上限まで・呪文書は上限まで', (trait) => {
    const loadout = bestLoadout(trait, DEFAULT_DUNGEON);
    expect(slotOf(loadout, 'weapon')).toHaveLength(1);
    expect(slotOf(loadout, 'armor')).toHaveLength(1);
    expect(slotOf(loadout, 'consumable')).toHaveLength(PREP_CONFIG.maxItems);
    const books = slotOf(loadout, 'spellbook');
    expect(books).toHaveLength(PREP_CONFIG.maxSpellbooks);
    expect(new Set(books).size).toBe(books.length);
  });

  it.each(TRAIT_IDS)('%s：ほかの武器や防具に替えても、強くならない（ボスも含めた合計で比べる）', (trait) => {
    const loadout = bestLoadout(trait, DEFAULT_DUNGEON);
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

describe('出発時に持たせる、有利な呪文書', () => {
  const books = (trait: TraitId, count = 2) => favorableSpellbooks(trait, DEFAULT_DUNGEON, FAVORABLE_GEAR[trait], count);

  it('属性ごとに、ちがう呪文書を2冊選ぶ（ダメージを与える呪文だけ）', () => {
    for (const trait of TRAIT_IDS) {
      const list = books(trait);
      expect(list).toHaveLength(START_SPELLBOOKS);
      expect(new Set(list).size).toBe(list.length);
      const attacks: ItemId[] = ['book_fire_bolt', 'book_ice_bolt', 'book_light_lance', 'book_dark_bolt', 'book_sweep', 'book_shockwave'];
      for (const id of list) expect(attacks).toContain(id);
    }
  });

  it('いちばん先に選ぶのは、その属性の敵の弱点を突く矢', () => {
    expect(books('fire')[0]).toBe('book_ice_bolt');
    expect(books('ice')[0]).toBe('book_fire_bolt');
    expect(books('light')[0]).toBe('book_dark_bolt');
    expect(books('dark')[0]).toBe('book_light_lance');
  });

  it('2冊目は、残りのうち与えるダメージが多いもの（光なら、光に1.5倍効く氷の矢）', () => {
    expect(books('light')[1]).toBe('book_ice_bolt');
    expect(books('dark')[1]).toBe('book_fire_bolt');
  });

  it('持っていける呪文書の数より多くは選ばない', () => {
    expect(books('fire', 10)).toHaveLength(PREP_CONFIG.maxSpellbooks);
  });
});
