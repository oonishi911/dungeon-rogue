// 情報屋の話から、おすすめの装備にする（autoEquip.ts）
import { describe, expect, it } from 'vitest';
import { equipForIntel, factsOf } from './autoEquip';
import type { Intel } from './informant';
import { buy } from './shop';
import { newSave, type SaveData } from './save';
import type { ItemId, Result } from './types';

const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const own = (ids: ItemId[], memories = 0): SaveData => {
  const s = ids.reduce((x, id) => must(buy(x, id)), { ...newSave(), gold: 1_000_000 } as SaveData);
  return { ...s, memories: Array.from({ length: memories }, (_, i) => `m${i}`) as SaveData['memories'] };
};
const heard = (h: Partial<Intel>): Intel => ({ topic: 'trait', vague: false, text: '', memo: '', ...h }) as Intel;

describe('はっきり聞いたこと', () => {
  it('うわさは使わず、属性・体・弱点をまとめる', () => {
    const f = factsOf([heard({ element: 'fire' }), heard({ topic: 'boss', element: 'ice', body: 'hard' }), heard({ topic: 'body', vague: true, body: 'soft' }), heard({ topic: 'body', body: 'spirit', weakness: 'magic' })]);
    expect(f).toEqual({ elements: ['fire', 'ice'], bodies: ['hard', 'spirit'], weakness: 'magic' });
  });
});

describe('おすすめの装備', () => {
  const owned: ItemId[] = ['sword', 'sword_2', 'hammer', 'staff', 'plate', 'plate_2', 'robe', 'cloak', 'ring_fire_1', 'ring_fire_2', 'ring_ice_1', 'ring_all_1', 'book_fire_bolt', 'book_ice_bolt', 'book_ice_chain', 'book_heal', 'book_ward', 'book_sweep', 'book_prism_fan', 'potion', 'potion', 'potion', 'potion', 'potion', 'potion', 'food', 'food', 'food', 'panacea', 'fire_whetstone', 'ice_whetstone'];

  it('聞いた体によく効く武器と、聞いた属性に耐える指輪・よく効く呪文書・道具を選ぶ', () => {
    const save = own(owned, 4);
    const { save: s, notes } = equipForIntel(save, [heard({ element: 'fire' }), heard({ topic: 'body', body: 'hard' })]);
    expect(s.kit.weapon).toBe('hammer'); // 硬い体には槌
    expect(s.kit.rings?.[0]).toBe('ring_fire_2'); // 炎に耐える指輪の、段階の高い方
    expect(s.kit.rings).toContain('ring_all_1');
    expect(s.kit.books.slice(0, 2)).toEqual(['book_ice_chain', 'book_ice_bolt']); // 炎によく効く氷の矢（連矢を先に）
    expect(s.kit.books).toContain('book_heal');
    expect(s.kit.books).not.toContain('book_fire_bolt'); // 炎に効きにくい矢は選ばない（上限に収まらない）
    expect(s.kit.take).toContain('ice_whetstone');
    expect(s.kit.take).not.toContain('fire_whetstone');
    expect(s.kit.take.filter((x) => x === 'potion').length).toBeGreaterThan(0);
    expect(notes.some((n) => n.startsWith('武器：'))).toBe(true);
  });

  it('氷の属性と聞いたら毛皮の外套、杖をメインにするなら法衣、ほかは守りがいちばん高い防具', () => {
    const save = own(owned, 4);
    expect(equipForIntel(save, [heard({ element: 'ice' })]).save.kit.armor).toBe('cloak');
    expect(equipForIntel(save, [heard({ topic: 'body', body: 'spirit', weakness: 'magic' })]).save.kit.armor).toBe('robe');
    expect(equipForIntel(save, [heard({ topic: 'body', body: 'soft' })]).save.kit.armor).toBe('plate_2');
  });

  it('メインがよく効かない体があれば、その体によく効く別の種類をサブ武器にする', () => {
    const save = own(owned, 4);
    const { save: s } = equipForIntel(save, [heard({ topic: 'body', body: 'soft' }), heard({ topic: 'boss', body: 'hard' })]);
    expect(s.kit.weapon).toBe('sword_2');
    expect(s.kit.weapon2).toBe('hammer');
  });

  it('何も聞いていなければ、今の武器のまま。指輪は万能の指輪。持っていける数を超えない', () => {
    let save = own(owned, 0);
    save = { ...save, kit: { ...save.kit, weapon: 'staff' } };
    const { save: s, notes } = equipForIntel(save, []);
    expect(s.kit.weapon).toBe('staff');
    expect(s.kit.rings).toEqual(['ring_all_1']); // 指は1本
    expect(s.kit.take.length).toBeLessThanOrEqual(8);
    expect(s.kit.books.length).toBeLessThanOrEqual(5);
    expect(notes[0]).toContain('はっきり聞いたことがない');
  });

  it('持っていないもの・倉庫にない道具は選ばない', () => {
    const save = own(['sword', 'potion'], 0);
    const { save: s } = equipForIntel(save, [heard({ element: 'fire' })]);
    expect(s.kit.weapon).toBe('sword');
    expect(s.kit.armor).toBeNull();
    expect(s.kit.take).toEqual(['potion']);
    expect(s.kit.books).toEqual([]);
  });
});
