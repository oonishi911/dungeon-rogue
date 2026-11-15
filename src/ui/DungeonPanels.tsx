// 開発用の管理画面（Admin.tsx）の、ダンジョンの設定ファイル（src/game/dungeons/<ID>.json）を選ぶ・作る・消すところと、
// 「名前と説明」「ダンジョンに出る敵」のタブ。
// 「ダンジョンに出る敵」は、PCの広い画面では、敵×属性の表。狭い画面（スマホ）では、横にスクロールしなくていいよう、属性を1つ選んで、その属性の敵を縦に並べる。
// ダンジョンは、プレイヤーが遊ぶ前に選ぶ（1つのファイルが1つのダンジョン）。新しいダンジョンは、今あるダンジョンを複製して作る。
// ほかのタブ（階の数・広さ・満腹度など）は GenPanels.tsx にあり、ここで選んだダンジョンの値を変える

import { useState } from 'react';
import { dungeonIdRule, dungeonNameRule, dungeonStatus, type AdminData } from '../game/adminScreen';
import { DEFAULT_DUNGEON_ID, sortDungeonIds } from '../game/dungeons';
import { enemyIds, LIMITS, MASTER_TRAITS, setWeight, TRAIT_LABELS, weightOf, type DungeonEnemies, type EnemyMaster, type Encounters } from '../game/enemyMaster';
import { textError } from '../game/fieldCheck';
import { DUNGEON_LIMITS, type DungeonFile } from '../game/genMaster';
import type { EnemyId, TraitId } from '../game/types';
import { enemyStrength } from '../game/enemyView';
import { cls, NumberField, ResetMark, TextField, useNarrow } from './adminParts';

const STATUS_TEXT = { new: '（新しく作る）', changed: '（変更あり）', same: '' } as const;

/** 直すダンジョンを選ぶ欄（ダンジョンの設定のタブの上に出す） */
export function DungeonPicker({ base, draft, current, onSelect }: { base: AdminData; draft: AdminData; current: string; onSelect: (id: string) => void }) {
  const ids = sortDungeonIds(Object.keys(draft.dungeons));
  return (
    <div className="admin__dungeon">
      <label>
        <span>直すダンジョン</span>
        <select className="admin__select" value={current} onChange={(ev) => onSelect(ev.target.value)}>
          {ids.map((id) => (
            <option key={id} value={id}>
              {draft.dungeons[id]!.name || id}
              {STATUS_TEXT[dungeonStatus(id, base, draft)]}
            </option>
          ))}
        </select>
      </label>
      <span className="admin__id">
        ファイル：<code>src/game/dungeons/{current}.json</code>
      </span>
    </div>
  );
}

