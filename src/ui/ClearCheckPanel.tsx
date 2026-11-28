// 管理画面の「クリア率を測る」（2026-11-29。docs/admin-clear-check.md）。
// ダンジョンの設定を変えたあと、公開する前に、自動プレイで公開版と下書きのクリア率をくらべる。重いので Web Worker で動かす。

import { useEffect, useRef, useState } from 'react';
import { mark, TARGET_RATE, TRAIT_NAMES, TRAITS } from '../game/balanceReport';
import { average, CHECK_TRIALS, checkWarnings, type ClearCheck } from '../game/clearCheck';
import type { CheckReply, CheckRequest } from '../game/clearCheck.worker';
import type { DungeonFile } from '../game/genMaster';

/** 測った結果と、そのときの下書き（下書きが変わったら「測り直す」と出す） */
export type CheckRecord = { draftKey: string; result: ClearCheck };

/** 下書きを比べるための文字列 */
export const draftKey = (d: DungeonFile): string => JSON.stringify(d);

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function ClearCheckPanel(props: { id: string; name: string; published: DungeonFile | null; draft: DungeonFile; record: CheckRecord | undefined; onDone: (r: CheckRecord) => void }) {
  const { id, name, published, draft, record, onDone } = props;
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);
  const key = draftKey(draft);
  const stale = record !== undefined && record.draftKey !== key;
  const changed = published === null || draftKey(published) !== key;

  // 画面を離れたら、測っている途中でもやめる
  useEffect(() => () => worker.current?.terminate(), []);
  // ほかのダンジョンに切り替えたら、測っている途中のものはやめる
  useEffect(() => {
    worker.current?.terminate();
    worker.current = null;
    setProgress(null);
    setError(null);
  }, [id]);

  const start = () => {
    worker.current?.terminate();
    setError(null);
    setProgress({ done: 0, total: published ? 10 : 5 });
    const w = new Worker(new URL('../game/clearCheck.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    w.onmessage = (e: MessageEvent<CheckReply>) => {
      const m = e.data;
      if (m.kind === 'step') setProgress({ done: m.done, total: m.total });
      else {
        w.terminate();
        worker.current = null;
        setProgress(null);
        if (m.kind === 'done') onDone({ draftKey: key, result: m.result });
        else setError(m.message);
      }
    };
    w.onerror = (e) => {
      w.terminate();
      worker.current = null;
      setProgress(null);
      setError(e.message || '測れませんでした');
    };
    const req: CheckRequest = { id, published: changed ? published : null, draft, trials: CHECK_TRIALS };
    w.postMessage(req);
  };
  const stop = () => {
    worker.current?.terminate();
    worker.current = null;
    setProgress(null);
  };

  const result = record?.result;
  const warnings = result ? checkWarnings(result, TRAIT_NAMES) : [];
  return (
    <section className="admin__section clear-check" aria-labelledby="clear-check">
      <h2 id="clear-check" className="admin__heading">
        クリア率を測る（{name}）
      </h2>
      <p className="admin__note">
        自動プレイに、正しい準備（その属性に効く防具と武器＋回復薬・食料）で、属性ごとに{CHECK_TRIALS}回ずつ遊ばせます。目標は {pct(TARGET_RATE)} 前後。{changed ? '公開版と、いま変えている設定をくらべます。' : 'まだ変えていないので、公開版だけを測ります。'}30秒〜1分ほどかかります（回数が少ないので、±10ポイントほどぶれます）。
        敵・品物・残響・状態異常のタブで変えたものは、ここでは測れません（公開したあと <code>npm run balance:report</code>）。
      </p>
      <div className="clear-check__actions">
        {progress ? (
          <>
            <progress max={progress.total} value={progress.done} aria-label="測っている途中" />
            <span className="admin__note">
              {progress.done}/{progress.total}
            </span>
            <button type="button" className="explore__wait" onClick={stop}>
              やめる
            </button>
          </>
        ) : (
          <button type="button" className="primary" onClick={start}>
            {result ? '測り直す' : 'クリア率を測る'}
          </button>
        )}
      </div>
      {error && <p className="clear-check__error">測れませんでした：{error}</p>}
      {result && (
        <>
          {stale && <p className="admin__note clear-check__stale">測ったあとに設定を変えました。もう一度測ると、今の設定の数字になります。</p>}
          <div className="clear-check__table-wrap">
            <table className="clear-check__table">
              <thead>
                <tr>
                  <th scope="col"></th>
                  {TRAITS.map((t) => (
                    <th key={t} scope="col">
                      {TRAIT_NAMES[t]}
                    </th>
                  ))}
                  <th scope="col">平均</th>
                  <th scope="col">目標との差</th>
                </tr>
              </thead>
              <tbody>
                {result.before && <Row label="公開版" rates={result.before} />}
                <Row label={result.before ? '変えたあと' : '公開版'} rates={result.after} strong />
              </tbody>
            </table>
          </div>
          {warnings.length > 0 ? (
            <ul className="clear-check__warnings" role="alert">
              {warnings.map((w) => (
                <li key={w}>⚠ {w}</li>
              ))}
            </ul>
          ) : (
            <p className="admin__note clear-check__ok">目立った問題はありません（◎：目標±10ポイント、○：±20ポイント）。</p>
          )}
        </>
      )}
    </section>
  );
}

function Row({ label, rates, strong }: { label: string; rates: ClearCheck['after']; strong?: boolean }) {
  const avg = average(rates);
  return (
    <tr className={strong ? 'clear-check__row--main' : undefined}>
      <th scope="row">{label}</th>
      {TRAITS.map((t) => (
        <td key={t}>{pct(rates[t])}</td>
      ))}
      <td>
        <b>{pct(avg)}</b>
      </td>
      <td>{mark(avg)}</td>
    </tr>
  );
}

/** 公開の欄の上に出す、測った結果の気を付けること（変えたダンジョンごと）と、まだ測っていないダンジョンの案内 */
export function ClearCheckSummary({ changed, records }: { changed: { id: string; name: string; draft: DungeonFile }[]; records: Record<string, CheckRecord> }) {
  if (changed.length === 0) return null;
  const items = changed.map(({ id, name, draft }) => {
    const r = records[id];
    if (!r || r.draftKey !== draftKey(draft)) return { id, name, text: 'まだクリア率を測っていません（ダンジョンのタブの下の「クリア率を測る」）', warn: false };
    const w = checkWarnings(r.result, TRAIT_NAMES);
    return { id, name, text: w.length ? w.join('。') : `クリア率 ${pct(average(r.result.after))}。目立った問題はありません`, warn: w.length > 0 };
  });
  return (
    <section className="admin__section clear-check-summary" aria-label="クリア率の見込み">
      <h2 className="admin__heading">クリア率の見込み</h2>
      <ul>
        {items.map((i) => (
          <li key={i.id} className={i.warn ? 'clear-check-summary__warn' : undefined}>
            <b>{i.name}</b>：{i.warn ? '⚠ ' : ''}
            {i.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
