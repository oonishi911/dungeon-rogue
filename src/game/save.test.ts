import { describe, expect, it } from 'vitest';
import { newSave, parseSave, type SaveData } from './save';

const valid: SaveData = { ...newSave(), run: 4 };

describe('parseSave', () => {
  it('保存したものをそのまま読める', () => {
    expect(parseSave(JSON.stringify(valid))).toEqual(valid);
    expect(parseSave(JSON.stringify(newSave()))).toEqual(newSave());
  });

  it('何も保存されていなければ null', () => {
    expect(parseSave(null)).toBeNull();
    expect(parseSave('')).toBeNull();
  });

  it('壊れたデータや形の違うデータは null', () => {
    expect(parseSave('{not json')).toBeNull();
    expect(parseSave('42')).toBeNull();
    expect(parseSave(JSON.stringify({ ...valid, version: 0 }))).toBeNull();
    expect(parseSave(JSON.stringify({ ...valid, run: 0 }))).toBeNull();
    expect(parseSave(JSON.stringify({ ...valid, run: 1.5 }))).toBeNull();
  });

  it('昔の記録にあったランク・経験・持ち越したカード・持ち帰った金貨は、読み飛ばす（読んだ結果には残らない）', () => {
    const old = { ...valid, rank: 3, exp: 1, carried: [{ uid: 's1-c0', cardId: 'map' }], bonusGold: 85 };
    expect(parseSave(JSON.stringify(old))).toEqual(valid);
    // 壊れた値が残っていても、使わないので気にしない
    expect(parseSave(JSON.stringify({ ...valid, rank: 'x', exp: -1, carried: 'x', bonusGold: -1 }))).toEqual(valid);
  });

  it('金貨・持ち物・倉庫のない昔の記録は、どれも空から始める', () => {
    expect(parseSave(JSON.stringify({ version: 1, run: 4 }))).toEqual(valid);
  });

  it('読めない品物や、もう持っていないものを選んだ記録は、その分だけ捨てる', () => {
    const save = parseSave(
      JSON.stringify({
        ...valid,
        gold: 120,
        owned: ['sword', 'no_such_item', 'potion'],
        stock: ['potion', 'sword'],
        kit: { weapon: 'hammer', armor: null, books: ['book_heal'], take: ['potion', 'potion'] },
      }),
    );
    expect(save).toEqual({ ...valid, gold: 120, owned: ['sword'], stock: ['potion'], kit: { weapon: null, armor: null, books: [], take: ['potion', 'potion'] } });
  });
});
