import { describe, expect, it } from 'vitest';
import { ITEMS, LOADOUT_CONFIG } from './data';
import { newSave, parseSave, type SaveData } from './save';
import { recommended, buy, departWith, equip, kitLoadout, returnWith, shelfItems, takeSupply, toggleBook } from './shop';
import type { ItemId, Result } from './types';

const rich = (gold = 100000): SaveData => ({ ...newSave(), gold });
const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const buyAll = (save: SaveData, ids: ItemId[]) => ids.reduce((s, id) => must(buy(s, id)), save);

describe('店に並ぶもの', () => {
  it('何も持っていなければ、武器・防具は種類ごとに2段目まで', () => {
    expect(shelfItems([], 'weapon')).toEqual(['sword', 'sword_2', 'hammer', 'hammer_2', 'staff', 'staff_2']);
    expect(shelfItems([], 'armor')).toHaveLength(10);
  });

  it('持っているいちばん上の段階と、その2つ上まで（下の段階は並べない）', () => {
    expect(shelfItems(['sword', 'sword_3'], 'weapon').filter((id) => id.startsWith('sword'))).toEqual(['sword_3', 'sword_4', 'sword_5']);
    expect(shelfItems(['sword_9'], 'weapon').filter((id) => id.startsWith('sword'))).toEqual(['sword_9', 'sword_10']);
  });

  it('道具と呪文書は、すべて並ぶ', () => {
    expect(shelfItems([], 'supply')).toContain('potion');
    expect(shelfItems([], 'book')).toHaveLength(8);
  });
});

describe('買う', () => {
  it('金貨が0なら何も買えない（補わない）', () => {
    const r = buy(newSave(), 'potion');
    expect(r.ok).toBe(false);
    expect(newSave().gold).toBe(0);
  });

  it('値段の分だけ金貨が減り、武器・防具はすぐ装備する', () => {
    const s = buyAll(rich(200), ['sword', 'plate']);
    expect(s.gold).toBe(200 - ITEMS.sword.price - ITEMS.plate.price);
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

  it('上の段階ほど高く、強い', () => {
    for (const [a, b] of [['sword', 'sword_10'], ['plate', 'plate_10']] as const) {
      expect(ITEMS[b].price).toBeGreaterThan(ITEMS[a].price);
    }
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
    let s = buyAll(rich(100), ['sword', 'potion', 'potion', 'food']);
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

  it('保存して読み込むと、金貨・持ち物・倉庫・選び方が戻る', () => {
    const s = departWith(buyAll(rich(500), ['sword_2', 'plate', 'book_heal', 'potion', 'potion']));
    expect(parseSave(JSON.stringify(s))).toEqual(s);
  });
});

describe('おすすめの印', () => {
  const clear = (topic: 'trait' | 'body' | 'boss', facts: { element?: 'fire' | 'ice' | 'neutral' | 'light' | 'dark'; body?: 'normal' | 'soft' | 'hard' | 'spirit' }) => ({ topic, vague: false, text: '', memo: '', ...facts });

  it('何も聞いていない・うわさだけなら、印は付かない', () => {
    expect(recommended([]).size).toBe(0);
    expect(recommended([{ topic: 'trait', vague: true, text: '', memo: '' }]).size).toBe(0);
  });

  it('属性がはっきりわかれば、その属性を防ぐ防具（すべての段階）と、よく効く砥石・矢の呪文書に付く', () => {
    const p = recommended([clear('trait', { element: 'fire' })]);
    expect(p.has('fire_cloak')).toBe(true);
    expect(p.has('fire_cloak_10')).toBe(true);
    expect(p.has('ice_cloak')).toBe(false);
    expect(p.has('ice_whetstone')).toBe(true);
    expect(p.has('fire_whetstone')).toBe(false);
    expect(p.has('book_ice_bolt')).toBe(true);
    expect(p.has('book_fire_bolt')).toBe(false);
    // 光は、光の衣がいちばん防ぐ
    expect(recommended([clear('trait', { element: 'light' })]).has('light_robe')).toBe(true);
  });

  it('体がはっきりわかれば、その体によく効く武器（すべての段階）に付く。普通の体なら付かない', () => {
    expect(recommended([clear('body', { body: 'hard' })]).has('hammer_3')).toBe(true);
    expect(recommended([clear('body', { body: 'spirit' })]).has('staff')).toBe(true);
    expect(recommended([clear('body', { body: 'soft' })]).has('sword')).toBe(true);
    expect([...recommended([clear('body', { body: 'normal' })])].some((id) => ITEMS[id].effect.kind === 'weapon')).toBe(false);
  });
});
