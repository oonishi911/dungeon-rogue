// 管理画面の「状態異常」タブ：毒・鈍足・空腹の、かかる確率と長さを変える（src/game/statuses.json。設計は docs/status-spec.md）。
// どの敵が状態異常を与えるかは「敵」タブの「個性」欄（毒・鈍足・空腹）。万能薬の値段は「品物」タブ。

import type { Dispatch, SetStateAction } from 'react';
import { STATUS_IDS, STATUS_LABELS, STATUS_LIMITS, STATUS_TEXTS, type StatusMaster } from '../game/statusMaster';
import { NumberField } from './adminParts';

interface StatusPanelProps {
  base: StatusMaster;
  draft: StatusMaster;
  setDraft: Dispatch<SetStateAction<StatusMaster>>;
}

type Column = { key: string; label: string; unit: string; range: { min: number; max: number } };

/** 状態異常ごとの、数字の欄（確率のほかに、毒はターン数とダメージ、鈍足は歩数、空腹は減る満腹度） */
const COLUMNS: Record<(typeof STATUS_IDS)[number], Column[]> = {
  poison: [
    { key: 'turns', label: 'ターン数', unit: 'ターン', range: STATUS_LIMITS.turns },
    { key: 'damage', label: '毎ターンのダメージ', unit: '', range: STATUS_LIMITS.damage },
  ],
  chill: [{ key: 'steps', label: '歩数', unit: '歩', range: STATUS_LIMITS.steps }],
  hunger: [{ key: 'amount', label: '減る満腹度', unit: '', range: STATUS_LIMITS.amount }],
};

const valueOf = (m: StatusMaster, id: (typeof STATUS_IDS)[number], key: string): number => (m[id] as Record<string, number>)[key]!;

export function StatusPanel({ base, draft, setDraft }: StatusPanelProps) {
  const set = (id: (typeof STATUS_IDS)[number], key: string, v: number) => setDraft((d) => ({ ...d, [id]: { ...d[id], [key]: v } }));
  return (
    <section className="admin__section" role="tabpanel" id="admin-statuses-panel" aria-labelledby="admin-statuses-tab">
      <h2 className="admin__heading">状態異常</h2>
      <ul className="admin__notelist">
        <li>
          <b>かかるとき</b>：「敵」タブの「個性」で毒・鈍足・空腹を付けた敵の攻撃が当たる（ダメージが入る）と、下の確率でかかります。ボスは今のところ与えません。
        </li>
        <li>
          <b>指輪で変わる</b>：確率には、その敵の攻撃が受けるダメージの倍率（指輪の耐性・弱点）が掛かります。
          <span className="gen__example">例：確率50%で、耐性30%の指輪を付けていれば、35%になります。逆の属性の指輪（弱点）なら、少し上がります。</span>
        </li>
        <li>
          <b>治るとき</b>：毒はターン数、鈍足は歩数が切れると治ります。万能薬（「品物」タブで値段を変えられます）で、毒と鈍足がすべて治ります（回復薬では治りません）。空腹は、当たったときに満腹度が減るだけです。
        </li>
        <li>同じ状態異常にもう一度かかると、残りが下の長さまで延びます（重なって強くはなりません）。ちがう種類は、同時にかかります。</li>
      </ul>

      <div className="admin__scroll">
        <table className="admin__table admin__table--cards">
          <thead>
            <tr>
              <th scope="col">状態異常</th>
              <th scope="col">かかる確率（%）</th>
              <th scope="col">長さ・大きさ</th>
              <th scope="col">働き</th>
            </tr>
          </thead>
          <tbody>
            {STATUS_IDS.map((id) => (
              <tr key={id}>
                <th scope="row">{STATUS_LABELS[id]}</th>
                <td data-label="かかる確率（%）" className="admin__c2">
                  <NumberField
                    value={draft[id].chance}
                    min={STATUS_LIMITS.chance.min}
                    max={STATUS_LIMITS.chance.max}
                    changed={draft[id].chance !== base[id].chance}
                    base={base[id].chance}
                    label={`${STATUS_LABELS[id]}のかかる確率（%）`}
                    onChange={(v) => set(id, 'chance', v)}
                  />
                </td>
                <td data-label="長さ・大きさ" className="admin__c2">
                  {COLUMNS[id].map((c) => (
                    <label key={c.key} className="admin__inline">
                      <span className="muted">{c.label}</span>
                      <NumberField
                        value={valueOf(draft, id, c.key)}
                        min={c.range.min}
                        max={c.range.max}
                        changed={valueOf(draft, id, c.key) !== valueOf(base, id, c.key)}
                        base={valueOf(base, id, c.key)}
                        label={`${STATUS_LABELS[id]}の${c.label}`}
                        onChange={(v) => set(id, c.key, v)}
                      />
                    </label>
                  ))}
                </td>
                <td data-label="働き">{STATUS_TEXTS[id](draft)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
