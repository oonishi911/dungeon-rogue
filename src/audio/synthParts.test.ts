// 合成音の部品：ノイズの素材（docs/sounds.md）
import { describe, expect, it } from 'vitest';
import { noiseOf, type NoiseColor } from './synthParts';

/** AudioContext の代わり（素材を作るのに要る所だけ） */
const fakeCtx = (sampleRate: number) =>
  ({
    sampleRate,
    createBuffer: (_channels: number, length: number, rate: number) => {
      const data = new Float32Array(length);
      return { sampleRate: rate, length, getChannelData: () => data };
    },
  }) as unknown as BaseAudioContext;

const rms = (d: Float32Array) => Math.sqrt(d.reduce((s, v) => s + v * v, 0) / d.length);
/** となりの値との似かたの平均（低い音が多いほど、1に近い） */
const smoothness = (d: Float32Array) => {
  let num = 0;
  let den = 0;
  for (let i = 1; i < d.length; i++) {
    num += d[i]! * d[i - 1]!;
    den += d[i]! * d[i]!;
  }
  return num / den;
};

describe('ノイズの素材', () => {
  const ctx = fakeCtx(8000);
  const of = (c: NoiseColor) => noiseOf(ctx, c).getChannelData(0);

  it('くり返しの模様が聞こえないよう、4秒ある。同じ色なら、いつも同じ素材（作り直さない）', () => {
    expect(of('white').length).toBe(8000 * 4);
    expect(noiseOf(ctx, 'pink')).toBe(noiseOf(ctx, 'pink'));
  });

  it('どの色も、white と同じくらいの大きさ', () => {
    const w = rms(of('white'));
    for (const c of ['pink', 'brown'] as const) expect(Math.abs(rms(of(c)) / w - 1)).toBeLessThan(0.02);
  });

  it('white より pink、pink より brown のほうが、低い音が多い（なめらか）', () => {
    const [w, p, b] = (['white', 'pink', 'brown'] as const).map((c) => smoothness(of(c)));
    expect(Math.abs(w!)).toBeLessThan(0.05);
    expect(p!).toBeGreaterThan(w! + 0.2);
    expect(b!).toBeGreaterThan(p!);
    expect(b!).toBeGreaterThan(0.95);
  });

  it('white のはじめの1秒は、前の素材と同じ（ほかの効果音の聞こえ方は変わらない）', () => {
    const d = of('white');
    let x = 12345;
    for (let i = 0; i < 100; i++) {
      x = (x * 1664525 + 1013904223) >>> 0;
      expect(d[i]).toBeCloseTo((x / 0xffffffff) * 2 - 1, 6);
    }
  });
});
