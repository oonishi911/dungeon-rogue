// 管理画面の「残響」タブ：刻印武器と残響の落とし方・数字を変える（src/game/echoes.json。設計は docs/echo-spec.md）。
// 指輪の指の数（思い出した記憶で増える）と、二重耐性の指輪の落とし方も、ここで変える（docs/ring-spec.md。指輪そのものの耐性・値段は「品物」タブ）。
// 刻印武器は、買えない。敵がごく稀に落とす（スロットは武器だけ。防具にはない）。スロットにはめるのが残響で、これも敵が落とす。
// 落とす確率・スロット数の割合・落とす武器の段階・残響ごとの効果の数字を、ここで変える。残響の働きそのものは、ここでは変えられない。

import type { Dispatch, SetStateAction } from 'react';
import { ECHO_IDS, ECHO_INFO, ECHO_LIMITS, FOE_RANKS, PULSE_FLOOR, RANK_LABELS, SLOT_KEYS, SLOT_LABELS, echoText, type EchoMaster } from '../game/echoMaster';
import { NumberField, TextField } from './adminParts';

interface EchoPanelProps {
  base: EchoMaster;
  draft: EchoMaster;
  setDraft: Dispatch<SetStateAction<EchoMaster>>;
}

export function EchoPanel({ base, draft, setDraft }: EchoPanelProps) {
  const names = (self: string) => new Set(ECHO_IDS.map((id) => draft.effects[id].name.trim()).filter((n) => n !== self.trim()));
  return (
    <section className="admin__section" role="tabpanel" id="admin-echoes-panel" aria-labelledby="admin-echoes-tab">
      <h2 className="admin__heading">残響</h2>
      <ul className="admin__notelist">
        <li>
          <b>刻印武器</b>：スロットが1〜3個付いた武器です。店では買えず、敵がごく稀に落とします（防具にスロットはありません）。落とした敵に合う種類の武器が出ます。
        </li>
        <li>
          <b>残響</b>：刻印武器のスロットにはめるものです。これも敵が落とします。敵の属性・体質に合う残響が落ちます（炎の敵なら炎の残響、硬い敵なら硬い残響）。
          <span className="gen__example">例：確率が2%なら、通常の敵を50体倒すと、平均で1個落ちます。</span>
        </li>
        <li>
          <b>力尽きても</b>：拾った刻印武器と残響は、倉庫に入ります（失いません）。付け替えは、忘れ物屋の「刻印」の売り場で、何度でも無料です。
        </li>
        <li>
          <b>二重耐性の指輪</b>：2つの属性に同時に耐性が付く指輪です。店では買えず、敵がごく稀に落とします（倒した敵の属性と、もう1つの属性［くじ］の組み合わせ）。力尽きても失いません。
        </li>
        <li>残響の働き（炎の残響は、通常攻撃に炎の力を付ける、など）は、ここでは変えられません。数字だけ変えられます。</li>
      </ul>

      <h3 className="gen__subheading">刻印武器を落とす確率（%）</h3>
      <div className="admin__scroll">
        <table className="admin__table admin__table--cards">
          <thead>
            <tr>
              {FOE_RANKS.map((r) => (
                <th key={r} scope="col">
                  {RANK_LABELS[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {FOE_RANKS.map((r) => (
                <td key={r} data-label={RANK_LABELS[r]} className="admin__c2">
                  <NumberField
                    value={draft.engraved.drop[r]}
                    min={ECHO_LIMITS.rate.min}
                    max={ECHO_LIMITS.rate.max}
                    step={0.1}
                    integer={false}
                    changed={draft.engraved.drop[r] !== base.engraved.drop[r]}
                    base={base.engraved.drop[r]}
                    label={`刻印武器を落とす確率（${RANK_LABELS[r]}）`}
                    onChange={(v) => setDraft((d) => ({ ...d, engraved: { ...d.engraved, drop: { ...d.engraved.drop, [r]: v } } }))}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className="gen__subheading">スロットの数の割合</h3>
      <p className="muted">落とした刻印武器のスロットが、何個になるかの割合です（合計が100でなくても、割合として使います）。</p>
      <div className="admin__scroll">
        <table className="admin__table admin__table--cards">
          <thead>
            <tr>
              {SLOT_KEYS.map((k) => (
                <th key={k} scope="col">
                  {SLOT_LABELS[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {SLOT_KEYS.map((k) => (
                <td key={k} data-label={SLOT_LABELS[k]} className="admin__c2">
                  <NumberField
                    value={draft.engraved.slots[k]}
                    min={ECHO_LIMITS.weight.min}
                    max={ECHO_LIMITS.weight.max}
                    changed={draft.engraved.slots[k] !== base.engraved.slots[k]}
                    base={base.engraved.slots[k]}
                    label={`${SLOT_LABELS[k]}の割合`}
                    onChange={(v) => setDraft((d) => ({ ...d, engraved: { ...d.engraved, slots: { ...d.engraved.slots, [k]: v } } }))}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className="gen__subheading">落とす刻印武器の段階</h3>
      <p className="muted">元の武器の段階（1〜10。店の「剣+1」が2段目）を、この範囲からくじで決めます。強さの差は、スロットで出します。</p>
      <div className="admin__scroll">
        <table className="admin__table admin__table--cards">
          <thead>
            <tr>
              <th scope="col">いちばん低い段階</th>
              <th scope="col">いちばん高い段階</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {(['tierMin', 'tierMax'] as const).map((k) => (
                <td key={k} data-label={k === 'tierMin' ? 'いちばん低い段階' : 'いちばん高い段階'} className="admin__c2">
                  <NumberField
                    value={draft.engraved[k]}
                    min={ECHO_LIMITS.tier.min}
                    max={ECHO_LIMITS.tier.max}
                    error={draft.engraved.tierMin > draft.engraved.tierMax ? '低い段階は、高い段階以下にする' : null}
                    changed={draft.engraved[k] !== base.engraved[k]}
                    base={base.engraved[k]}
                    label={k === 'tierMin' ? '落とす武器の最小の段階' : '落とす武器の最大の段階'}
                    onChange={(v) => setDraft((d) => ({ ...d, engraved: { ...d.engraved, [k]: v } }))}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className="gen__subheading">残響を落とす確率（%）</h3>
      <div className="admin__scroll">
        <table className="admin__table admin__table--cards">
          <thead>
            <tr>
              {FOE_RANKS.map((r) => (
                <th key={r} scope="col">
                  {RANK_LABELS[r]}
                </th>
              ))}
              <th scope="col">ぬくもり・鼓動の割合（%）</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {FOE_RANKS.map((r) => (
                <td key={r} data-label={RANK_LABELS[r]} className="admin__c2">
                  <NumberField
                    value={draft.echo.drop[r]}
                    min={ECHO_LIMITS.rate.min}
                    max={ECHO_LIMITS.rate.max}
                    step={0.1}
                    integer={false}
                    changed={draft.echo.drop[r] !== base.echo.drop[r]}
                    base={base.echo.drop[r]}
                    label={`残響を落とす確率（${RANK_LABELS[r]}）`}
                    onChange={(v) => setDraft((d) => ({ ...d, echo: { ...d.echo, drop: { ...d.echo.drop, [r]: v } } }))}
                  />
                </td>
              ))}
              <td data-label="ぬくもり・鼓動の割合（%）" className="admin__c2">
                <NumberField
                  value={draft.echo.generalShare}
                  min={ECHO_LIMITS.share.min}
                  max={ECHO_LIMITS.share.max}
                  changed={draft.echo.generalShare !== base.echo.generalShare}
                  base={base.echo.generalShare}
                  label="ぬくもり・鼓動を落とす割合"
                  onChange={(v) => setDraft((d) => ({ ...d, echo: { ...d.echo, generalShare: v } }))}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="muted">
        「ぬくもり・鼓動の割合」：残響を落とすとき、そのうち何%を、敵に関係なく「ぬくもりの残響」か「鼓動の残響」にするか。残りは、敵の属性・体質に合う残響です（無属性・普通の体の敵は、ただの残響）。
      </p>

      <h3 className="gen__subheading">二重耐性の指輪を落とす確率（%）</h3>
      <div className="admin__scroll">
        <table className="admin__table admin__table--cards">
          <thead>
            <tr>
              {FOE_RANKS.map((r) => (
                <th key={r} scope="col">
                  {RANK_LABELS[r]}
                </th>
              ))}
              <th scope="col">いちばん低い段階（1〜5）</th>
              <th scope="col">いちばん高い段階（1〜5）</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {FOE_RANKS.map((r) => (
                <td key={r} data-label={RANK_LABELS[r]} className="admin__c2">
                  <NumberField
                    value={draft.ring.dual.drop[r]}
                    min={ECHO_LIMITS.rate.min}
                    max={ECHO_LIMITS.rate.max}
                    step={0.1}
                    integer={false}
                    changed={draft.ring.dual.drop[r] !== base.ring.dual.drop[r]}
                    base={base.ring.dual.drop[r]}
                    label={`二重耐性の指輪を落とす確率（${RANK_LABELS[r]}）`}
                    onChange={(v) => setDraft((d) => ({ ...d, ring: { ...d.ring, dual: { ...d.ring.dual, drop: { ...d.ring.dual.drop, [r]: v } } } }))}
                  />
                </td>
              ))}
              {(['tierMin', 'tierMax'] as const).map((k) => (
                <td key={k} data-label={k === 'tierMin' ? 'いちばん低い段階' : 'いちばん高い段階'} className="admin__c2">
                  <NumberField
                    value={draft.ring.dual[k]}
                    min={ECHO_LIMITS.ringTier.min}
                    max={ECHO_LIMITS.ringTier.max}
                    error={draft.ring.dual.tierMin > draft.ring.dual.tierMax ? '低い段階は、高い段階以下にする' : null}
                    changed={draft.ring.dual[k] !== base.ring.dual[k]}
                    base={base.ring.dual[k]}
                    label={k === 'tierMin' ? '落とす二重耐性の指輪の最小の段階' : '落とす二重耐性の指輪の最大の段階'}
                    onChange={(v) => setDraft((d) => ({ ...d, ring: { ...d.ring, dual: { ...d.ring.dual, [k]: v } } }))}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="muted">段階ごとの耐性（%）は、「品物」タブの「二重耐性・弱点」で変えます。</p>

      <h3 className="gen__subheading">指輪を付けられる数（思い出した記憶の数で増える）</h3>
      <p className="muted">指は、最初は1本。記憶をこの数だけ思い出すと、2本目・3本目の指が使えます（記憶は全部で5つ）。</p>
      <div className="admin__scroll">
        <table className="admin__table admin__table--cards">
          <thead>
            <tr>
              <th scope="col">2本目の指（記憶の数）</th>
              <th scope="col">3本目の指（記憶の数）</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {(['two', 'three'] as const).map((k) => (
                <td key={k} data-label={k === 'two' ? '2本目の指' : '3本目の指'} className="admin__c2">
                  <NumberField
                    value={draft.ring.fingers[k]}
                    min={ECHO_LIMITS.memories.min}
                    max={ECHO_LIMITS.memories.max}
                    error={draft.ring.fingers.two > draft.ring.fingers.three ? '2本目は、3本目以下にする' : null}
                    changed={draft.ring.fingers[k] !== base.ring.fingers[k]}
                    base={base.ring.fingers[k]}
                    label={k === 'two' ? '2本目の指が使える記憶の数' : '3本目の指が使える記憶の数'}
                    onChange={(v) => setDraft((d) => ({ ...d, ring: { ...d.ring, fingers: { ...d.ring.fingers, [k]: v } } }))}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className="gen__subheading">残響ごとの名前と数字</h3>
      <div className="admin__scroll">
        <table className="admin__table admin__table--cards">
          <thead>
            <tr>
              <th scope="col">名前</th>
              <th scope="col">数字</th>
              <th scope="col">武器にはめたときの働き</th>
            </tr>
          </thead>
          <tbody>
            {ECHO_IDS.map((id) => {
              const e = draft.effects[id];
              const b = base.effects[id];
              const unit = ECHO_INFO[id].unit;
              const set = (change: Partial<typeof e>) => setDraft((d) => ({ ...d, effects: { ...d.effects, [id]: { ...d.effects[id], ...change } } }));
              return (
                <tr key={id}>
                  <th scope="row">
                    <TextField
                      value={e.name}
                      rule={{ max: ECHO_LIMITS.name.max, taken: names(e.name), takenText: 'ほかの残響の名前です' }}
                      changed={e.name !== b.name}
                      base={b.name}
                      label={`${id} の名前`}
                      onChange={(v) => set({ name: v })}
                    />
                  </th>
                  <td data-label={unit === null ? '数字（使わない）' : `数字（${unit || '個'}）`} className="admin__c2">
                    {unit === null ? (
                      <span className="muted">―</span>
                    ) : (
                      <NumberField
                        value={e.weapon}
                        min={ECHO_LIMITS.value.min}
                        max={ECHO_LIMITS.value.max}
                        changed={e.weapon !== b.weapon}
                        base={b.weapon}
                        label={`${e.name}の数字`}
                        onChange={(v) => set({ weapon: v })}
                      />
                    )}
                  </td>
                  <td data-label="働き">{echoText(draft, id)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted">
        満腹度の軽減は、合計90%までです。鼓動の残響を付けても、技ゲージが満タンになるまでの回数は{PULSE_FLOOR}回より減りません。複数はめた効果は足し算です（属性の残響は、先にはめた1つだけ効きます）。
      </p>
    </section>
  );
}
