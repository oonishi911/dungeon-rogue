// 開発用：敵のマスターデータ（src/game/enemies.json）を管理する画面。?view=enemies で開く。
// 変えた値は「変更を公開」でリポジトリに保存され、自動チェックが通れば数分で公開版に反映される

import { useEffect, useMemo, useState } from 'react';
import { BODY_NAMES, ENEMY_MASTER } from '../game/data';
import { ENEMY_CONFIG } from '../game/enemies';
import {
  BODIES,
  describeChanges,
  ELEMENTS,
  ENEMY_IDS,
  LIMITS,
  MASTER_TRAITS,
  masterProblems,
  serializeEnemyMaster,
  setWeight,
  TRAIT_LABELS,
  weightOf,
  type EnemyMaster,
  type EnemyRecord,
} from '../game/enemyMaster';
import type { Body, Element, EnemyId, TraitId } from '../game/types';
import { deployStage, loadToken, publishFile, PublishError, REPO, saveToken, type DeployStage } from './githubPublish';

const FILE = 'src/game/enemies.json';
const POLL_MS = 10_000; // 公開の進み具合を確かめる間隔

type Publish =
  | { state: 'idle' }
  | { state: 'sending' }
  | { state: 'watching'; commit: string; stage: DeployStage }
  | { state: 'error'; message: string };

const copy = (m: EnemyMaster): EnemyMaster => JSON.parse(JSON.stringify(m)) as EnemyMaster;

