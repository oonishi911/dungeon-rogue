// バランスの記録を測り直して、docs/balance/ を更新する（npm run balance:report）。
//   BALANCE_LABEL="敵の強さを0.39倍にした" npm run balance:report
//   ほかの指定（環境変数）：BALANCE_TRIALS=80（属性ごとの回数）・BALANCE_DUNGEONS=standard,a_1（測るダンジョン）・BALANCE_DATE=2026-11-28・BALANCE_DRY=1（書かずに表だけ出す）
//   コマンドの引数でも指定できる：vite-node scripts/balance-report.ts -- --label "…" --trials 80 --dry
// 自動プレイを属性ごとに trials 回ずつ遊ぶので、時間がかかる（ダンジョン1つにつき、数十秒から数分）。
// docs/balance/history.json（履歴）に足し、report.md（表）と clear-rate.svg（グラフ）を作り直す。dry（BALANCE_DRY=1）なら、書かずに表だけ出す。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { addSnapshot, chartSvg, measureSnapshot, parseHistory, reportMarkdown } from '../src/game/balanceReport';

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : process.env[`BALANCE_${name.toUpperCase()}`];
};
const dry = args.includes('--dry') || Boolean(process.env.BALANCE_DRY);
const label = opt('label');
if (!label) {
  console.error('BALANCE_LABEL（何を変えたあとか）を付けてください。例：BALANCE_LABEL="敵の強さを0.39倍にした" npm run balance:report');
  process.exit(1);
}
const trials = Number(opt('trials') ?? 80);
if (!Number.isInteger(trials) || trials < 1) {
  console.error('BALANCE_TRIALS は1以上の整数にしてください');
  process.exit(1);
}
const date = opt('date') ?? new Date().toISOString().slice(0, 10);
const dungeons = opt('dungeons')?.split(',').filter(Boolean);
const dir = new URL('../docs/balance/', import.meta.url);
const file = (name: string) => new URL(name, dir);

let text: string | null = null;
try {
  text = readFileSync(file('history.json'), 'utf8');
} catch {
  // まだ履歴がない
}
const snap = measureSnapshot({ date, label, trials, ...(dungeons ? { dungeons } : {}) });
const history = addSnapshot(parseHistory(text), snap);
const report = reportMarkdown(history);
if (dry) {
  console.log(report);
} else {
  mkdirSync(dir, { recursive: true });
  writeFileSync(file('history.json'), JSON.stringify(history, null, 2) + '\n');
  writeFileSync(file('report.md'), report);
  writeFileSync(file('clear-rate.svg'), chartSvg(snap));
  console.log(report);
  console.log('docs/balance/ を更新しました');
}
