import { describe, expect, it } from 'vitest';
import { DEFAULT_SOUND_SETTINGS, gainOf, parseSoundSettings } from './settings';

describe('効果音の設定', () => {
  it('保存されていなければ、ふだんの設定', () => {
    expect(parseSoundSettings(null)).toEqual(DEFAULT_SOUND_SETTINGS);
  });

  it('保存された設定を読む', () => {
    expect(parseSoundSettings(JSON.stringify({ enabled: false, volume: 0.3 }))).toEqual({ enabled: false, volume: 0.3 });
  });

  it('形がおかしいところは、ふだんの設定にする', () => {
    expect(parseSoundSettings('こわれた')).toEqual(DEFAULT_SOUND_SETTINGS);
    expect(parseSoundSettings(JSON.stringify({ enabled: 'はい', volume: '大' }))).toEqual(DEFAULT_SOUND_SETTINGS);
  });

  it('音量は0〜1におさめる', () => {
    expect(parseSoundSettings(JSON.stringify({ enabled: true, volume: 5 })).volume).toBe(1);
    expect(parseSoundSettings(JSON.stringify({ enabled: true, volume: -1 })).volume).toBe(0);
  });

  it('オフなら音は出さない。音量はつまみの位置の2乗', () => {
    expect(gainOf({ enabled: false, volume: 1 })).toBe(0);
    expect(gainOf({ enabled: true, volume: 0.5 })).toBe(0.25);
  });
});
