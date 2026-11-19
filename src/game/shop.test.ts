import { describe, expect, it } from 'vitest';
import { ITEMS, LOADOUT_CONFIG } from './data';
import { newSave, parseSave, type SaveData } from './save';
import { recommended, buy, canTake, count, departWith, equip, kitLoadout, returnWith, shelfItems, takeCount, takeLimit, takeSupply, toggleBook } from './shop';
import type { ItemId, Result } from './types';

const rich = (gold = 100000): SaveData => ({ ...newSave(), gold });
const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const buyAll = (save: SaveData, ids: ItemId[]) => ids.reduce((s, id) => must(buy(s, id)), save);
/** ちょうどその品物を買える金貨 */
const priceOfAll = (ids: ItemId[]) => ids.reduce((sum, id) => sum + ITEMS[id].price, 0);

describe('店に並ぶもの', () => {
  it('何も持っていなければ、武器・防具は種類ごとに2段目まで', () => {
    expect(shelfItems([], 'weapon')).toEqual(['sword', 'sword_2', 'hammer', 'hammer_2', 'staff', 'staff_2']);
    expect(shelfItems([], 'armor')).toHaveLength(2); // 防具は鎧1つだけ（守りだけ。属性は指輪）
    // 指輪は、6種類（炎・氷・無属性・光・闇・万能）を、1段目と2段目まで。二重耐性の指輪は並ばない
    expect(shelfItems([], 'ring')).toHaveLength(12);
    expect(shelfItems([], 'ring')).toContain('ring_all_2');
    expect(shelfItems([], 'ring').some((id) => id.startsWith('ring_dual'))).toBe(false);
  });

  it('指輪も、持っているいちばん上の段階と、その2つ上まで（5段階が上限）', () => {
    expect(shelfItems(['ring_fire_2'], 'ring').filter((id) => id.startsWith('ring_fire'))).toEqual(['ring_fire_2', 'ring_fire_3', 'ring_fire_4']);
    expect(shelfItems(['ring_fire_4'], 'ring').filter((id) => id.startsWith('ring_fire'))).toEqual(['ring_fire_4', 'ring_fire_5']);
    expect(shelfItems(['ring_fire_4'], 'ring').filter((id) => id.startsWith('ring_ice'))).toEqual(['ring_ice_1', 'ring_ice_2']);
  });

  it('持っているいちばん上の段階と、その2つ上まで（下の段階は並べない）', () => {
    expect(shelfItems(['sword', 'sword_3'], 'weapon').filter((id) => id.startsWith('sword'))).toEqual(['sword_3', 'sword_4', 'sword_5']);
    expect(shelfItems(['sword_9'], 'weapon').filter((id) => id.startsWith('sword'))).toEqual(['sword_9', 'sword_10']);
  });

  it('道具と呪文書は、すべて並ぶ', () => {
    expect(shelfItems([], 'supply')).toContain('potion');
    expect(shelfItems([], 'book')).toHaveLength(14);
  });
});

describe('買う', () => {
  it('金貨が0なら何も買えない（補わない）', () => {
    const r = buy(newSave(), 'potion');
    expect(r.ok).toBe(false);
    expect(newSave().gold).toBe(0);
  });

  it('値段の分だけ金貨が減り、武器・防具はすぐ装備する', () => {
    const s = buyAll(rich(priceOfAll(['sword', 'plate']) + 7), ['sword', 'plate']);
    expect(s.gold).toBe(7);
    expect(s.kit.weapon).toBe('sword');
    expect(s.kit.armor).toBe('plate');
    expect(s.owned).toEqual(['sword', 'plate']);
  });

  it('同じ武器・防具・呪文書は2つ買えない。並んでいない段階も買えない', () => {
    const s = buyAll(rich(), ['sword']);
    expect(buy(s, 'sword').ok).toBe(false);
    expect(buy(s, 'sword_4').ok).toBe(false);
    expect(buy(s, 'sword_3').ok).toBe(true);
  });

  it('店で上の段階を買っても、その場では並びは広がらず、次に店に入ったときに広がる', () => {
    const atEntry: ItemId[] = [];
    const s = must(buy(rich(), 'sword_2', atEntry));
    expect(buy(s, 'sword_3', atEntry).ok).toBe(false); // 同じ店では、まだ並んでいない
    expect(shelfItems(atEntry, 'weapon').filter((id) => id.startsWith('sword'))).toEqual(['sword', 'sword_2']);
    expect(shelfItems(s.owned, 'weapon').filter((id) => id.startsWith('sword'))).toEqual(['sword_2', 'sword_3', 'sword_4']); // 次の店
    expect(buy(s, 'sword_3', s.owned).ok).toBe(true);
  });

  it('道具は倉庫に入り、持っていく数に余りがあれば持っていくものにも入る', () => {
    let s = rich();
    for (let i = 0; i < LOADOUT_CONFIG.maxItems + 2; i++) s = must(buy(s, 'potion'));
    expect(s.stock).toHaveLength(LOADOUT_CONFIG.maxItems + 2);
    expect(s.kit.take).toHaveLength(LOADOUT_CONFIG.maxItems);
  });
});

