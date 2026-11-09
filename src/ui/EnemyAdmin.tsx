// 開発用：敵のマスターデータ（src/game/enemies.json）を管理する画面。?view=enemies で開く。
// 敵の値を変える・敵を足す・消すことができる。
// 変えた内容は「変更を公開」でリポジトリに保存され、自動チェックが通れば数分で公開版に反映される

import { useMemo, useState } from 'react';
import { BODY_NAMES, ENEMY_MASTER, REWARD_CONFIG } from '../game/data';
import { ENEMY_CONFIG } from '../game/enemies';
import {
  addEnemy,
  BODIES,
  describeChanges,
  dungeonsWithBoss,
  ELEMENTS,
  enemyIds,
  LIMITS,
  MASTER_TRAITS,
  masterProblems,
  removeEnemy,
  REWARD_LABELS,
  serializeEnemyMaster,
  setWeight,
  TRAIT_LABELS,
  weightOf,
  type EnemyLook,
  type EnemyMaster,
  type EnemyRecord,
} from '../game/enemyMaster';
import { Sprite } from '../sprites/Sprite';
import type { Body, Element, EnemyId, TraitId } from '../game/types';
import { AdminNav, cls, NumberField, PublishPanel, usePublish } from './adminParts';

const FILE = 'src/game/enemies.json';
const copy = (m: EnemyMaster): EnemyMaster => JSON.parse(JSON.stringify(m)) as EnemyMaster;

