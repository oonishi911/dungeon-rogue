// 開発用の管理画面（Admin.tsx）で使う部品：タブ、変更の一覧・トークン・「変更を公開」と、公開の進み具合、入力欄。
// 敵のマスターデータ（EnemyPanels.tsx）と、ダンジョンの設定（GenPanels.tsx）のタブで使う。
// 入力欄には、増減ボタン・スライダー・「戻す」ボタンが付く。画面の下に固定する「変更を公開」のバー（PublishBar）もここ

import { useEffect, useId, useRef, useState } from 'react';
import { DRAFT_KEY } from '../game/adminScreen';
import { nudge, numberError, textError, type TextRule } from '../game/fieldCheck';
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
  wrap = false,
}: {
  label: string;
  idPrefix: string;
  tabs: readonly { id: T; label: string; changed: boolean }[];
  current: T;
  onSelect: (id: T) => void;
  wrap?: boolean; // タブが多いとき、横にスクロールさせず、折り返して全部見せる
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
    <div className={cls("admin__tabs", wrap, "admin__tabs--wrap")} role="tablist" aria-label={label}>
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

/** 増減ボタンを押し続けたとき、連続して動き始めるまでの時間と、動く間隔（ミリ秒） */
const HOLD = { delay: 420, every: 70 };
/** 指（マウス）が、押した所からこれ以上（px）動いたら、スクロールなどの別の操作とみなして、何もしない */
const TAP_SLOP = 8;

/**
 * 「−」「＋」のボタン。誤って押さないよう、触れただけでは動かさない：
 * ほとんど動かさずに離したとき、1回だけ動かす。そのまま押し続けたら（0.42秒後から）、連続して動かす。
 * 触れたあとに指が動いたり（スクロール）、ブラウザが操作を取り消したりしたら、何もしない。
 * キーボードでは、ボタンに移らず、欄の中で上下の矢印キーを使う（ボタンは読み上げ・押す操作のために残す）
 */
function StepButton({ plus, label, disabled, onStep }: { plus: boolean; label: string; disabled: boolean; onStep: () => void }) {
  const timers = useRef<{ start?: number; repeat?: number }>({});
  // 触れている間の状態：押した位置、連続で動かし始めたか
  const press = useRef<{ x: number; y: number; repeating: boolean } | null>(null);
  const act = useRef(onStep);
  act.current = onStep;
  const stop = () => {
    window.clearTimeout(timers.current.start);
    window.clearInterval(timers.current.repeat);
    timers.current = {};
    press.current = null;
  };
  useEffect(() => stop, []);
  useEffect(() => {
    if (disabled) stop(); // 端まで来たら、押し続けていても止める
  }, [disabled]);
  return (
    <button
      type="button"
      className="admin__step"
      aria-label={label}
      tabIndex={-1}
      disabled={disabled}
      onPointerDown={(ev) => {
        if (ev.button !== 0) return;
        if (ev.pointerType === 'mouse') ev.preventDefault(); // 欄からカーソルが外れない・文字が選ばれない（指では、スクロールを邪魔しない）
        stop();
        const current = { x: ev.clientX, y: ev.clientY, repeating: false };
        press.current = current;
        // 動かさずに押し続けたら、ここから連続して動かす
        timers.current.start = window.setTimeout(() => {
          if (press.current !== current) return;
          current.repeating = true;
          act.current();
          timers.current.repeat = window.setInterval(() => act.current(), HOLD.every);
        }, HOLD.delay);
      }}
      onPointerMove={(ev) => {
        const p = press.current;
        if (p && !p.repeating && Math.hypot(ev.clientX - p.x, ev.clientY - p.y) > TAP_SLOP) stop(); // スクロールだった
      }}
      onPointerUp={() => {
        const p = press.current;
        const tapped = p !== null && !p.repeating;
        stop();
        if (tapped) act.current();
      }}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(ev) => ev.preventDefault()}
      // 読み上げ・キーボードの操作から押されたとき（ポインターの操作は、上で済んでいる）
      onClick={(ev) => {
        if (ev.detail === 0) act.current();
      }}
    >
      {plus ? '＋' : '−'}
    </button>
  );
}