export function EnemyAdmin() {
  // base：今公開されている（この画面を開いたときの）データ。draft：画面で変えているデータ
  const [base, setBase] = useState<EnemyMaster>(() => copy(ENEMY_MASTER));
  const [draft, setDraft] = useState<EnemyMaster>(() => copy(ENEMY_MASTER));
  const [token, setToken] = useState(loadToken);
  const [remember, setRemember] = useState(() => loadToken() !== '');
  const [publish, setPublish] = useState<Publish>({ state: 'idle' });

  const changes = useMemo(() => describeChanges(base, draft), [base, draft]);
  const problems = useMemo(() => masterProblems(draft), [draft]);
  const bossIds = ENEMY_IDS.filter((id) => draft.enemies[id].boss);
  const fieldIds = ENEMY_IDS.filter((id) => !draft.enemies[id].boss);
  const busy = publish.state === 'sending' || (publish.state === 'watching' && !['done', 'failed'].includes(publish.stage.stage));

  const setEnemy = (id: EnemyId, patch: Partial<EnemyRecord>) =>
    setDraft((d) => ({ ...d, enemies: { ...d.enemies, [id]: { ...d.enemies[id], ...patch } } }));
  const setDungeon = (trait: TraitId, patch: Partial<EnemyMaster['dungeons'][TraitId]>) =>
    setDraft((d) => ({ ...d, dungeons: { ...d.dungeons, [trait]: { ...d.dungeons[trait], ...patch } } }));

  // 公開の進み具合を、終わるまで確かめ続ける
  useEffect(() => {
    if (publish.state !== 'watching' || ['done', 'failed'].includes(publish.stage.stage)) return;
    const timer = window.setTimeout(async () => {
      try {
        const stage = await deployStage(token, publish.commit);
        setPublish({ ...publish, stage });
      } catch {
        setPublish({ ...publish }); // 一時的に確かめられなくても、次の回にまた確かめる
      }
    }, POLL_MS);
    return () => window.clearTimeout(timer);
  }, [publish, token]);

  const onPublish = async () => {
    if (!token || problems.length || !changes.length) return;
    saveToken(remember ? token : null);
    setPublish({ state: 'sending' });
    try {
      const text = serializeEnemyMaster(draft);
      const message = `敵のデータを更新する（管理画面から）\n\n${changes.map((c) => `- ${c}`).join('\n')}`;
      const commit = await publishFile(token, FILE, text, serializeEnemyMaster(base), message);
      setBase(copy(draft)); // 次の変更は、今保存した内容をもとにする
      setPublish({ state: 'watching', commit, stage: { stage: 'waiting' } });
    } catch (e) {
      setPublish({ state: 'error', message: e instanceof PublishError ? e.message : '保存に失敗しました。通信を確かめて、もう一度試してください' });
    }
  };

  return (
    <main className="screen admin">
      <header className="top">
        <div>
          <p className="top__run">開発用</p>
          <h1 className="top__title">敵のマスターデータ</h1>
        </div>
      </header>

      <p className="admin__lead">
        値を変えて「変更を公開」を押すと、リポジトリの <code>{FILE}</code> に保存され、自動チェックが通れば数分で公開版に反映されます。
        ボス以外の敵は、ゲームの中ではHPと攻撃が{ENEMY_CONFIG.strengthRate === 0.5 ? '半分' : `${ENEMY_CONFIG.strengthRate}倍`}になります（「ゲーム内」の数字）。
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
              </tr>
            </thead>
            <tbody>
              {ENEMY_IDS.map((id) => {
                const e = draft.enemies[id];
                const b = base.enemies[id];
                const weak = !e.boss;
                return (
                  <tr key={id}>
                    <th scope="row">
                      <input
                        className={cls('admin__name', e.name !== b.name)}
                        value={e.name}
                        maxLength={LIMITS.name.max}
                        aria-label={`${id} の名前`}
                        onChange={(ev) => setEnemy(id, { name: ev.target.value })}
                      />
                      <span className="admin__id">{id}</span>
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
                  <th scope="row">{draft.enemies[id].name}</th>
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
                          label={`${TRAIT_LABELS[t]}のダンジョンでの${draft.enemies[id].name}の出やすさ`}
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
                          {draft.enemies[id].name}
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

      <section className="admin__section admin__publish" aria-labelledby="admin-publish">
        <h2 id="admin-publish" className="admin__heading">変更を公開</h2>
        {changes.length ? (
          <ul className="admin__changes">
            {changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        ) : (
          <p className="admin__note">まだ何も変えていません。</p>
        )}
        {problems.length > 0 && (
          <ul className="admin__problems" role="alert">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}

        <label className="admin__token">
          <span>GitHub のトークン</span>
          <input type="password" value={token} autoComplete="off" spellCheck={false} onChange={(e) => setToken(e.target.value.trim())} />
        </label>
        <label className="admin__remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          このブラウザに覚えておく
        </label>
        <details className="admin__help">
          <summary>トークンの作り方</summary>
          <ol>
            <li>
              GitHub の Settings → Developer settings → Personal access tokens → Fine-grained tokens で「Generate new token」を押す
            </li>
            <li>Expiration（期限）を決める（30日など、短めがおすすめ）</li>
            <li>
              Repository access で「Only select repositories」を選び、<code>{REPO.repo}</code> だけを選ぶ
            </li>
            <li>Permissions で、Contents を「Read and write」、Actions を「Read-only」にする</li>
            <li>作ったトークンを上の欄に貼る。トークンはこのブラウザにだけ保存され、ほかには送りません（GitHub を除く）</li>
          </ol>
        </details>

        <div className="admin__actions">
          <button type="button" className="explore__wait" disabled={busy || !changes.length} onClick={() => setDraft(copy(base))}>
            元に戻す
          </button>
          <button
            type="button"
            className="explore__wait admin__go"
            disabled={busy || !token || !changes.length || problems.length > 0}
            onClick={() => void onPublish()}
          >
            変更を公開
          </button>
        </div>
        <PublishStatus publish={publish} />
      </section>
    </main>
  );
}

function PublishStatus({ publish }: { publish: Publish }) {
  if (publish.state === 'idle') return null;
  if (publish.state === 'sending') return <p className="admin__status" role="status">保存しています…</p>;
  if (publish.state === 'error') return <p className="admin__status admin__status--bad" role="alert">{publish.message}</p>;
  const s = publish.stage;
  const link = 'url' in s ? (
    <a href={s.url} target="_blank" rel="noreferrer">
      進み具合を GitHub で見る
    </a>
  ) : null;
  const text = {
    waiting: '保存しました。自動チェックが始まるのを待っています…',
    checking: '自動チェック中です（数分かかります）…',
    deploying: '自動チェックが通りました。公開しています…',
    done: '公開しました。ゲームを読み込み直すと、新しいデータになります',
    failed: s.stage === 'failed' ? s.reason : '',
  }[s.stage];
  return (
    <p className={cls('admin__status', s.stage === 'failed', 'admin__status--bad')} role="status">
      {text} {link}
    </p>
  );
}

function NumberField(props: { value: number; min: number; max: number; changed: boolean; label: string; onChange: (v: number) => void }) {
  // 入力中は空欄や途中の値も許し、数として読めたときだけデータに入れる
  const [text, setText] = useState(String(props.value));
  useEffect(() => setText(String(props.value)), [props.value]);
  return (
    <input
      className={cls('admin__number', props.changed)}
      type="number"
      inputMode="numeric"
      min={props.min}
      max={props.max}
      step={1}
      value={text}
      aria-label={props.label}
      onChange={(e) => {
        setText(e.target.value);
        const v = Number(e.target.value);
        if (e.target.value !== '' && Number.isFinite(v)) props.onChange(v);
      }}
      onBlur={() => setText(String(props.value))}
    />
  );
}

function cls(base: string, on: boolean, extra = 'is-changed'): string {
  return on ? `${base} ${extra}` : base;
}
