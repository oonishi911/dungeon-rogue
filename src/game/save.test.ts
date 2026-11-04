import { describe, expect, it } from 'vitest';
import { RANK_CONFIG } from './rank';
import { newSave, parseSave, type SaveData } from './save';

const valid: SaveData = {
  version: 1,
  run: 4,
  rank: 3,
  exp: 1,
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
    expect(parseSave(JSON.stringify({ ...valid, exp: -1 }))).toBeNull();
    expect(parseSave(JSON.stringify({ ...valid, bonusGold: 1.5 }))).toBeNull();
    expect(parseSave(JSON.stringify({ ...valid, rank: RANK_CONFIG.maxRank + 1 }))).toBeNull();
    expect(parseSave(JSON.stringify({ ...valid, carried: [{ uid: 'x', cardId: 'no_such_card' }] }))).toBeNull();
  });
});
