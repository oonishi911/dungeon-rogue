import { describe, expect, it } from 'vitest';
import { DEFAULT_SOUND_SETTINGS, gainOf, parseSoundSettings } from './settings';

describe('音の設定', () => {
  it('保存されていなければ、ふだんの設定', () => {
    expect(parseSoundSettings(null)).toEqual(DEFAULT_SOUND_SETTINGS);
  });

  it('保存された設定を読む', () => {
    expect(parseSoundSettings(JSON.stringify({ enabled: false, volume: 0.3, ambient: 0.2 }))).toEqual({ enabled: false, volume: 0.3, ambient: 0.2 });
  });

  it('環境音の音量がない（前の版で保存した）設定は、環境音をふだんの音量にする', () => {
    expect(parseSoundSettings(JSON.stringify({ enabled: true, volume: 0.3 }))).toEqual({ enabled: true, volume: 0.3, ambient: DEFAULT_SOUND_SETTINGS.ambient });
  });

  it('形がおかしいところは、ふだんの設定にする', () => {
    expect(parseSoundSettings('こわれた')).toEqual(DEFAULT_SOUND_SETTINGS);
    expect(parseSoundSettings(JSON.stringify({ enabled: 'はい', volume: '大', ambient: null }))).toEqual(DEFAULT_SOUND_SETTINGS);
  });

  it('音量は0〜1におさめる', () => {
    expect(parseSoundSettings(JSON.stringify({ enabled: true, volume: 5, ambient: -1 }))).toMatchObject({ volume: 1, ambient: 0 });
  });

  it('オフなら音は出さない。音量はつまみの位置の2乗', () => {
    expect(gainOf({ enabled: false, volume: 1, ambient: 1 })).toBe(0);
    expect(gainOf({ enabled: false, volume: 1, ambient: 1 }, 'ambient')).toBe(0);
    expect(gainOf({ enabled: true, volume: 0.5, ambient: 0.2 })).toBe(0.25);
    expect(gainOf({ enabled: true, volume: 0.5, ambient: 0.2 }, 'ambient')).toBeCloseTo(0.04);
  });
});
