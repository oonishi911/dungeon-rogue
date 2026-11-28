// 情報屋との会話：ダンジョンを選んだあと、店に行く前に、これから入るダンジョンのことを聞き出す画面。
// ルールは src/game/informant.ts。ここでは呼び出して表示するだけ。

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { alreadyAsked, ask, canAskVaguely, INFORMANT_CONFIG, priceOf, questionsLeft, TOPICS, type InformantState, type Intel } from '../game/informant';
import { VOICES } from '../game/informantVoice';
import type { SaveData } from '../game/save';
import { FRAGMENTS, LOST, MEMORY_COUNT, lost } from '../game/story';
import { RoomBackdrop } from './RoomBackdrop';

interface InformantScreenProps {
  dungeonName: string;
  state: InformantState;
  save: SaveData;
  onChange: (state: InformantState, save: SaveData) => void; // 聞いたたびに呼ぶ（払った金貨はすぐ保存する）
  onLeave: () => void; // 忘れ物屋へ行く
}

export function InformantScreen({ dungeonName, state, save, onChange, onLeave }: InformantScreenProps) {
  const [error, setError] = useState<string | null>(null);
  const log = useRef<HTMLOListElement>(null);
  const left = questionsLeft(state);
  // 聞いたら、いちばん新しいやりとり（聞いたこと）が会話の枠のいちばん上に来るよう、自動で送る（長い答えでも、指でスクロールしなくても読み始められる）
  useEffect(() => {
    const asked = log.current?.querySelectorAll<HTMLElement>('.talk__line--hero');
    const latest = asked?.[asked.length - 1];
    if (!latest) return;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    latest.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
  }, [state.heard.length]);
  const vagueOk = canAskVaguely(state);

  const go = (topic: (typeof TOPICS)[number]['id'], clear: boolean) => {
    const r = ask(state, save, topic, clear);
    if (!r.ok) return setError(r.error);
    setError(null);
    onChange(r.value.state, r.value.save);
  };

  return (
    <main className="screen screen--narrow screen--fit talk">
      <RoomBackdrop save={save} />
      <header className="top">
        <div>
          <p className="top__run">
            {dungeonName}
          </p>
          <h1 className="top__title">情報屋</h1>
        </div>
        <p className="shop__gold" aria-live="polite">
          <span className="shop__gold-label">手持ちの{LOST.name}</span>
          {lost(save.gold)}
        </p>
      </header>

      {/* 会話：情報屋のあいさつと、聞いたことの答え。スマホでは、この枠の中だけを動かす */}
      <ol className="talk__log screen__scroll" aria-label="会話" aria-live="polite" ref={log}>
        <Line who="informant">
          {VOICES[state.tone ?? 0].greeting(dungeonName, INFORMANT_CONFIG.questions)}
        </Line>
        {state.heard.map((h, i) => (
          <Exchange key={i} intel={h} />
        ))}
        {left <= 0 && <Line who="informant">{VOICES[state.tone ?? 0].farewell}</Line>}
        {/* 5つの記憶がそろったあとは、帰り際に、あの子のかけらをこぼす */}
        {left <= 0 && save.memories.length >= MEMORY_COUNT && save.fragments > 0 && (
          <Line who="informant">{FRAGMENTS[Math.min(save.fragments, FRAGMENTS.length) - 1]}</Line>
        )}
      </ol>

      <p className="error talk__error" role="alert">
        {error}
      </p>

      <section className="talk__ask" aria-labelledby="talk-ask">
        <h2 id="talk-ask" className="shop__bag-title">
          聞く <span className="muted">あと{left}回</span>
        </h2>
        {left > 0 ? (
          <ul className="talk__questions">
            {TOPICS.map((t) => {
              const done = alreadyAsked(state, t.id);
              const price = priceOf(t.id);
              const short = price > save.gold;
              return (
                <li key={t.id} className="talk__question">
                  <span className="talk__q">「{t.ask}」</span>
                  <span className="talk__buttons">
                    {vagueOk && !done && (
                      <button type="button" className="talk__btn" onClick={() => go(t.id, false)}>
                        それとなく（無料）
                      </button>
                    )}
                    <button type="button" className={done || short ? 'talk__btn talk__btn--off' : 'primary talk__btn'} disabled={done || short} onClick={() => go(t.id, true)}>
                      {done ? '聞いた' : short ? `はっきり ${lost(price)}（足りない）` : `はっきり ${lost(price)}`}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">今日はもう聞けない。聞いたことは、{LOST.shop}の画面にメモとして残る。</p>
        )}
        <button type="button" className="primary shop__go" onClick={onLeave}>
          {LOST.shop}へ行く
        </button>
      </section>
    </main>
  );
}

function Exchange({ intel }: { intel: Intel }) {
  const topic = TOPICS.find((t) => t.id === intel.topic)!;
  return (
    <>
      <Line who="hero">
        {intel.vague ? '（それとなく）' : `（${LOST.name}を渡して）`}
        {topic.ask}
      </Line>
      <Line who="informant">{intel.text}</Line>
    </>
  );
}

function Line({ who, children }: { who: 'informant' | 'hero'; children: ReactNode }) {
  return (
    <li className={`talk__line talk__line--${who}`}>
      <span className="talk__who">{who === 'informant' ? '情報屋' : 'あなた'}</span>
      <p className="talk__text">{children}</p>
    </li>
  );
}
