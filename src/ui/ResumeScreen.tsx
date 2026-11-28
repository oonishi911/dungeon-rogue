// 「続きから」の画面（2026-11-28、docs/resume.md）：前に中断した探索があるとき、ページを開いたときと、探索の画面の「中断してもどる」から来る。
// どこまで進んだか（ダンジョン・階・レベル・体力・いつ）を見せて、続きから遊ぶか、あきらめるか（確かめてから）を選ばせる

import { useState } from 'react';
import { summarizeRun } from '../game/runSummary';
import type { ResumedRun } from '../game/runSave';

interface ResumeScreenProps {
  run: ResumedRun;
  onContinue: () => void;
  /** あきらめる：リタイアしたことにして、持ち帰る分を数える（金貨は力尽きたときと同じだけ） */
  onGiveUp: () => void;
}

export function ResumeScreen({ run, onContinue, onGiveUp }: ResumeScreenProps) {
  const [sure, setSure] = useState(false);
  const sum = summarizeRun(run, Date.now());
  const hpRate = Math.max(0, Math.min(1, sum.hp / sum.maxHp));
  return (
    <main className="resume">
      <section className="resume__card" aria-labelledby="resume-title">
        <p className="resume__label">中断した探索があります{sum.ago && ` ・ ${sum.ago}`}</p>
        <h1 id="resume-title" className="resume__title">
          {sum.dungeonName}
        </h1>
        <p className="resume__floor">
          {sum.bossFloor ? '最深部' : `地下${sum.floor}階`}
          <span className="resume__floors"> / 全{sum.floors}階</span>
        </p>
        <div className="resume__hp" role="img" aria-label={`体力 ${sum.hp} / ${sum.maxHp}`}>
          <span className="resume__hp-fill" style={{ width: `${hpRate * 100}%` }} />
        </div>
        <dl className="resume__stats">
          <div>
            <dt>レベル</dt>
            <dd>{sum.level}</dd>
          </div>
          <div>
            <dt>体力</dt>
            <dd>
              {sum.hp} / {sum.maxHp}
            </dd>
          </div>
          <div>
            <dt>倒した敵</dt>
            <dd>{sum.defeated}</dd>
          </div>
          <div>
            <dt>金貨</dt>
            <dd>{sum.gold}</dd>
          </div>
          <div>
            <dt>歩いたターン</dt>
            <dd>{sum.turn}</dd>
          </div>
        </dl>
        {sure ? (
          <div className="resume__sure" role="alertdialog" aria-labelledby="resume-sure">
            <p id="resume-sure">あきらめると、この探索はここで終わります。金貨は、力尽きたときと同じだけ持ち帰ります。</p>
            <div className="resume__buttons">
              <button type="button" className="resume__second" onClick={() => setSure(false)}>
                やめる
              </button>
              <button type="button" className="resume__danger" onClick={onGiveUp}>
                あきらめる
              </button>
            </div>
          </div>
        ) : (
          <div className="resume__buttons">
            <button type="button" className="primary resume__go" autoFocus onClick={onContinue}>
              続きから
            </button>
            <button type="button" className="resume__second" onClick={() => setSure(true)}>
              あきらめる
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
