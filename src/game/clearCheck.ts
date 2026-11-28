// 管理画面の「クリア率を測る」（2026-11-29。docs/admin-clear-check.md）。
// 公開する前に、画面で変えているダンジョンの設定（下書き）で自動プレイを遊ばせ、公開版とくらべたクリア率を出す。
// 重いので、画面ではこの関数を Web Worker（clearCheck.worker.ts）で動かす。測れるのはダンジョンの設定だけ
// （敵・品物・残響・状態異常の下書きは、遊ぶときの表がゲームの始まりに作られるので、ここでは入らない）。

import { clearRate } from './autoplay';
import { PREPS, SUPPLIES } from './balance.fixtures';
import { TARGET_RATE, TRAITS } from './balanceReport';
import { DUNGEONS, hasDungeon } from './dungeons';
import type { DungeonFile } from './genMaster';
import type { TraitId } from './types';

/** 属性ごとに遊ばせる回数（多いほど正確だが遅い。20回だと±10ポイントほどぶれる） */
export const CHECK_TRIALS = 20;

export type TraitRates = Record<TraitId, number>;

/** 測った結果。before は公開版（新しく作るダンジョンでは null）、after は下書き */
export interface ClearCheck {
  trials: number;
  before: TraitRates | null;
  after: TraitRates;
}

export const average = (r: TraitRates): number => TRAITS.reduce((a, t) => a + r[t], 0) / TRAITS.length;

/**
 * このダンジョンの設定を settings に差し替えて fn を動かし、終わったら元に戻す（ない ID なら、そのあいだだけ足す）。
 * 遊ぶ処理は dungeonOf(id) で設定を引くので、差し替えれば、下書きの設定で遊ぶことになる
 */
export function withDungeon<T>(id: string, settings: DungeonFile, fn: () => T): T {
  const table = DUNGEONS as Record<string, DungeonFile>;
  const had = hasDungeon(id);
  const old = table[id];
  table[id] = settings;
  try {
    return fn();
  } finally {
    if (had) table[id] = old!;
    else delete table[id];
  }
}

/** 1つの属性のクリア率（正しい準備＋回復薬・食料。バランスの記録と同じ条件） */
export function traitRate(dungeon: string, trait: TraitId, trials: number): number {
  return clearRate([...PREPS[trait].right, ...SUPPLIES], trait, trials, { dungeon });
}

/** 測る順番（公開版の5属性、下書きの5属性）。画面で「何個中何個目」を出すのに使う */
export function checkSteps(hasBefore: boolean): { side: 'before' | 'after'; trait: TraitId }[] {
  return [...(hasBefore ? TRAITS.map((trait) => ({ side: 'before' as const, trait })) : []), ...TRAITS.map((trait) => ({ side: 'after' as const, trait }))];
}

/**
 * 公開版（published。新しいダンジョンでは null）と下書き（draft）のクリア率を測る。onStep は1つ測るたびに呼ぶ（進み具合）
 */
export function measureCheck(id: string, published: DungeonFile | null, draft: DungeonFile, trials = CHECK_TRIALS, onStep?: (done: number, total: number) => void): ClearCheck {
  const steps = checkSteps(published !== null);
  const out: { before: Partial<TraitRates>; after: Partial<TraitRates> } = { before: {}, after: {} };
  steps.forEach(({ side, trait }, i) => {
    const settings = side === 'before' ? published! : draft;
    out[side][trait] = withDungeon(id, settings, () => traitRate(id, trait, trials));
    onStep?.(i + 1, steps.length);
  });
  return { trials, before: published ? (out.before as TraitRates) : null, after: out.after as TraitRates };
}

/** 気を付けることの目安：平均が目標から20ポイントより外れる・属性が20%を下回る・公開版から20ポイント以上動く */
export const CHECK_LIMITS = { band: 0.2, floor: 0.2, swing: 0.2 } as const;

/** 結果から、公開する前に気を付けることを文で返す（なければ空） */
export function checkWarnings(check: ClearCheck, names: Record<TraitId, string>): string[] {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const avg = average(check.after);
  const out: string[] = [];
  if (avg < TARGET_RATE - CHECK_LIMITS.band) out.push(`平均のクリア率が ${pct(avg)} で、目標（${pct(TARGET_RATE)}前後）よりかなり低い。難しすぎるかもしれない`);
  if (avg > TARGET_RATE + CHECK_LIMITS.band) out.push(`平均のクリア率が ${pct(avg)} で、目標（${pct(TARGET_RATE)}前後）よりかなり高い。やさしすぎるかもしれない`);
  const low = TRAITS.filter((t) => check.after[t] < CHECK_LIMITS.floor);
  if (low.length) out.push(`${low.map((t) => names[t]).join('・')}のダンジョンは、正しい準備でも ${pct(CHECK_LIMITS.floor)} 未満しかクリアできない`);
  if (check.before) {
    const diff = avg - average(check.before);
    if (Math.abs(diff) >= CHECK_LIMITS.swing) out.push(`公開版の ${pct(average(check.before))} から ${pct(avg)} へ、大きく${diff < 0 ? '下がる' : '上がる'}`);
  }
  return out;
}
