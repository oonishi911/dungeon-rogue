import { describe, expect, it } from 'vitest';
import { ENEMIES, ITEM_MASTER, TRAITS, TRAIT_IDS } from './data';
import { DEFAULT_DUNGEON_ID } from './dungeons';
import { ask, bossOf, commonBody, INFORMANT_CONFIG, questionsLeft, startInformant, type InformantState } from './informant';
import { newSave, type SaveData } from './save';

const save = (gold: number): SaveData => ({ ...newSave(), gold });
const start = (trait = TRAIT_IDS[0]!, seed = 7): InformantState => startInformant(DEFAULT_DUNGEON_ID, seed, trait);

describe('情報屋', () => {
  it('1回目は、それとなく（無料で）聞ける。答えは本当の属性と、違う属性の2つが混ざる', () => {
    for (const trait of TRAIT_IDS) {
      for (let seed = 1; seed < 20; seed++) {
        const r = ask(start(trait, seed), save(0), 'trait', false);
        if (!r.ok) throw new Error(r.error);
        const intel = r.value.state.heard[0]!;
        expect(intel.vague).toBe(true);
        expect(r.value.save.gold).toBe(0);
        const names = TRAIT_IDS.filter((t) => intel.memo.includes(TRAITS[t].name));
        expect(names).toContain(trait);
        expect(names).toHaveLength(2);
      }
    }
  });

  it('同じダンジョン（同じシード）なら、いつも同じ答え', () => {
    const a = ask(start('fire', 99), save(0), 'trait', false);
    const b = ask(start('fire', 99), save(0), 'trait', false);
    expect(a).toEqual(b);
  });

  it('はっきり聞くと、情報料を払って、正しい答えが聞ける', () => {
    const r = ask(start('ice'), save(100), 'trait', true);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.save.gold).toBe(100 - ITEM_MASTER.information.trait);
    expect(r.value.state.heard[0]!.memo).toBe(`属性：${TRAITS.ice.name}`);
  });

  it('金貨が足りなければ、はっきりは聞けない', () => {
    expect(ask(start(), save(ITEM_MASTER.information.trait - 1), 'trait', true).ok).toBe(false);
  });

  it('無料で聞けるのは1回目だけ。聞けるのは決まった回数まで。同じことは2度聞けない', () => {
    let s = start('dark');
    let money = save(1000);
    const go = (topic: 'trait' | 'body' | 'boss', clear: boolean) => {
      const r = ask(s, money, topic, clear);
      if (!r.ok) return r.error;
      s = r.value.state;
      money = r.value.save;
      return null;
    };
    expect(go('trait', false)).toBeNull();
    expect(go('trait', true)).not.toBeNull();
    expect(go('body', false)).not.toBeNull();
    expect(go('body', true)).toBeNull();
    expect(questionsLeft(s)).toBe(INFORMANT_CONFIG.questions - 2);
    expect(go('boss', true)).not.toBeNull();
  });

  it('魔物の体とボスは、そのダンジョンの設定から答える', () => {
    for (const trait of TRAIT_IDS) {
      const r = ask(start(trait), save(1000), 'boss', true);
      if (!r.ok) throw new Error(r.error);
      expect(r.value.state.heard[0]!.memo).toContain(ENEMIES[bossOf(DEFAULT_DUNGEON_ID, trait)]!.name);
      const b = ask(start(trait), save(1000), 'body', true);
      if (!b.ok) throw new Error(b.error);
      expect(b.value.state.heard[0]!.memo.length).toBeGreaterThan(0);
      expect(['normal', 'soft', 'hard', 'spirit']).toContain(commonBody(DEFAULT_DUNGEON_ID, trait));
    }
  });
});