describe('持ち物を選ぶ', () => {
  it('持っている武器に持ち替えられる。持っていないものは装備できない', () => {
    const s = buyAll(rich(), ['sword', 'hammer']);
    expect(s.kit.weapon).toBe('hammer');
    expect(must(equip(s, 'weapon', 'sword')).kit.weapon).toBe('sword');
    expect(equip(s, 'weapon', 'staff').ok).toBe(false);
    expect(must(equip(s, 'weapon', null)).kit.weapon).toBeNull();
  });

  it('呪文書は3冊まで持っていける', () => {
    let s = buyAll(rich(), ['book_heal', 'book_sweep', 'book_fire_bolt', 'book_ice_bolt']);
    expect(s.kit.books).toEqual(['book_heal', 'book_sweep', 'book_fire_bolt']);
    expect(toggleBook(s, 'book_ice_bolt').ok).toBe(false);
    s = must(toggleBook(s, 'book_heal'));
    s = must(toggleBook(s, 'book_ice_bolt'));
    expect(s.kit.books).toEqual(['book_sweep', 'book_fire_bolt', 'book_ice_bolt']);
  });

  it('道具は倉庫にある数までしか持っていけない', () => {
    let s = buyAll(rich(), ['potion']);
    s = must(takeSupply(s, 'potion', -1));
    expect(s.kit.take).toEqual([]);
    s = must(takeSupply(s, 'potion', 1));
    expect(takeSupply(s, 'potion', 1).ok).toBe(false);
  });
});

describe('出発と帰り', () => {
  it('持っていく道具は倉庫から出て、使わなかった道具と持ち帰った金貨は戻る', () => {
    const ids: ItemId[] = ['sword', 'potion', 'potion', 'food'];
    let s = buyAll(rich(priceOfAll(ids)), ids);
    expect(kitLoadout(s)).toEqual(['sword', 'potion', 'potion', 'food']);
    s = must(takeSupply(s, 'food', -1));
    const out = departWith(s);
    expect(out.stock).toEqual(['food']);
    const back = returnWith(out, 40, ['potion', 'fire_whetstone']);
    expect(back.gold).toBe(out.gold + 40);
    expect([...back.stock].sort()).toEqual(['fire_whetstone', 'food', 'potion'].sort());
    // 武器はずっと持っている。次も同じ選び方から始まり、倉庫にない分は外れる
    expect(back.owned).toContain('sword');
    expect(back.kit.take).toEqual(['potion']);
  });

  it('遠見のランタンは道具として買い、持っていくと（使っても使わなくても）倉庫に戻らない', () => {
    let s = buyAll(rich(priceOfAll(['lantern', 'lantern'])), ['lantern', 'lantern']);
    expect(s.stock).toEqual(['lantern', 'lantern']);
    s = must(takeSupply(s, 'lantern', -1));
    const out = departWith(s);
    // 探索から持ち帰る道具（使わなかったもの）に、ランタンは入らない（探索の持ち物に入らないため）
    const back = returnWith(out, 0, []);
    expect(back.stock).toEqual(['lantern']);
  });

  it('保存して読み込むと、金貨・持ち物・倉庫・選び方が戻る', () => {
    const s = departWith(buyAll(rich(), ['sword_2', 'plate', 'book_heal', 'potion', 'potion']));
    expect(parseSave(JSON.stringify(s))).toEqual(s);
  });
});

describe('おすすめの印', () => {
  const clear = (topic: 'trait' | 'body' | 'boss', facts: { element?: 'fire' | 'ice' | 'neutral' | 'light' | 'dark'; body?: 'normal' | 'soft' | 'hard' | 'spirit'; weakness?: 'magic' | 'physical' | 'none' }) => ({ topic, vague: false, text: '', memo: '', ...facts });

  const ringPicks = (p: Set<ItemId>) => [...p].filter((id) => id.startsWith('ring_'));

  it('何も聞いていない・うわさだけなら、武器・砥石・呪文書の印は付かず、万能の指輪だけに付く', () => {
    for (const p of [recommended([]), recommended([{ topic: 'trait', vague: true, text: '', memo: '' }])]) {
      expect(ringPicks(p).sort()).toEqual([1, 2, 3, 4, 5].map((l) => `ring_all_${l}`));
      expect([...p].filter((id) => !id.startsWith('ring_'))).toEqual([]);
    }
  });

  it('属性がはっきりわかれば、その属性の指輪（すべての段階と、その属性を含む二重耐性の指輪）と、よく効く砥石・矢の呪文書に付く', () => {
    const p = recommended([clear('trait', { element: 'fire' })]);
    expect(p.has('ring_fire_1')).toBe(true);
    expect(p.has('ring_fire_5')).toBe(true);
    expect(p.has('ring_ice_1')).toBe(false); // 逆の属性の指輪は、弱点になる
    expect(p.has('ring_all_1')).toBe(false); // 属性がわかったので、万能の指輪の保険はいらない
    expect(p.has('ring_dual_fire_ice_3')).toBe(true);
    expect(p.has('ring_dual_fire_dark_2')).toBe(true);
    expect(p.has('ring_dual_ice_light_3')).toBe(false);
    expect(p.has('ice_whetstone')).toBe(true);
    expect(p.has('fire_whetstone')).toBe(false);
    expect(p.has('book_ice_bolt')).toBe(true);
    expect(p.has('book_fire_bolt')).toBe(false);
    expect(recommended([clear('trait', { element: 'light' })]).has('ring_light_2')).toBe(true);
    expect(recommended([clear('trait', { element: 'neutral' })]).has('ring_neutral_1')).toBe(true);
  });

  it('体だけがわかったとき（属性は聞いていない）は、万能の指輪に付く', () => {
    expect(recommended([clear('body', { body: 'hard' })]).has('ring_all_3')).toBe(true);
  });

  it('体がはっきりわかれば、その体によく効く武器（すべての段階）に付く。普通の体なら付かない', () => {
    expect(recommended([clear('body', { body: 'hard' })]).has('hammer_3')).toBe(true);
    expect(recommended([clear('body', { body: 'spirit' })]).has('staff')).toBe(true);
    expect(recommended([clear('body', { body: 'soft' })]).has('sword')).toBe(true);
    expect([...recommended([clear('body', { body: 'normal' })])].some((id) => ITEMS[id].effect.kind === 'weapon')).toBe(false);
  });
});