export function EnemyAdmin() {
  // base：今公開されている（この画面を開いたときの）データ。draft：画面で変えているデータ
  const [base, setBase] = useState<EnemyMaster>(() => copy(ENEMY_MASTER));
  const [draft, setDraft] = useState<EnemyMaster>(() => copy(ENEMY_MASTER));
  const publisher = usePublish(FILE);
  const { busy } = publisher;

  const changes = useMemo(() => describeChanges(base, draft), [base, draft]);
  const problems = useMemo(() => masterProblems(draft), [draft]);
  const ids = enemyIds(draft);
  const bossIds = ids.filter((id) => draft.enemies[id]!.boss);
  const fieldIds = ids.filter((id) => !draft.enemies[id]!.boss);
  // 見た目の候補：今いる敵の見た目（同じ見た目はまとめる）
  const looks = useMemo(() => lookChoices(draft), [draft]);

  const setEnemy = (id: EnemyId, patch: Partial<EnemyRecord>) =>
    setDraft((d) => ({ ...d, enemies: { ...d.enemies, [id]: { ...d.enemies[id]!, ...patch } } }));
  const setDungeon = (trait: TraitId, patch: Partial<EnemyMaster['dungeons'][TraitId]>) =>
    setDraft((d) => ({ ...d, dungeons: { ...d.dungeons, [trait]: { ...d.dungeons[trait], ...patch } } }));

  const onPublish = () => {
    if (problems.length || !changes.length) return;
    const message = `敵のデータを更新する（管理画面から）\n\n${changes.map((c) => `- ${c}`).join('\n')}`;
    void publisher.send(serializeEnemyMaster(draft), serializeEnemyMaster(base), message, () => setBase(copy(draft)));
  };

  return (
    <main className="screen admin">
      <header className="top">
        <div>
          <p className="top__run">開発用</p>
          <h1 className="top__title">敵のマスターデータ</h1>
        </div>
      </header>
      <AdminNav current="enemies" />

      <p className="admin__lead">
        値を変えて「変更を公開」を押すと、リポジトリの <code>{FILE}</code> に保存され、自動チェックが通れば数分で公開版に反映されます。
        ボス以外の敵は、ゲームの中ではHPと攻撃が{ENEMY_CONFIG.strengthRate === 0.5 ? '半分' : `${ENEMY_CONFIG.strengthRate}倍`}になります（「ゲーム内」の数字）。
        金貨・経験値・落とす%は倒したときの報酬です（落とす%：回復薬か食料を落とす確率）。強敵は金貨と経験値が{REWARD_CONFIG.elite}倍になり、必ず宝箱を落とします。
      </p>

      <section className="admin__section" aria-labelledby="admin-enemies">
        <h2 id="admin-enemies" className="admin__heading">敵</h2>
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
                const bossOf = dungeonsWithBoss(draft, id);
                const lookKey = JSON.stringify(e.look);
                return (
                  <tr key={id} className={added ? 'admin__row--new' : undefined}>
                    <th scope="row">
                      <span className="admin__who">
                        <Sprite id={e.look.sprite} recolor={e.look.recolor} scale={1} label={`${e.name}の見た目`} className="admin__sprite" />
                        <input
                          className={cls('admin__name', e.name !== b.name)}
                        value={e.name}
                        maxLength={LIMITS.name.max}
                        aria-label={`${id} の名前`}
                          onChange={(ev) => setEnemy(id, { name: ev.target.value })}
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
                        title={bossOf.length ? `${bossOf.map((t) => TRAIT_LABELS[t]).join('・')}のダンジョンのボスなので消せません（先にボスを変えてください）` : undefined}
                        aria-label={`${e.name}を消す`}
                        onClick={() => setDraft((d) => removeEnemy(d, id))}
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
          ボスにしているダンジョンがある敵は消せません。消すと、その敵はどのダンジョンにも出なくなります。足した敵は、下の表で出やすさを決めるまで、どのダンジョンにも出ません。
        </p>
      </section>

      <section className="admin__section" aria-labelledby="admin-dungeons">
        <h2 id="admin-dungeons" className="admin__heading">ダンジョンに出る敵</h2>
        <p className="admin__note">道中の数字は出やすさです（0：出ない。数が大きいほど出やすい）。ボスは、ボスにした敵から選びます。</p>
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
                  <th scope="row">{draft.enemies[id]!.name}</th>
                  {MASTER_TRAITS.map((t) => {
                    const w = weightOf(draft.dungeons[t].pool, id);
                    const total = draft.dungeons[t].pool.length;
                    return (
                      <td key={t}>
                        <NumberField
                          value={w}
                          min={0}
                          max={LIMITS.weight.max}
                          changed={w !== weightOf(base.dungeons[t].pool, id)}
                          label={`${TRAIT_LABELS[t]}のダンジョンでの${draft.enemies[id]!.name}の出やすさ`}
                          onChange={(v) => setDungeon(t, { pool: setWeight(draft.dungeons[t].pool, id, v) })}
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
                  <td key={t}>
                    <select
                      className={cls('admin__select', draft.dungeons[t].boss !== base.dungeons[t].boss)}
                      value={draft.dungeons[t].boss}
                      aria-label={`${TRAIT_LABELS[t]}のダンジョンのボス`}
                      onChange={(ev) => setDungeon(t, { boss: ev.target.value as EnemyId })}
                    >
                      {!bossIds.includes(draft.dungeons[t].boss) && <option value={draft.dungeons[t].boss}>（ボスではない敵）</option>}
                      {bossIds.map((id) => (
                        <option key={id} value={id}>
                          {draft.enemies[id]!.name}
                        </option>
                      ))}
                    </select>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <PublishPanel changes={changes} problems={problems} publisher={publisher} onReset={() => setDraft(copy(base))} onPublish={onPublish} />
    </main>
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
  const problem = !id
    ? null
    : !LIMITS.id.pattern.test(id)
      ? `ID は英小文字で始まり、英小文字・数字・_ だけの2〜${LIMITS.id.max}文字にします`
      : id in master.enemies
        ? 'その ID の敵はもういます'
        : name && names.has(name.trim())
          ? '同じ名前の敵がもういます'
          : null;
  const ready = Boolean(id && name.trim() && template && !problem);
  return (
    <div className="admin__add" role="group" aria-label="敵を足す">
      <p className="admin__add-title">敵を足す</p>
      <label>
        <span>ID（英小文字・数字・_）</span>
        <input className="admin__name" value={id} maxLength={LIMITS.id.max} spellCheck={false} onChange={(e) => setId(e.target.value.trim())} placeholder="cave_bat" />
      </label>
      <label>
        <span>名前</span>
        <input className="admin__name" value={name} maxLength={LIMITS.name.max} onChange={(e) => setName(e.target.value)} placeholder="洞窟コウモリ" />
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
      {problem && <p className="admin__add-problem">{problem}</p>}
    </div>
  );
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
