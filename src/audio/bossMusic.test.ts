// ボス戦の音楽の中身（src/audio/bossMusic.ts）：何をいつ鳴らすか
import { describe, expect, it } from 'vitest';
import { BOSS_TEMPO, LOOP_BARS, STEP_SECONDS, STEPS_PER_BAR, bossStep, semitones, type BossHit } from './bossMusic';

const all = (): BossHit[][] => Array.from({ length: LOOP_BARS * STEPS_PER_BAR }, (_, i) => bossStep(Math.floor(i / STEPS_PER_BAR), i % STEPS_PER_BAR));
const count = (kind: BossHit['kind']) => all().flat().filter((h) => h.kind === kind).length;

describe('ボス戦の音楽', () => {
  it('テンポ138で、16分音符1つは約0.109秒。8小節で約13.9秒', () => {
    expect(BOSS_TEMPO).toBe(138);
    expect(STEP_SECONDS).toBeCloseTo(0.1087, 3);
    expect(STEP_SECONDS * STEPS_PER_BAR * LOOP_BARS).toBeCloseTo(13.91, 1);
  });

  it('各小節の頭にキックとベースと刺す音、2拍目と4拍目にスネア', () => {
    for (let bar = 0; bar < LOOP_BARS; bar++) {
      const head = bossStep(bar, 0).map((h) => h.kind);
      for (const k of ['kick', 'bass', 'stab']) expect(head).toContain(k);
      expect(bossStep(bar, 4).map((h) => h.kind)).toContain('snare');
      expect(bossStep(bar, 12).map((h) => h.kind)).toContain('snare');
    }
    expect(count('snare')).toBe(LOOP_BARS * 2);
  });

  it('ベースのルートは2小節ごとに変わる：Am → F → G → E（A1=55Hz）', () => {
    const rootAt = (bar: number) => (bossStep(bar, 0).find((h) => h.kind === 'bass') as { freq: number }).freq;
    expect([0, 2, 4, 6].map(rootAt).map((f) => Math.round(f * 10) / 10)).toEqual([55, 43.7, 49, 41.2]);
    expect(rootAt(1)).toBe(rootAt(0));
  });

  it('コードの刺す音は3つの音。Am は短3和音（A・C・E）', () => {
    const stab = bossStep(0, 0).find((h) => h.kind === 'stab') as { freqs: number[] };
    expect(stab.freqs).toHaveLength(3);
    expect(stab.freqs[1]! / stab.freqs[0]!).toBeCloseTo(2 ** (3 / 12), 5);
    expect(semitones(220, 12)).toBeCloseTo(440, 5);
  });

  it('ループは同じ小節番号に戻る（8小節ごと）', () => {
    expect(bossStep(8, 0)).toEqual(bossStep(0, 0));
    expect(bossStep(-8, 5)).toEqual(bossStep(0, 5));
  });
});