describe('おすすめの印（魔法・物理の弱点）', () => {
  const heard = (weakness: 'magic' | 'physical' | 'none') => ({ topic: 'body' as const, vague: false, text: '', memo: '', weakness });

  it('魔法に弱い魔物が多いと聞けば、杖と、ダメージを与える呪文書に付く', () => {
    const p = recommended([heard('magic')]);
    expect(p.has('staff')).toBe(true);
    expect(p.has('staff_10')).toBe(true);
    expect(p.has('book_fire_chain')).toBe(true);
    expect(p.has('book_sweep_bleed')).toBe(true);
    expect(p.has('book_shockwave_strong')).toBe(true);
    expect(p.has('book_heal')).toBe(false);
    expect(p.has('sword')).toBe(false);
  });

  it('物理に弱い魔物が多いと聞けば、剣と槌に付く。偏りがなければ付かない。うわさだけでも付かない', () => {
    const p = recommended([heard('physical')]);
    expect(p.has('sword_5')).toBe(true);
    expect(p.has('hammer')).toBe(true);
    expect(p.has('staff')).toBe(false);
    expect(p.has('book_fire_bolt')).toBe(false);
    expect([...recommended([heard('none')])].filter((id) => !id.startsWith('ring_'))).toEqual([]);
    expect([...recommended([{ ...heard('magic'), vague: true }])].filter((id) => !id.startsWith('ring_'))).toEqual([]);
  });
});

describe('大きな袋', () => {
  const bonus = (() => {
    const e = ITEMS.bag.effect;
    return e.kind === 'capacity' ? e.slots : NaN;
  })();
  const stocked = (ids: ItemId[]) => buyAll(rich(), ids);

  it('袋を入れると、持っていける道具が増える（袋そのものは数えない）', () => {
    let s = stocked(Array.from({ length: LOADOUT_CONFIG.maxItems + bonus + 1 }, () => 'potion' as ItemId));
    expect(takeCount(s.kit.take)).toBe(LOADOUT_CONFIG.maxItems);
    expect(takeSupply(s, 'potion', 1).ok).toBe(false);
    s = must(buy(s, 'bag')); // 買うと、そのまま持っていくものに入る
    expect(s.kit.take).toContain('bag');
    expect(takeLimit(s.kit.take)).toBe(LOADOUT_CONFIG.maxItems + bonus);
    for (let i = 0; i < bonus; i++) s = must(takeSupply(s, 'potion', 1));
    expect(takeCount(s.kit.take)).toBe(LOADOUT_CONFIG.maxItems + bonus);
    expect(takeSupply(s, 'potion', 1).ok).toBe(false);
  });

  it('袋は1つまで。外すと、増えた分の道具も外れる', () => {
    let s = stocked(['bag', 'bag', ...Array.from({ length: LOADOUT_CONFIG.maxItems + bonus }, () => 'food' as ItemId)]);
    expect(count(s.kit.take, 'bag')).toBe(1);
    expect(takeSupply(s, 'bag', 1).ok).toBe(false);
    while (canTake(s.kit.take, 'food') && count(s.kit.take, 'food') < count(s.stock, 'food')) s = must(takeSupply(s, 'food', 1));
    expect(takeCount(s.kit.take)).toBe(LOADOUT_CONFIG.maxItems + bonus);
    s = must(takeSupply(s, 'bag', -1));
    expect(s.kit.take).not.toContain('bag');
    expect(takeCount(s.kit.take)).toBe(LOADOUT_CONFIG.maxItems);
  });

  it('持っていった袋は、倉庫に戻らない', () => {
    const s = stocked(['bag', 'potion']);
    const back = returnWith(departWith(s), 0, ['potion']);
    expect(back.stock).toEqual(['potion']);
  });
});