/**
 * 変えた欄の横の「公開版の値に戻す」ボタン。
 * 変えていないときも、見えない場所取り（admin__reset--slot）を置く。出たときに欄の中身がずれて、さっきまで「＋」があった所に「戻す」が来て、続けて押してしまうのを防ぐため
 * （場所取りは、狭い画面だけ幅をとる。styles.css）
 */
export function ResetMark({ show, label, onClick }: { show: boolean; label: string; onClick: () => void }) {
  if (!show) {
    return (
      <span className="admin__reset admin__reset--slot" aria-hidden="true">
        <span>↺</span>
        <span className="admin__reset-text">戻す</span>
      </span>
    );
  }
  return (
    <button type="button" className="admin__reset" aria-label={label} title={label} onClick={onClick}>
      <span aria-hidden="true">↺</span>
      <span className="admin__reset-text">戻す</span>
    </button>
  );
}

/**
 * 数の入力欄。入力した直後に決まり（範囲・整数・奇数）を確かめ、合わなければ、欄の下に原因と正しい値の範囲を出す。
 * 欄の両側の「−」「＋」で、step（jump を渡せば jump）ずつ動かせる（押し続けると連続して動く。決まりは fieldCheck.ts の nudge）。
 * slider を付けると、欄の下に、指でなぞって決めるスライダーも出る（'narrow' なら、狭い画面だけ）。範囲の狭い値向け。
 * base（公開版の値）を渡すと、変えた欄に「戻す」ボタンが出る。
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
  base?: number;
  slider?: boolean | 'narrow';
  jump?: number; // 「−」「＋」で動かす幅（値段のように、刻み1では遅い欄向け。10の倍数にそろえて動かす）
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(String(props.value));
  useEffect(() => setText(String(props.value)), [props.value]);
  const step = props.step ?? 1;
  const rule = { min: props.min, max: props.max, step, ...(props.integer !== undefined ? { integer: props.integer } : {}), odd: props.odd ?? false };
  const error = numberError(text, rule) ?? props.error ?? null;
  const errorId = useId();
  // 押し続けたときに、そのときの値から動かせるよう、いつも新しい値と関数を持っておく
  const latest = useRef({ text, value: props.value, onChange: props.onChange });
  latest.current = { text, value: props.value, onChange: props.onChange };
  const set = (v: number) => {
    latest.current.text = String(v);
    setText(String(v));
    latest.current.onChange(v);
  };
  const move = (dir: 1 | -1) => {
    const typed = Number(latest.current.text);
    const from = latest.current.text.trim() !== '' && Number.isFinite(typed) ? typed : latest.current.value;
    set(nudge(from, dir, props.jump ? { min: props.min, max: props.max, step: props.jump, anchor: 0 } : rule));
  };
  const shown = text.trim() !== '' && Number.isFinite(Number(text)) ? Number(text) : props.value;
  const base = props.base;
  return (
    <span className="admin__field">
      <span className="admin__numrow">
        <StepButton plus={false} label={`${props.label}を減らす`} disabled={shown <= props.min} onStep={() => move(-1)} />
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
        <StepButton plus label={`${props.label}を増やす`} disabled={shown >= props.max} onStep={() => move(1)} />
        <ResetMark
          show={props.changed && base !== undefined && Number.isFinite(base) && base >= props.min && base <= props.max}
          label={`${props.label}を公開版の値（${base}）に戻す`}
          onClick={() => set(base!)}
        />
      </span>
      {props.slider && (
        <input
          type="range"
          className={cls('admin__slider', props.slider === 'narrow', 'admin__slider--narrow')}
          min={props.min}
          max={props.max}
          step={step}
          value={Math.min(props.max, Math.max(props.min, shown))}
          aria-label={`${props.label}（スライダー）`}
          tabIndex={-1}
          onChange={(e) => set(Number(e.target.value))}
        />
      )}
      <FieldError id={errorId} error={error} />
    </span>
  );
}

/** 文字の入力欄。入力した直後に決まり（長さ・使える文字・ほかと同じでないか）を確かめ、合わなければ欄の下に原因と直し方を出す。base（公開版の文字）を渡すと、変えた欄に「戻す」ボタンが出る */
export function TextField(props: {
  value: string;
  rule: TextRule;
  changed: boolean;
  label: string;
  className?: string;
  placeholder?: string;
  spellCheck?: boolean;
  quietWhenEmpty?: boolean; // 空のときはエラーを出さない（入力を始める前の欄）
  base?: string;
  onChange: (v: string) => void;
}) {
  const error = props.quietWhenEmpty && props.value === '' ? null : textError(props.value, props.rule);
  const errorId = useId();
  return (
    <span className="admin__field">
      <span className="admin__numrow">
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
        <ResetMark show={props.changed && Boolean(props.base)} label={`${props.label}を公開版の「${props.base}」に戻す`} onClick={() => props.onChange(props.base!)} />
      </span>
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

/** 狭い画面（スマホ）か。画面の幅が変わったら（横向きにしたときなど）、すぐ変わる。styles.css の「狭い画面」と同じ幅（48rem） */
export function useNarrow(query = '(max-width: 48rem)'): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return narrow;
}

// ===== 下書き =====

/** ブラウザに残してある下書き（ない・読めないときは null） */
export function readDraft(): string | null {
  try {
    return window.localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
}

/** 下書きを残す（null なら消す）。ブラウザに残せなくても、画面は使える */
export function writeDraft(raw: string | null): void {
  try {
    if (raw === null) window.localStorage.removeItem(DRAFT_KEY);
    else window.localStorage.setItem(DRAFT_KEY, raw);
  } catch {
    // 残せなくても、そのまま使える
  }
}

// ===== 画面の下に固定する「変更を公開」のバー =====

/** バーに出す、公開の進み具合の短い言葉（何もしていなければ null） */
export function publishBarText(publish: Publish): string | null {
  switch (publish.state) {
    case 'idle':
      return null;
    case 'sending':
      return '保存しています…';
    case 'error':
      return '保存に失敗しました';
    case 'watching':
      return { waiting: '保存しました。自動チェックを待っています…', checking: '自動チェック中です…', deploying: '公開しています…', done: '公開しました。ゲームを読み込み直すと反映されます', failed: '公開に失敗しました' }[publish.stage.stage];
  }
}

/**
 * 画面の下に固定する、変更の数と「変更を公開」のバー。どのタブにいても、すぐ公開できる（トークンの入力や、変えた内容の一覧は、公開の欄にある）。
 * 変えたところがあるあいだと、公開の進み具合を出しているあいだだけ出す。トークンがまだなら、押すと公開の欄へ移ってトークンの欄に入る。
 * 直すところがあるときは、公開できない（押すと、直すところの一覧がある公開の欄へ移る）
 */
export function PublishBar(props: { count: number; problems: number; publisher: ReturnType<typeof usePublish>; onPublish: () => void }) {
  const { count, problems, publisher } = props;
  const [closed, setClosed] = useState(false);
  const status = publishBarText(publisher.publish);
  const finished = publisher.publish.state === 'error' || (publisher.publish.state === 'watching' && ['done', 'failed'].includes(publisher.publish.stage.stage));
  // 変えたとき・新しく公開を始めたときは、閉じていても出す
  useEffect(() => setClosed(false), [count, publisher.publish.state]);
  if (!(count > 0 || publisher.busy || (finished && !closed))) return null;

  const toPanel = (focusToken: boolean) => {
    document.getElementById('admin-publish')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (focusToken) window.setTimeout(() => document.querySelector<HTMLInputElement>('.admin__token input')?.focus({ preventScroll: true }), 350);
  };
  const needToken = !publisher.token;
  const label = problems > 0 ? '直すところを見る' : needToken ? 'トークンを入れる' : '変更を公開';
  return (
    <div className="admin__bar" role="region" aria-label="変更を公開">
      <p className="admin__bar-text" role="status">
        {count > 0 && <strong>変更 {count}件</strong>}
        {problems > 0 && <span className="admin__bar-bad"> 直すところ {problems}件</span>}
        {status && <span className="admin__bar-status"> {status}</span>}
      </p>
      {count > 0 && (
        <div className="admin__bar-actions">
          <button type="button" className="explore__wait" onClick={() => toPanel(false)}>
            内容を見る
          </button>
          <button
            type="button"
            className="explore__wait admin__go"
            disabled={publisher.busy}
            onClick={() => (problems > 0 ? toPanel(false) : needToken ? toPanel(true) : props.onPublish())}
          >
            {label}
          </button>
        </div>
      )}
      {count === 0 && !publisher.busy && (
        <button type="button" className="explore__wait" onClick={() => setClosed(true)}>
          閉じる
        </button>
      )}
    </div>
  );
}
