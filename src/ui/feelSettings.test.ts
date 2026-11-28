// 手応え・表示・キーの設定の読み書き（src/ui/feelSettings.ts）
import { describe, expect, it } from 'vitest';
import { DEFAULT_FEEL_SETTINGS, parseFeelSettings } from './feelSettings';
import { DEFAULT_BINDINGS } from './keyBindings';

const D = DEFAULT_FEEL_SETTINGS;

describe('設定', () => {
  it('保存がなければ、ふだんの設定（揺れ・ヒットストップ・弱点の印はあり、文字は中、キーはふだんの割り当て）', () => {
    expect(parseFeelSettings(null)).toEqual(D);
    expect(D).toEqual({ shake: true, hitStop: true, weakMarks: true, bossMusic: true, stairsFx: true, endFx: true, textSize: 'normal', keys: DEFAULT_BINDINGS });
  });

  it('ボス戦の音楽・階段の演出・踏破や力尽きたときの演出も、切れる', () => {
    expect(parseFeelSettings('{"bossMusic":false,"stairsFx":false,"endFx":false}')).toEqual({ ...D, bossMusic: false, stairsFx: false, endFx: false });
    expect(parseFeelSettings('{"bossMusic":"x"}')).toEqual(D);
  });

  it('保存した設定を読む（前の形の保存＝揺れとヒットストップだけ、も読める）', () => {
    expect(parseFeelSettings('{"shake":false,"hitStop":true}')).toEqual({ ...D, shake: false });
    expect(parseFeelSettings('{"shake":true,"hitStop":false,"weakMarks":false,"textSize":"large"}')).toEqual({ ...D, hitStop: false, weakMarks: false, textSize: 'large' });
    expect(parseFeelSettings(JSON.stringify({ keys: { ...DEFAULT_BINDINGS, stairs: 'e' } })).keys.stairs).toBe('e');
  });

  it('形がおかしい・欠けているところは、ふだんの設定にする', () => {
    expect(parseFeelSettings('not json')).toEqual(D);
    expect(parseFeelSettings('42')).toEqual(D);
    expect(parseFeelSettings('{"shake":"no"}')).toEqual(D);
    expect(parseFeelSettings('{"hitStop":false}')).toEqual({ ...D, hitStop: false });
    expect(parseFeelSettings('{"textSize":"huge","weakMarks":1}')).toEqual(D);
  });
});
