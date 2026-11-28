// バランスの記録（src/game/balanceReport.ts）：測定・履歴・表・グラフ
import { describe, expect, it } from 'vitest';
import { addSnapshot, chartSvg, mark, measureSnapshot, parseHistory, reportMarkdown, TARGET_RATE, TRAITS, type BalanceSnapshot, type ClearRow } from './balanceReport';
import type { TraitId } from './types';

const row = (dungeon: string, name: string, v: number): ClearRow => ({ dungeon, name, rates: Object.fromEntries(TRAITS.map((t) => [t, v])) as Record<TraitId, number>, avg: v });
const snap = (date: string, label: string, v: number): BalanceSnapshot => ({ date, label, trials: 80, rows: [row('standard', '最初の祠', v), row('a_2', '深い祠', v / 2)] });

describe('測る', () => {
  it('ダンジョンごと・属性ごとのクリア率を返す（同じ条件なら、同じ結果）', () => {
    const a = measureSnapshot({ date: '2026-11-28', label: 'テスト', trials: 2, dungeons: ['standard'] });
    const b = measureSnapshot({ date: '2026-11-28', label: 'テスト', trials: 2, dungeons: ['standard'] });
    expect(a).toEqual(b);
    expect(a.rows).toHaveLength(1);
    const r = a.rows[0]!;
    expect(r.dungeon).toBe('standard');
    for (const t of TRAITS) expect([0, 0.5, 1]).toContain(r.rates[t]); // 2回ずつなので、0・50%・100%のどれか
    expect(r.avg).toBeCloseTo(TRAITS.reduce((s, t) => s + r.rates[t], 0) / TRAITS.length);
  });
});

describe('履歴', () => {
  it('保存した形から読み直せる。壊れた行・壊れた全体は、読める分だけにする', () => {
    const h = [snap('2026-11-27', '前', 0.1), snap('2026-11-28', '後', 0.6)];
    expect(parseHistory(JSON.stringify(h))).toEqual(h.map((s) => ({ ...s, rows: s.rows.map((r) => ({ ...r })) })));
    expect(parseHistory(null)).toEqual([]);
    expect(parseHistory('not json')).toEqual([]);
    expect(parseHistory('{}')).toEqual([]);
    const broken = JSON.stringify([h[0], { date: 1 }, { ...h[1], rows: [{ dungeon: 'x', name: 'x', rates: { fire: 2 } }, h[1]!.rows[0]] }]);
    const read = parseHistory(broken);
    expect(read).toHaveLength(2);
    expect(read[1]!.rows).toHaveLength(1); // 率が1を超える行は捨てる
  });

  it('同じ日・同じ名前の記録は置きかえ、違えば足す', () => {
    const a = snap('2026-11-28', '調整', 0.3);
    const h = addSnapshot([snap('2026-11-27', '前', 0.1)], a);
    expect(h).toHaveLength(2);
    const again = addSnapshot(h, snap('2026-11-28', '調整', 0.5));
    expect(again).toHaveLength(2);
    expect(again[1]!.rows[0]!.avg).toBe(0.5);
    expect(addSnapshot(again, snap('2026-11-28', '別の調整', 0.6))).toHaveLength(3);
  });
});

describe('表とグラフ', () => {
  it('目標との差の印', () => {
    expect(mark(TARGET_RATE)).toBe('◎');
    expect(mark(TARGET_RATE + 0.08)).toBe('◎');
    expect(mark(TARGET_RATE - 0.15)).toBe('○');
    expect(mark(0)).toBe('△');
  });

  it('表：いちばん新しい測定と、移り変わり。記録がなければ、測り方を案内する', () => {
    const md = reportMarkdown([snap('2026-11-27', '前', 0), snap('2026-11-28', '後', 0.7)]);
    expect(md).toContain('いちばん新しい測定（2026-11-28・後・属性ごとに80回）');
    expect(md).toContain('| 最初の祠 | 70% | 70% | 70% | 70% | 70% | **70%** | ◎ |');
    expect(md).toContain('| 深い祠 | 35% |');
    expect(md).toContain('| 2026-11-27 | 前 | 80 | 0% | 0% |');
    expect(md).toContain('| 2026-11-28 | 後 | 80 | 70% | 35% |');
    expect(reportMarkdown([])).toContain('まだ記録がありません');
  });

  it('グラフ：棒と目標の線と名前が入った SVG になる', () => {
    const svg = chartSvg(snap('2026-11-28', '後', 0.7));
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('最初の祠（平均70%）');
    expect(svg).toContain('目標 70%');
    expect(svg.match(/<rect /g)!.length).toBe(1 + 2 * TRAITS.length); // 背景＋棒
    expect(svg).not.toContain('NaN');
  });
});
