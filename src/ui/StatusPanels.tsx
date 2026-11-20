// 管理画面の「状態異常」タブ：毒・鈍足・空腹の、かかる確率と長さを変える。敵にかける燃焼・凍結とコンボの数字も（src/game/statuses.json。設計は docs/status-spec.md・docs/combat-fun-spec.md）。
// どの敵が状態異常を与えるかは「敵」タブの「個性」欄（毒・鈍足・空腹）。万能薬の値段は「品物」タブ。

import type { Dispatch, SetStateAction } from 'react';
import { STATUS_IDS, STATUS_LABELS, STATUS_LIMITS, STATUS_TEXTS, type FoeMaster, type StatusMaster } from '../game/statusMaster';
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

      <FoeSection base={base.foe} draft={draft.foe} setDraft={setDraft} />
    </section>
  );
}

type FoeField = { id: string; label: string; unit: string; range: { min: number; max: number }; get: (f: FoeMaster) => number; set: (f: FoeMaster, v: number) => FoeMaster };

const FOE_FIELDS: FoeField[] = [
  { id: 'burnChance', label: '燃焼：砥石でかかる確率', unit: '%', range: STATUS_LIMITS.chance, get: (f) => f.burn.chance, set: (f, v) => ({ ...f, burn: { ...f.burn, chance: v } }) },
  { id: 'burnTurns', label: '燃焼：ターン数', unit: 'ターン', range: STATUS_LIMITS.turns, get: (f) => f.burn.turns, set: (f, v) => ({ ...f, burn: { ...f.burn, turns: v } }) },
  { id: 'burnDamage', label: '燃焼：毎ターンのダメージ', unit: '', range: STATUS_LIMITS.damage, get: (f) => f.burn.damage, set: (f, v) => ({ ...f, burn: { ...f.burn, damage: v } }) },
  { id: 'freezeChance', label: '凍結：砥石でかかる確率', unit: '%', range: STATUS_LIMITS.chance, get: (f) => f.freeze.chance, set: (f, v) => ({ ...f, freeze: { ...f.freeze, chance: v } }) },
  { id: 'freezeTurns', label: '凍結：動けないターン数', unit: 'ターン', range: STATUS_LIMITS.turns, get: (f) => f.freeze.turns, set: (f, v) => ({ ...f, freeze: { ...f.freeze, turns: v } }) },
  { id: 'weakBonus', label: '弱点の属性で延びるターン数', unit: 'ターン', range: STATUS_LIMITS.weakBonus, get: (f) => f.weakBonus, set: (f, v) => ({ ...f, weakBonus: v }) },
  { id: 'smash', label: 'ハンマー×凍結（砕く）の倍率', unit: '%', range: STATUS_LIMITS.percent, get: (f) => f.smashPercent, set: (f, v) => ({ ...f, smashPercent: v }) },
  { id: 'spell', label: '杖の呪文×燃焼・凍結の倍率', unit: '%', range: STATUS_LIMITS.percent, get: (f) => f.spellPercent, set: (f, v) => ({ ...f, spellPercent: v }) },
];

/** 敵にかける状態異常（燃焼・凍結）と、コンボの数字 */
function FoeSection({ base, draft, setDraft }: { base: FoeMaster; draft: FoeMaster; setDraft: Dispatch<SetStateAction<StatusMaster>> }) {
  return (
    <>
      <h2 className="admin__heading">敵にかける状態異常（燃焼・凍結）とコンボ</h2>
      <ul className="admin__notelist">
        <li>
          <b>かかるとき</b>：炎の矢・炎の連矢は敵を燃やし、氷の矢・氷の連矢は敵を凍らせます（呪文は必ずかかります）。炎の砥石・氷の砥石で殴ったときは、下の確率でかかります。
        </li>
        <li>
          <b>かからない敵</b>：炎の敵は燃えません。氷の敵とボスは凍りません。弱点の属性（炎→氷の敵、氷→炎の敵）なら、ターンが「弱点で延びるターン数」だけ延びます。
        </li>
        <li>
          <b>蒸気</b>：燃えている敵に氷、凍っている敵に炎が当たると、蒸気になって、どちらも消えます（新しくもかかりません）。
        </li>
        <li>
          <b>コンボ</b>：ハンマーで凍った敵を殴ると「砕く」（ダメージが倍率になり、凍結が解ける）。剣で燃えている敵を斬ると「焼き斬り」（残りの燃焼ダメージを一度に与え、火が消える）。杖で唱えた呪文は、燃えている・凍っている敵に当てると倍率になります。
          <span className="gen__example">例：砕くの倍率が200%なら、凍った敵へのハンマーのダメージは2倍です。</span>
        </li>
      </ul>
      <div className="admin__scroll">
        <table className="admin__table admin__table--cards">
          <thead>
            <tr>
              <th scope="col">項目</th>
              <th scope="col">値</th>
            </tr>
          </thead>
          <tbody>
            {FOE_FIELDS.map((f) => (
              <tr key={f.id}>
                <th scope="row">{f.label}</th>
                <td data-label="値" className="admin__c2">
                  <label className="admin__inline">
                    <NumberField
                      value={f.get(draft)}
                      min={f.range.min}
                      max={f.range.max}
                      changed={f.get(draft) !== f.get(base)}
                      base={f.get(base)}
                      label={f.label}
                      onChange={(v) => setDraft((d) => ({ ...d, foe: f.set(d.foe, v) }))}
                    />
                    <span className="muted">{f.unit}</span>
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
