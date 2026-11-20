// 手応えの設定の読み書き（src/ui/feelSettings.ts）
import { describe, expect, it } from 'vitest';
import { DEFAULT_FEEL_SETTINGS, parseFeelSettings } from './feelSettings';

describe('手応えの設定', () => {
  it('保存がなければ、ふだんの設定（どちらもオン）', () => {
    expect(parseFeelSettings(null)).toEqual(DEFAULT_FEEL_SETTINGS);
    expect(DEFAULT_FEEL_SETTINGS).toEqual({ shake: true, hitStop: true });
  });

  it('保存した設定を読む', () => {
    expect(parseFeelSettings('{"shake":false,"hitStop":true}')).toEqual({ shake: false, hitStop: true });
    expect(parseFeelSettings('{"shake":true,"hitStop":false}')).toEqual({ shake: true, hitStop: false });
  });

  it('形がおかしい・欠けているところは、ふだんの設定にする', () => {
    expect(parseFeelSettings('not json')).toEqual(DEFAULT_FEEL_SETTINGS);
    expect(parseFeelSettings('42')).toEqual(DEFAULT_FEEL_SETTINGS);
    expect(parseFeelSettings('{"shake":"no"}')).toEqual(DEFAULT_FEEL_SETTINGS);
    expect(parseFeelSettings('{"hitStop":false}')).toEqual({ shake: true, hitStop: false });
  });
});
