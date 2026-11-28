// 画質の設定（graphicsQuality.ts）
import { describe, expect, it } from 'vitest';
import { neighborLevel, qualityRange, shouldDraw, startLevelOf } from './graphicsQuality';

const LEVELS = 8; // explore3dConfig.ts の QUALITY.levels の数（0：きれい、1〜6：ふつう、7：軽い）

describe('画質ごとの段の範囲', () => {
  it('きれいは0段に、軽いはいちばん下の段に固定。ふつうは1〜6段を自動で上げ下げ', () => {
    expect(qualityRange('high', LEVELS)).toEqual({ min: 0, max: 0, adaptive: false });
    expect(qualityRange('light', LEVELS)).toEqual({ min: 7, max: 7, adaptive: false });
    expect(qualityRange('normal', LEVELS)).toEqual({ min: 1, max: 6, adaptive: true });
  });

  it('始める段：ふつうは、速い端末なら範囲のいちばん上、それ以外はその次。固定の画質は、その段', () => {
    const normal = qualityRange('normal', LEVELS);
    expect(startLevelOf(normal, 8, 6)).toBe(1);
    expect(startLevelOf(normal, 4, 6)).toBe(2);
    expect(startLevelOf(qualityRange('high', LEVELS), 2, 6)).toBe(0);
    expect(startLevelOf(qualityRange('light', LEVELS), 16, 6)).toBe(7);
  });

  it('上げ下げは範囲の中だけ。見た目が同じ段は飛ばす', () => {
    const normal = qualityRange('normal', LEVELS);
    const differ = () => false;
    expect(neighborLevel(1, -1, normal, differ)).toBe(1); // ふつうから「きれい」には上がらない
    expect(neighborLevel(6, 1, normal, differ)).toBe(6); // ふつうから「軽い」には下がらない
    expect(neighborLevel(3, 1, normal, differ)).toBe(4);
    // 2段と3段が同じ見た目なら、2段から下げると4段へ
    expect(neighborLevel(2, 1, normal, (a, b) => (a === 3 && b === 2) || (a === 2 && b === 3))).toBe(4);
  });

  it('軽いは、前に描いてから約33ms たつまで描かない。ほかは毎コマ描く', () => {
    expect(shouldDraw('light', 16, 33)).toBe(false);
    expect(shouldDraw('light', 32, 33)).toBe(true);
    expect(shouldDraw('normal', 1, 33)).toBe(true);
    expect(shouldDraw('high', 1, 33)).toBe(true);
  });
});
