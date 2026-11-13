// 開発用の管理画面（Admin.tsx）で使う部品：タブ、変更の一覧・トークン・「変更を公開」と、公開の進み具合、入力欄。
// 敵のマスターデータ（EnemyPanels.tsx）と、ダンジョンの設定（GenPanels.tsx）のタブで使う

import { useEffect, useId, useState } from 'react';
import { numberError, textError, type TextRule } from '../game/fieldCheck';
import { deployStage, loadToken, publishFiles, PublishError, REPO, saveToken, type DeployStage, type PublishItem } from './githubPublish';

const POLL_MS = 10_000; // 公開の進み具合を確かめる間隔

export type Publish =
  | { state: 'idle' }
  | { state: 'sending' }
  | { state: 'watching'; commit: string; stage: DeployStage }
  | { state: 'error'; message: string };

/**
 * 設定の種類ごとのタブ。選んだタブの中身だけを出す（中身は、呼ぶ側で role="tabpanel"・id="{idPrefix}-{id}-panel"・aria-labelledby="{idPrefix}-{id}-tab" にする）。
 * 公開している値から変えたタブには、目印（・）を付ける（ほかのタブで変えたことを忘れないように）。左右の矢印キーでもタブを移れる。
 * 狭い画面では、タブの列だけ横にスクロールする。選んだタブは、いつも見える位置に寄せる
 */
export function AdminTabs<T extends string>({
  label,
  idPrefix,
  tabs,
  current,
  onSelect,
}: {
  label: string;
  idPrefix: string;
  tabs: readonly { id: T; label: string; changed: boolean }[];
  current: T;
  onSelect: (id: T) => void;
}) {
  const move = (from: number, step: number) => {
    const next = tabs[(from + step + tabs.length) % tabs.length]!;
    onSelect(next.id);
    document.getElementById(`${idPrefix}-${next.id}-tab`)?.focus();
  };
  // 狭い画面では、選んだタブ（住所の tab= で開いたものも）がタブの列の外に隠れないよう、列の中だけを動かして見える位置に寄せる
  useEffect(() => {
    const tab = document.getElementById(`${idPrefix}-${current}-tab`);
    const row = tab?.parentElement;
    if (!tab || !row) return;
    const left = tab.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft) row.scrollLeft = left;
    else if (left + tab.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollLeft = left + tab.offsetWidth - row.clientWidth;
  }, [idPrefix, current]);
  return (
    <div className="admin__tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`${idPrefix}-${t.id}-tab`}
          aria-controls={`${idPrefix}-${t.id}-panel`}
          aria-selected={t.id === current}
          tabIndex={t.id === current ? 0 : -1}
          className={cls('admin__tab', t.changed)}
          onClick={() => onSelect(t.id)}
          onKeyDown={(ev) => {
            if (ev.key === 'ArrowRight') move(i, 1);
            else if (ev.key === 'ArrowLeft') move(i, -1);
            else return;
            ev.preventDefault();
          }}
        >
          {t.label}
          {t.changed && <span className="admin__tab-mark" aria-label="（変更あり）" />}
        </button>
      ))}
    </div>
  );
}

/**
 * ファイルを公開する仕組み。send(files, message, onSaved) で、いくつかのファイルを1回のコミットでまとめて保存し、
 * そのあとは公開が終わるまで進み具合を確かめ続ける。
 * 保存できたら onSaved を呼ぶ（次の変更は、今保存した内容をもとにする）
 */
export function usePublish() {
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

  const send = async (files: PublishItem[], message: string, onSaved: () => void) => {
    if (!token) return;
    saveToken(remember ? token : null);
    setPublish({ state: 'sending' });
    try {
      const commit = await publishFiles(token, files, message);
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
  files: string[]; // 保存するファイル（変えたほうだけ）
  problems: string[];
  publisher: ReturnType<typeof usePublish>;
  onReset: () => void;
  onPublish: () => void;
}) {
  const { changes, files, problems, publisher } = props;
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
      {files.length > 0 && (
        <p className="admin__note">
          保存するファイル：
          {files.map((f, i) => (
            <span key={f}>
              {i > 0 && '、'}
              <code>{f}</code>
            </span>
          ))}
          {files.length > 1 && '（1回のコミットでまとめて保存します）'}
        </p>
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

/**
 * 数の入力欄。入力した直後に決まり（範囲・整数・奇数）を確かめ、合わなければ、欄の下に原因と正しい値の範囲を出す。
 * error は、ほかの欄との大小（最小は最大以下、など）のように、この欄だけでは決まらないエラー（欄の決まりに合っているときだけ出す）。
 * 決まりに合わない値も、数として読めれば onChange で渡す（公開の欄の「直すところ」にも出て、公開できないようにするため）
 */
export function NumberField(props: {
  value: number;
  min: number;
  max: number;
  step?: number;
  integer?: boolean;
  odd?: boolean;
  error?: string | null;
  changed: boolean;
  label: string;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(String(props.value));
  useEffect(() => setText(String(props.value)), [props.value]);
  const step = props.step ?? 1;
  const rule = { min: props.min, max: props.max, step, ...(props.integer !== undefined ? { integer: props.integer } : {}), odd: props.odd ?? false };
  const error = numberError(text, rule) ?? props.error ?? null;
  const errorId = useId();
  return (
    <span className="admin__field">
      <input
        className={cls(cls('admin__number', props.changed), Boolean(error), 'is-invalid')}
        type="number"
        inputMode={Number.isInteger(step) ? 'numeric' : 'decimal'}
        min={props.min}
        max={props.max}
        step={step}
        value={text}
        aria-label={props.label}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value);
          if (e.target.value.trim() !== '' && Number.isFinite(v)) props.onChange(v);
        }}
        // 空や数でない文字のまま離れたら、今の値に戻す（範囲の外の数は、直すまでそのまま残してエラーを出す）
        onBlur={() => {
          if (text.trim() === '' || !Number.isFinite(Number(text))) setText(String(props.value));
        }}
      />
      <FieldError id={errorId} error={error} />
    </span>
  );
}

/** 文字の入力欄。入力した直後に決まり（長さ・使える文字・ほかと同じでないか）を確かめ、合わなければ欄の下に原因と直し方を出す */
export function TextField(props: {
  value: string;
  rule: TextRule;
  changed: boolean;
  label: string;
  className?: string;
  placeholder?: string;
  spellCheck?: boolean;
  quietWhenEmpty?: boolean; // 空のときはエラーを出さない（入力を始める前の欄）
  onChange: (v: string) => void;
}) {
  const error = props.quietWhenEmpty && props.value === '' ? null : textError(props.value, props.rule);
  const errorId = useId();
  return (
    <span className="admin__field">
      <input
        className={cls(cls(props.className ?? 'admin__name', props.changed), Boolean(error), 'is-invalid')}
        value={props.value}
        aria-label={props.label}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        placeholder={props.placeholder}
        spellCheck={props.spellCheck}
        onChange={(e) => props.onChange(e.target.value)}
      />
      <FieldError id={errorId} error={error} />
    </span>
  );
}

/** 入力欄の下に出すエラー。読み上げでも、出たときに伝わるようにする */
function FieldError({ id, error }: { id: string; error: string | null }) {
  return (
    <span id={id} className="admin__error" role="status" aria-live="polite">
      {error}
    </span>
  );
}

export function cls(base: string, on: boolean, extra = 'is-changed'): string {
  return on ? `${base} ${extra}` : base;
}
