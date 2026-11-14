// 開発用の管理画面（Admin.tsx）の、敵のマスターデータ（src/game/enemies.json）のタブ：
// 「敵」（敵の値を変える・敵を足す・消す）。どのダンジョンにどの敵が出るかは、ダンジョンの設定の「ダンジョンに出る敵」タブ（DungeonPanels.tsx）で決める。
// 変えた内容は、管理画面の「変更を公開」でリポジトリに保存され、自動チェックが通れば数分で公開版に反映される

import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { BODY_NAMES } from '../game/data';
import { ENEMY_CONFIG } from '../game/enemies';
import { addEnemy, BODIES, ELEMENTS, enemyIds, LIMITS, REWARD_LABELS, TRAIT_LABELS, type EnemyLook, type EnemyMaster, type EnemyRecord } from '../game/enemyMaster';
import { Sprite } from '../sprites/Sprite';
import type { Body, Element, EnemyId } from '../game/types';
import { textError } from '../game/fieldCheck';
import { cls, NumberField, TextField } from './adminParts';

/** タブの部品に渡すもの：公開版（base）、画面で変えているデータ（draft）、それを変える関数 */
export interface EnemyPanelProps {
  base: EnemyMaster;
  draft: EnemyMaster;
  setDraft: Dispatch<SetStateAction<EnemyMaster>>;
}

/**
 * 「敵」のタブ：敵の一覧（値を変える・消す）と、敵を足すところ。busy は、公開しているあいだ（足す・消すを止める）。
 * bossUsesOf は、その敵をボスにしているところ（「標準の炎」など。あれば消せない）。onRemove は、敵をすべてのダンジョンから外して消す
 */
