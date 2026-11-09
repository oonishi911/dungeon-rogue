// 開発用の管理画面で共通に使う部品：変更の一覧・トークン・「変更を公開」と、公開の進み具合。
// 敵のマスターデータ（EnemyAdmin.tsx）と、ダンジョンの設定（GenAdmin.tsx）で使う

import { useEffect, useState } from 'react';
import { deployStage, loadToken, publishFile, PublishError, REPO, saveToken, type DeployStage } from './githubPublish';

const POLL_MS = 10_000; // 公開の進み具合を確かめる間隔

export type Publish =
  | { state: 'idle' }
  | { state: 'sending' }
  | { state: 'watching'; commit: string; stage: DeployStage }
  | { state: 'error'; message: string };

/** 管理画面どうしを行き来するリンク */
export const ADMIN_VIEWS = [
  { view: 'enemies', label: '敵のマスターデータ' },
  { view: 'gen', label: 'ダンジョンの設定' },
] as const;

export function AdminNav({ current }: { current: (typeof ADMIN_VIEWS)[number]['view'] }) {
  return (
    <nav className="admin__nav" aria-label="管理画面">
      {ADMIN_VIEWS.map((v) =>
        v.view === current ? (
          <span key={v.view} aria-current="page">
            {v.label}
          </span>
        ) : (
          <a key={v.view} href={`?view=${v.view}`}>
            {v.label}
          </a>
        ),
      )}
    </nav>
  );
}

/**
 * ファイル1つを公開する仕組み。publish(text, base, message) で保存し、そのあとは公開が終わるまで進み具合を確かめ続ける。
 * 保存できたら onSaved を呼ぶ（次の変更は、今保存した内容をもとにする）
 */
export function usePublish(file: string) {
  const [token, setToken] = useState(loadToken);
  const [remember, setRemember] = useState(() => loadToken() !== '');
  const [publish, setPublish] = useState<Publish>({ state: 'idle' });
  const busy = publish.state === 'sending' || (publish.state === 'watching' && !['done', 'failed'].includes(publish.stage.stage));

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

  const send = async (text: string, base: string, message: string, onSaved: () => void) => {
    if (!token) return;
    saveToken(remember ? token : null);
    setPublish({ state: 'sending' });
    try {
      const commit = await publishFile(token, file, text, base, message);
      onSaved();
      setPublish({ state: 'watching', commit, stage: { stage: 'waiting' } });
    } catch (e) {
      setPublish({ state: 'error', message: e instanceof PublishError ? e.message : '保存に失敗しました。通信を確かめて、もう一度試してください' });
    }
  };

  return { token, setToken, remember, setRemember, publish, busy, send };
}

/** 「変更を公開」の欄：変えたところの一覧、問題、トークン、元に戻す・公開のボタン、進み具合 */
export function PublishPanel(props: {
  changes: string[];
  problems: string[];
  publisher: ReturnType<typeof usePublish>;
  onReset: () => void;
  onPublish: () => void;
}) {
  const { changes, problems, publisher } = props;
  const { token, setToken, remember, setRemember, publish, busy } = publisher;
  return (
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
        <button type="button" className="explore__wait" disabled={busy || !changes.length} onClick={props.onReset}>
          元に戻す
        </button>
        <button
          type="button"
          className="explore__wait admin__go"
          disabled={busy || !token || !changes.length || problems.length > 0}
          onClick={props.onPublish}
        >
          変更を公開
        </button>
      </div>
      <PublishStatus publish={publish} />
    </section>
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

/** 数の入力欄。入力中は空欄や途中の値も許し、数として読めたときだけデータに入れる（範囲の外の値は、公開の欄に問題として出る） */
export function NumberField(props: {
  value: number;
  min: number;
  max: number;
  step?: number;
  changed: boolean;
  label: string;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(String(props.value));
  useEffect(() => setText(String(props.value)), [props.value]);
  const step = props.step ?? 1;
  return (
    <input
      className={cls('admin__number', props.changed)}
      type="number"
      inputMode={Number.isInteger(step) ? 'numeric' : 'decimal'}
      min={props.min}
      max={props.max}
      step={step}
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

export function cls(base: string, on: boolean, extra = 'is-changed'): string {
  return on ? `${base} ${extra}` : base;
}
