import { describe, expect, it } from 'vitest';
import { newSave, parseSave, type SaveData } from './save';

const valid: SaveData = {
  version: 1,
  run: 4,
  carried: [{ uid: 's1-c0', cardId: 'map' }],
  bonusGold: 85,
};

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
    expect(parseSave(JSON.stringify({ ...valid, bonusGold: 1.5 }))).toBeNull();
    expect(parseSave(JSON.stringify({ ...valid, carried: [{ uid: 'x', cardId: 'no_such_card' }] }))).toBeNull();
  });

  it('昔の記録にあったランクと経験は、読み飛ばす（読んだ結果には残らない）', () => {
    const old = { ...valid, rank: 3, exp: 1 };
    expect(parseSave(JSON.stringify(old))).toEqual(valid);
    // 壊れた値が残っていても、使わないので気にしない
    expect(parseSave(JSON.stringify({ ...valid, rank: 'x', exp: -1 }))).toEqual(valid);
  });
});