export function EnemiesPanel({
  base,
  draft,
  setDraft,
  busy,
  bossUsesOf,
  onRemove,
}: EnemyPanelProps & { busy: boolean; bossUsesOf: (id: EnemyId) => string[]; onRemove: (id: EnemyId) => void }) {
  const ids = enemyIds(draft);
  // 見た目の候補：今いる敵の見た目（同じ見た目はまとめる）
  const looks = useMemo(() => lookChoices(draft), [draft]);

  const setEnemy = (id: EnemyId, patch: Partial<EnemyRecord>) =>
    setDraft((d) => ({ ...d, enemies: { ...d.enemies, [id]: { ...d.enemies[id]!, ...patch } } }));

  return (
    <section className="admin__section" role="tabpanel" id="admin-enemies-panel" aria-labelledby="admin-enemies-tab">
      <h2 className="admin__heading">敵</h2>
      <p className="admin__note">
        ボス以外の敵は、ゲームの中ではHPと攻撃が{ENEMY_CONFIG.strengthRate === 0.5 ? '半分' : `${ENEMY_CONFIG.strengthRate}倍`}になります（「ゲーム内」の数字）。
        金貨・経験値・落とす%は倒したときの報酬です（落とす%：回復薬か食料を落とす確率）。強敵は、金貨と経験値がダンジョンごとの倍率（「レベルと強敵の報酬」のタブ）で増え、必ず宝箱を落とします。
      </p>
      <div className="admin__scroll">
        <table className="admin__table">
          <thead>
            <tr>
              <th scope="col">名前</th>
              <th scope="col">HP</th>
              <th scope="col">攻撃</th>
              <th scope="col">防御</th>
              <th scope="col">属性</th>
              <th scope="col">体質</th>
              <th scope="col">ボス</th>
              <th scope="col">金貨</th>
              <th scope="col">経験値</th>
              <th scope="col">落とす%</th>
              <th scope="col">見た目</th>
              <th scope="col">
                <span className="visually-hidden">消す</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ids.map((id) => {
              const e = draft.enemies[id]!;
              // 足したばかりの敵は、公開版にない（どの値も「変えた」として印を付ける）
              const b = base.enemies[id] ?? {
                ...e,
                name: '',
                hp: -1,
                atk: -1,
                def: -1,
                look: { sprite: e.look.sprite, recolor: { _: '' } },
                reward: { gold: -1, exp: -1, drop: -1 },
              };
              const added = !(id in base.enemies);
              const weak = !e.boss;
              const bossOf = bossUsesOf(id);
              const lookKey = JSON.stringify(e.look);
              return (
                <tr key={id} className={added ? 'admin__row--new' : undefined}>
                  <th scope="row">
                    <span className="admin__who">
                      <Sprite id={e.look.sprite} recolor={e.look.recolor} scale={1} label={`${e.name}の見た目`} className="admin__sprite" />
                      <TextField
                        value={e.name}
                        rule={{ max: LIMITS.name.max, taken: otherNames(draft, id), takenText: 'ほかの敵の名前です' }}
                        changed={e.name !== b.name}
                        label={`${id} の名前`}
                        onChange={(v) => setEnemy(id, { name: v })}
                      />
                    </span>
                    <span className="admin__id">
                      {id}
                      {added && '（足す）'}
                    </span>
                  </th>
                  {(['hp', 'atk', 'def'] as const).map((key) => (
                    <td key={key}>
                      <NumberField
                        value={e[key]}
                        min={LIMITS[key].min}
                        max={LIMITS[key].max}
                        changed={e[key] !== b[key]}
                        label={`${e.name}の${{ hp: 'HP', atk: '攻撃', def: '防御' }[key]}`}
                        onChange={(v) => setEnemy(id, { [key]: v })}
                      />
                      {weak && key !== 'def' && <span className="admin__ingame">ゲーム内 {Math.round(e[key] * ENEMY_CONFIG.strengthRate)}</span>}
                    </td>
                  ))}
                  <td>
                    <select
                      className={cls('admin__select', e.element !== b.element)}
                      value={e.element}
                      aria-label={`${e.name}の属性`}
                      onChange={(ev) => setEnemy(id, { element: ev.target.value as Element })}
                    >
                      {ELEMENTS.map((el) => (
                        <option key={el} value={el}>
                          {TRAIT_LABELS[el]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className={cls('admin__select', e.body !== b.body)}
                      value={e.body}
                      aria-label={`${e.name}の体質`}
                      onChange={(ev) => setEnemy(id, { body: ev.target.value as Body })}
                    >
                      {BODIES.map((body) => (
                        <option key={body} value={body}>
                          {BODY_NAMES[body]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      className={cls('admin__check', Boolean(e.boss) !== Boolean(b.boss))}
                      checked={Boolean(e.boss)}
                      aria-label={`${e.name}をボスにする`}
                      onChange={(ev) => setEnemy(id, { boss: ev.target.checked || undefined })}
                    />
                  </td>
                  {(['gold', 'exp', 'drop'] as const).map((key) => (
                    <td key={key}>
                      {e.boss ? (
                        <span className="admin__ingame" title="ボスを倒したときは、ランクごとの報酬が出る">—</span>
                      ) : (
                        <NumberField
                          value={e.reward[key]}
                          min={LIMITS[key].min}
                          max={LIMITS[key].max}
                          changed={e.reward[key] !== b.reward[key]}
                          label={`${e.name}の${REWARD_LABELS[key]}`}
                          onChange={(v) => setEnemy(id, { reward: { ...e.reward, [key]: v } })}
                        />
                      )}
                    </td>
                  ))}
                  <td>
                    <select
                      className={cls('admin__select admin__look', lookKey !== JSON.stringify(b.look))}
                      value={lookKey}
                      aria-label={`${e.name}の見た目`}
                      onChange={(ev) => setEnemy(id, { look: JSON.parse(ev.target.value) as EnemyLook })}
                    >
                      {looks.map((l) => (
                        <option key={l.key} value={l.key}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="explore__wait admin__remove"
                      disabled={busy || bossOf.length > 0}
                      title={bossOf.length ? `${bossOf.join('・')}のボスなので消せません（先に「ダンジョンに出る敵」のタブでボスを変えてください）` : undefined}
                      aria-label={`${e.name}を消す`}
                      onClick={() => onRemove(id)}
                    >
                      消す
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <AddEnemy master={draft} disabled={busy} onAdd={(id, record) => setDraft((d) => addEnemy(d, id, record))} />
      <p className="admin__note">
        ボスにしているダンジョンがある敵は消せません。消すと、その敵はどのダンジョンにも出なくなります。足した敵は、ダンジョンごとの「ダンジョンに出る敵」のタブで出やすさを決めるまで、どのダンジョンにも出ません。
      </p>
    </section>
  );
}

/** 敵を足すところ。ID と名前を決め、見た目と強さは今いる敵から写す */
function AddEnemy({ master, disabled, onAdd }: { master: EnemyMaster; disabled: boolean; onAdd: (id: EnemyId, record: EnemyRecord) => void }) {
  const ids = enemyIds(master);
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [from, setFrom] = useState(ids[0] ?? '');
  const template = master.enemies[from] ?? master.enemies[ids[0] ?? ''];
  const names = new Set(Object.values(master.enemies).map((e) => e.name));
  // まだ何も入れていない欄には、エラーを出さない（quietWhenEmpty）。「足す」は、両方の欄が決まりに合うまで押せない
  const idRule = {
    max: LIMITS.id.max,
    pattern: { test: LIMITS.id.pattern, text: `英小文字で始まり、英小文字・数字・_ だけの2〜${LIMITS.id.max}文字` },
    taken: new Set(ids),
    takenText: 'ほかの敵の ID です',
  };
  const nameRule = { max: LIMITS.name.max, taken: names, takenText: 'ほかの敵の名前です' };
  const ready = Boolean(template && !textError(id, idRule) && !textError(name, nameRule));
  return (
    <div className="admin__add" role="group" aria-label="敵を足す">
      <p className="admin__add-title">敵を足す</p>
      <label>
        <span>ID（英小文字・数字・_）</span>
        <TextField value={id} rule={idRule} quietWhenEmpty changed={false} label="足す敵の ID" spellCheck={false} onChange={(v) => setId(v.trim())} placeholder="cave_bat" />
      </label>
      <label>
        <span>名前</span>
        <TextField value={name} rule={nameRule} quietWhenEmpty changed={false} label="足す敵の名前" onChange={setName} placeholder="洞窟コウモリ" />
      </label>
      <label>
        <span>見た目と強さのもと</span>
        <select className="admin__select" value={from} onChange={(e) => setFrom(e.target.value)}>
          {ids.map((i) => (
            <option key={i} value={i}>
              {master.enemies[i]!.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="explore__wait admin__add-button"
        disabled={disabled || !ready}
        onClick={() => {
          if (!template) return;
          onAdd(id, { ...JSON.parse(JSON.stringify(template)), name: name.trim() } as EnemyRecord);
          setId('');
          setName('');
        }}
      >
        足す
      </button>
    </div>
  );
}

/** ほかの敵の名前（名前の欄で、同じ名前にしないため） */
function otherNames(master: EnemyMaster, id: EnemyId): Set<string> {
  return new Set(enemyIds(master).flatMap((other) => (other === id ? [] : [master.enemies[other]!.name])));
}

/** 見た目の候補（今いる敵の見た目。同じ見た目は1つにまとめる） */
function lookChoices(master: EnemyMaster): { key: string; label: string }[] {
  const out = new Map<string, string[]>();
  for (const id of enemyIds(master)) {
    const key = JSON.stringify(master.enemies[id]!.look);
    out.set(key, [...(out.get(key) ?? []), master.enemies[id]!.name]);
  }
  return [...out].map(([key, names]) => ({ key, label: `${names[0]}${names.length > 1 ? `ほか${names.length - 1}体` : ''}の見た目` }));
}