/** 「名前と説明」のタブ：プレイヤーが選ぶときに見る名前と説明、ダンジョンを複製して作る・消す */
export function AboutPanel(props: {
  base: DungeonFile | undefined; // 公開版（新しく作るダンジョンにはない）
  draft: DungeonFile;
  id: string;
  allNames: Map<string, string>; // ダンジョンの ID ごとの名前（名前を重ねないため）
  allIds: string[];
  busy: boolean;
  setDraft: (change: (d: DungeonFile) => DungeonFile) => void;
  onDuplicate: (id: string, name: string) => void;
  onRemove: () => void;
}) {
  const { base, draft, id } = props;
  const otherNames = [...props.allNames].flatMap(([other, name]) => (other === id ? [] : [name]));
  return (
    <section className="admin__section" role="tabpanel" id="admin-about-panel" aria-labelledby="admin-about-tab">
      <h2 className="admin__heading">名前と説明</h2>
      <p className="admin__note">
        プレイヤーは、遊ぶ前にダンジョンを選びます。ここで決める名前と説明は、その選ぶ画面に出ます。
        ダンジョンの ID（<code>{id}</code>）は、ファイルの名前なので変えられません。
        <span className="gen__example">例：名前は「最初の祠」（16文字まで）、説明は「はじめて挑むのにちょうどいい、短い洞窟」（80文字まで）。</span>
      </p>
      <div className="gen__fields">
        <div className="gen__field">
          <span className="gen__label">名前</span>
          <TextField
            value={draft.name}
            rule={dungeonNameRule(otherNames)}
            changed={draft.name !== base?.name}
            label="ダンジョンの名前"
            onChange={(v) => props.setDraft((d) => ({ ...d, name: v }))}
          />
          <span className="gen__hint">{DUNGEON_LIMITS.name.max}文字まで</span>
        </div>
        <div className="gen__field gen__field--wide">
          <span className="gen__label">説明</span>
          <DescriptionField value={draft.description} changed={draft.description !== base?.description} onChange={(v) => props.setDraft((d) => ({ ...d, description: v }))} />
          <span className="gen__hint">{DUNGEON_LIMITS.description.max}文字まで（なくてもよい）</span>
        </div>
      </div>

      <DuplicateDungeon from={draft.name || id} ids={props.allIds} names={[...props.allNames.values()]} disabled={props.busy} onDuplicate={props.onDuplicate} />

      <div className="admin__danger">
        <button type="button" className="explore__wait admin__remove" disabled={props.busy || id === DEFAULT_DUNGEON_ID} onClick={props.onRemove}>
          このダンジョンを消す
        </button>
        <p className="admin__note">
          {id === DEFAULT_DUNGEON_ID
            ? '標準のダンジョンは消せません（ほかのダンジョンのもとになり、前の版の途中保存も、標準のダンジョンとして続きから遊びます）。'
            : '消すと、「変更を公開」したときにファイルが消え、プレイヤーは選べなくなります。このダンジョンを遊んでいる途中の人は、続きから遊べなくなります。'}
        </p>
      </div>
    </section>
  );
}

/** 説明の欄（長いので、何行かの欄にする）。長すぎるときは、欄の下に直し方を出す */
function DescriptionField({ value, changed, onChange }: { value: string; changed: boolean; onChange: (v: string) => void }) {
  const max = DUNGEON_LIMITS.description.max;
  const error = value.length > max ? `${value.length}文字あります。${max}文字までにしてください。` : null;
  return (
    <span className="admin__field">
      <textarea
        className={cls(cls('admin__name admin__text', changed), Boolean(error), 'is-invalid')}
        value={value}
        rows={3}
        aria-label="ダンジョンの説明"
        aria-invalid={Boolean(error)}
        onChange={(e) => onChange(e.target.value.replace(/\n/g, ''))}
      />
      <span className="admin__error" role="status" aria-live="polite">
        {error}
      </span>
    </span>
  );
}

/** 今のダンジョンを複製して、新しいダンジョンを作るところ。ID（ファイルの名前）と名前を決める */
function DuplicateDungeon(props: { from: string; ids: string[]; names: string[]; disabled: boolean; onDuplicate: (id: string, name: string) => void }) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const idRule = dungeonIdRule(props.ids);
  const nameRule = dungeonNameRule(props.names);
  const ready = !textError(id, idRule) && !textError(name, nameRule);
  return (
    <div className="admin__add" role="group" aria-label="ダンジョンを複製して作る">
      <p className="admin__add-title">「{props.from}」を複製して、新しいダンジョンを作る</p>
      <label>
        <span>ID（英小文字・数字・_）</span>
        <TextField value={id} rule={idRule} quietWhenEmpty changed={false} label="新しいダンジョンの ID" spellCheck={false} placeholder="deep_cave" onChange={(v) => setId(v.trim())} />
      </label>
      <label>
        <span>名前</span>
        <TextField value={name} rule={nameRule} quietWhenEmpty changed={false} label="新しいダンジョンの名前" placeholder="深い洞窟" onChange={setName} />
      </label>
      <button
        type="button"
        className="explore__wait admin__add-button"
        disabled={props.disabled || !ready}
        onClick={() => {
          props.onDuplicate(id, name.trim());
          setId('');
          setName('');
        }}
      >
        複製して作る
      </button>
    </div>
  );
}

