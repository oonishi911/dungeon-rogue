// バランスの記録（2026-11-28、docs/balance/README.md）。
// 自動プレイ（autoplay.ts）で、ダンジョンごと・属性ごとのクリア率を測り、記録（履歴）とグラフ（SVG）と表（Markdown）にする。
// 測る条件：正しい準備の装備（balance.fixtures.ts の PREPS.right）＋回復薬・食料（SUPPLIES）。属性ごとに trials 回ずつ、同じシードの並びで遊ばせる。
// 測りに行くのは scripts/balance-report.ts（npm run balance:report）。ここは、測る関数と、記録を整える純粋な関数だけ（ファイルは触らない）。

import { clearRate } from './autoplay';
import { PREPS, SUPPLIES } from './balance.fixtures';
import { DUNGEON_IDS, dungeonOf } from './dungeons';
import type { TraitId } from './types';

export const TRAITS: readonly TraitId[] = ['fire', 'ice', 'neutral', 'light', 'dark'];
export const TRAIT_NAMES: Record<TraitId, string> = { fire: '炎', ice: '氷', neutral: '無', light: '光', dark: '闇' };
/** 目標のクリア率（正しい準備で、このあたりに合わせる） */
export const TARGET_RATE = 0.6;

export interface ClearRow {
  dungeon: string; // ダンジョンの ID
  name: string; // ダンジョンの名前
  rates: Record<TraitId, number>; // 属性ごとのクリア率（0〜1）
  avg: number; // 5つの属性の平均
}

export interface BalanceSnapshot {
  date: string; // 測った日（YYYY-MM-DD）
  label: string; // 何を変えたあとか（「敵の強さを0.39倍にした」など）
  trials: number; // 属性ごとに遊ばせた回数
  rows: ClearRow[];
}

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** ダンジョンごとのクリア率を測る（時間がかかる。dungeons を省くと、すべてのダンジョン） */
export function measureSnapshot(opts: { date: string; label: string; trials: number; dungeons?: readonly string[] }): BalanceSnapshot {
  const ids = opts.dungeons ?? DUNGEON_IDS;
  const rows = ids.map((dungeon): ClearRow => {
    const rates = Object.fromEntries(TRAITS.map((t) => [t, clearRate([...PREPS[t].right, ...SUPPLIES], t, opts.trials, { dungeon })])) as Record<TraitId, number>;
    return { dungeon, name: dungeonOf(dungeon).name, rates, avg: mean(TRAITS.map((t) => rates[t])) };
  });
  return { date: opts.date, label: opts.label, trials: opts.trials, rows };
}

/** 保存した履歴を読む。壊れていたら、読める分だけ（なければ空） */
export function parseHistory(text: string | null): BalanceSnapshot[] {
  if (!text) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const rate = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
  const out: BalanceSnapshot[] = [];
  for (const s of raw) {
    if (typeof s !== 'object' || s === null) continue;
    const o = s as Record<string, unknown>;
    if (typeof o.date !== 'string' || typeof o.label !== 'string' || typeof o.trials !== 'number' || !Array.isArray(o.rows)) continue;
    const rows: ClearRow[] = [];
    for (const r of o.rows) {
      const q = r as Record<string, unknown> | null;
      const rates = q?.rates as Record<string, unknown> | undefined;
      if (!q || typeof q.dungeon !== 'string' || typeof q.name !== 'string' || !rates || !TRAITS.every((t) => rate(rates[t]))) continue;
      const rs = Object.fromEntries(TRAITS.map((t) => [t, rates[t] as number])) as Record<TraitId, number>;
      rows.push({ dungeon: q.dungeon, name: q.name, rates: rs, avg: mean(TRAITS.map((t) => rs[t])) });
    }
    out.push({ date: o.date, label: o.label, trials: o.trials, rows });
  }
  return out;
}