/** 「ダンジョンに出る敵」のタブ：選んでいるダンジョンの、属性ごとの道中の敵の出やすさと、ボス。敵は敵のマスターから選ぶ */
export function PoolPanel(props: { master: EnemyMaster; base: Encounters | undefined; draft: Encounters; dungeonName: string; setDraft: (change: (e: Encounters) => Encounters) => void }) {
  const { master, draft } = props;
  const base = props.base ?? draft;
  const ids = enemyIds(master);
  const bossIds = ids.filter((id) => master.enemies[id]!.boss);
  const fieldIds = ids.filter((id) => !master.enemies[id]!.boss);
  const setTrait = (trait: TraitId, patch: Partial<DungeonEnemies>) => props.setDraft((e) => ({ ...e, [trait]: { ...e[trait], ...patch } }));
  const nameOf = (id: EnemyId) => master.enemies[id]?.name ?? id;

  // 狭い画面：属性を1つ選んで、その属性の敵を縦に並べる
  const narrow = useNarrow();
  const [sel, setSel] = useState<TraitId>(MASTER_TRAITS[0]!);
  const [query, setQuery] = useState('');
  const [onlyUsed, setOnlyUsed] = useState(false);
  const bossSelect = (t: TraitId, className: string) => (
    <select
      className={cls(className, draft[t].boss !== base[t].boss)}
      value={draft[t].boss}
      aria-label={`${TRAIT_LABELS[t]}の属性のボス`}
      onChange={(ev) => setTrait(t, { boss: ev.target.value as EnemyId })}
    >
      {!bossIds.includes(draft[t].boss) && <option value={draft[t].boss}>（ボスではない敵）</option>}
      {bossIds.map((id) => (
        <option key={id} value={id}>
          {nameOf(id)}
        </option>
      ))}
    </select>
  );

  if (narrow) {
    const pool = draft[sel].pool;
    const q = query.trim().toLowerCase();
    const shown = fieldIds.filter((id) => (!q || nameOf(id).toLowerCase().includes(q) || id.toLowerCase().includes(q)) && (!onlyUsed || weightOf(pool, id) > 0));
    const used = fieldIds.filter((id) => weightOf(pool, id) > 0).length;
    // 強敵の元になる敵（enemies.ts の strongestOf と同じ：強さの目安がいちばん大きい。同じなら、並びの先のほう）
    const eliteId = [...pool].sort((a, b) => enemyStrength(master.enemies[b] ?? { hp: 0, atk: 0 }) - enemyStrength(master.enemies[a] ?? { hp: 0, atk: 0 }))[0];
    return (
      <section className="admin__section" role="tabpanel" id="admin-pool-panel" aria-labelledby="admin-pool-tab">
        <h2 className="admin__heading">ダンジョンに出る敵（{props.dungeonName}）</h2>
        <p className="admin__note">
          ダンジョンの属性（遊ぶたびに、5つのどれかに決まる）を選んで、その属性のときに出る敵の出やすさを決めます（0：出ない。数が大きいほど出やすい）。ボスは、ボスにした敵から選びます。
          <span className="gen__example">例：ゴブリン2・大ネズミ1・ほかは0なら、出る敵の3分の2がゴブリン、3分の1が大ネズミ（敵ごとの「出る確率」は、下に出ます）。</span>
        </p>
        <div className="admin__traitpick" role="group" aria-label="ダンジョンの属性">
          {MASTER_TRAITS.map((t) => {
            const changed = JSON.stringify(draft[t]) !== JSON.stringify(base[t]);
            return (
              <button key={t} type="button" className="admin__traitbtn" aria-pressed={t === sel} onClick={() => setSel(t)}>
                {TRAIT_LABELS[t]}
                {changed && <span className="admin__tab-mark" aria-label="（変更あり）" />}
              </button>
            );
          })}
        </div>
        <div className="admin__bosspick">
          <span>{TRAIT_LABELS[sel]}の属性のボス</span>
          <span className="admin__numrow">
            {bossSelect(sel, 'admin__select')}
            <ResetMark show={draft[sel].boss !== base[sel].boss} label={`${TRAIT_LABELS[sel]}の属性のボスを公開版の「${nameOf(base[sel].boss)}」に戻す`} onClick={() => setTrait(sel, { boss: base[sel].boss })} />
          </span>
        </div>
        <div className="admin__toolbar admin__toolbar--pool">
          <label className="admin__search">
            <span className="visually-hidden">敵を探す</span>
            <input type="search" className="admin__name" value={query} placeholder="名前で探す" aria-label="敵を探す（名前か ID の一部）" onChange={(ev) => setQuery(ev.target.value)} />
          </label>
          <label className="admin__toggle">
            <input type="checkbox" className="admin__check" checked={onlyUsed} onChange={(ev) => setOnlyUsed(ev.target.checked)} />
            出る敵だけ
          </label>
          <span className="admin__count" role="status">
            出る敵 {used}種 / {fieldIds.length}種
          </span>
        </div>
        {shown.length === 0 && <p className="admin__note">条件に合う敵がいません。</p>}
        <ul className="admin__pool">
          {shown.map((id) => {
            const w = weightOf(pool, id);
            const was = weightOf(base[sel].pool, id);
            return (
              <li key={id} className="admin__poolrow">
                <span className="admin__poolname">
                  {nameOf(id)}
                  {id === eliteId && <span className="admin__badge">強敵の元</span>}
                </span>
                <span className="admin__poolshare">{w > 0 && pool.length > 0 ? `出る確率 ${Math.round((w / pool.length) * 100)}%` : '出ない'}</span>
                <NumberField
                  value={w}
                  min={0}
                  max={LIMITS.weight.max}
                  changed={w !== was}
                  base={was}
                  label={`${TRAIT_LABELS[sel]}の属性での${nameOf(id)}の出やすさ`}
                  onChange={(v) => setTrait(sel, { pool: setWeight(draft[sel].pool, id, v) })}
                />
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <section className="admin__section" role="tabpanel" id="admin-pool-panel" aria-labelledby="admin-pool-tab">
      <h2 className="admin__heading">ダンジョンに出る敵（{props.dungeonName}）</h2>
      <p className="admin__note">
        ダンジョンの属性（遊ぶたびに、5つのどれかに決まる）ごとに、出る敵を、敵のマスター（「敵」のタブ）から選びます。
        道中の数字は出やすさです（0：出ない。数が大きいほど出やすい）。ボスは、ボスにした敵から選びます。
        <span className="gen__example">例：ゴブリン2・大ネズミ1・ほかは0なら、出る敵の3分の2がゴブリン、3分の1が大ネズミ（数字の下の%が、その出る確率です）。</span>
      </p>
      <div className="admin__scroll">
        <table className="admin__table admin__table--grid">
          <thead>
            <tr>
              <th scope="col">敵</th>
              {MASTER_TRAITS.map((t) => (
                <th key={t} scope="col">
                  {TRAIT_LABELS[t]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fieldIds.map((id) => (
              <tr key={id}>
                <th scope="row">{nameOf(id)}</th>
                {MASTER_TRAITS.map((t) => {
                  const w = weightOf(draft[t].pool, id);
                  const total = draft[t].pool.length;
                  return (
                    <td key={t}>
                      <NumberField
                        value={w}
                        min={0}
                        max={LIMITS.weight.max}
                        changed={w !== weightOf(base[t].pool, id)} base={weightOf(base[t].pool, id)}
                        label={`${TRAIT_LABELS[t]}の属性での${nameOf(id)}の出やすさ`}
                        onChange={(v) => setTrait(t, { pool: setWeight(draft[t].pool, id, v) })}
                      />
                      {w > 0 && total > 0 && <span className="admin__ingame">{Math.round((w / total) * 100)}%</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="admin__boss-row">
              <th scope="row">ボス</th>
              {MASTER_TRAITS.map((t) => (
                <td key={t}>{bossSelect(t, 'admin__select')}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