/** 履歴に足す（同じ日・同じ名前の記録があれば、置きかえる） */
export function addSnapshot(history: readonly BalanceSnapshot[], snap: BalanceSnapshot): BalanceSnapshot[] {
  return [...history.filter((h) => !(h.date === snap.date && h.label === snap.label)), snap];
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;

/** 目標との差の印（目標±10ポイントは「◎」、±20ポイントは「○」、それ以外は「△」） */
export function mark(avg: number): string {
  const gap = Math.abs(avg - TARGET_RATE);
  return gap <= 0.1 ? '◎' : gap <= 0.2 ? '○' : '△';
}

/** 記録の文書（Markdown）：いちばん新しい測定の表と、これまでの平均の移り変わり */
export function reportMarkdown(history: readonly BalanceSnapshot[]): string {
  const latest = history[history.length - 1];
  const lines: string[] = ['# バランスの記録', '', `自動プレイ（正しい準備の装備＋回復薬・食料）で測った、ダンジョンごとのクリア率。目標は ${pct(TARGET_RATE)} 前後。測り方と再実行の方法は [README](./README.md)。`, ''];
  if (!latest) return [...lines, 'まだ記録がありません。`npm run balance:report` で測ります。', ''].join('\n');
  lines.push(`## いちばん新しい測定（${latest.date}・${latest.label}・属性ごとに${latest.trials}回）`, '', '![ダンジョンごとのクリア率](./clear-rate.svg)', '');
  lines.push(`| ダンジョン | ${TRAITS.map((t) => TRAIT_NAMES[t]).join(' | ')} | 平均 | 目標との差 |`, `| --- | ${TRAITS.map(() => '---:').join(' | ')} | ---: | :---: |`);
  for (const r of latest.rows) lines.push(`| ${r.name} | ${TRAITS.map((t) => pct(r.rates[t])).join(' | ')} | **${pct(r.avg)}** | ${mark(r.avg)} |`);
  lines.push('', '◎：目標±10ポイント以内　○：±20ポイント以内　△：それより外れている', '');
  const names = [...new Map(history.flatMap((h) => h.rows.map((r) => [r.dungeon, r.name] as const))).entries()];
  lines.push('## これまでの移り変わり（5つの属性の平均）', '', `| 日 | 変えたこと | 回数 | ${names.map(([, n]) => n).join(' | ')} |`, `| --- | --- | ---: | ${names.map(() => '---:').join(' | ')} |`);
  for (const h of history) lines.push(`| ${h.date} | ${h.label} | ${h.trials} | ${names.map(([id]) => { const r = h.rows.find((x) => x.dungeon === id); return r ? pct(r.avg) : '－'; }).join(' | ')} |`);
  lines.push('');
  return lines.join('\n');
}

const TRAIT_COLORS: Record<TraitId, string> = { fire: '#d9593a', ice: '#4a9ad8', neutral: '#8c867c', light: '#d4b43a', dark: '#6f55a0' };

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** ダンジョンごと・属性ごとの棒グラフ（SVG）。目標の線つき。白い背景を敷くので、明るい画面でも暗い画面でも読める */
export function chartSvg(snap: BalanceSnapshot): string {
  const W = 760;
  const H = 380;
  const left = 52;
  const right = 16;
  const top = 44;
  const bottom = 62;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const groupW = plotW / Math.max(1, snap.rows.length);
  const barW = Math.min(30, (groupW - 24) / TRAITS.length);
  const y = (v: number): number => top + plotH * (1 - v);
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="ダンジョンごと・属性ごとのクリア率（${esc(snap.date)}）" font-family="system-ui, 'Hiragino Sans', 'Noto Sans JP', sans-serif">`,
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
    `<text x="${left}" y="24" font-size="15" font-weight="700" fill="#1d2b29">クリア率（正しい準備・属性ごと${snap.trials}回）　${esc(snap.date)}</text>`,
  ];
  for (const g of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    out.push(`<line x1="${left}" y1="${y(g)}" x2="${W - right}" y2="${y(g)}" stroke="#e2e6e4"/>`, `<text x="${left - 8}" y="${y(g) + 4}" font-size="11" text-anchor="end" fill="#5b6866">${pct(g)}</text>`);
  }
  snap.rows.forEach((row, gi) => {
    const gx = left + gi * groupW + (groupW - barW * TRAITS.length) / 2;
    TRAITS.forEach((t, i) => {
      const v = row.rates[t];
      const x = gx + i * barW;
      const h = Math.max(0, plotH * v);
      out.push(`<rect x="${x + 2}" y="${y(v)}" width="${barW - 4}" height="${h}" fill="${TRAIT_COLORS[t]}"><title>${esc(row.name)}・${TRAIT_NAMES[t]}：${pct(v)}</title></rect>`);
      out.push(`<text x="${x + barW / 2}" y="${y(v) - 4}" font-size="10" text-anchor="middle" fill="#33403e">${Math.round(v * 100)}</text>`);
      out.push(`<text x="${x + barW / 2}" y="${top + plotH + 14}" font-size="10" text-anchor="middle" fill="#5b6866">${TRAIT_NAMES[t]}</text>`);
    });
    out.push(`<text x="${gx + (barW * TRAITS.length) / 2}" y="${top + plotH + 34}" font-size="12" font-weight="700" text-anchor="middle" fill="#1d2b29">${esc(row.name)}（平均${pct(row.avg)}）</text>`);
  });
  out.push(
    `<line x1="${left}" y1="${y(TARGET_RATE)}" x2="${W - right}" y2="${y(TARGET_RATE)}" stroke="#c0392b" stroke-width="1.5" stroke-dasharray="6 4"/>`,
    `<text x="${W - right}" y="${y(TARGET_RATE) - 5}" font-size="11" text-anchor="end" fill="#c0392b">目標 ${pct(TARGET_RATE)}</text>`,
    `</svg>`,
  );
  return out.join('\n') + '\n';
}
