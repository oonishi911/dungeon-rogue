// よみがえった記憶の画面。ボスを倒した直後に、1つ出る（story.ts）。
// 行は、1行ずつ静かに浮かび上がる（動きを減らす設定では、すぐ全部出る）。最後の記憶のあとには、物語の終わりが続く。

import { useState } from 'react';
import { BOSS_ECHOES, ENDING, MEMORIES, STORY_CONFIG } from '../game/story';
import type { EnemyId } from '../game/types';

interface MemoryScreenProps {
  index: number; // 何番めの記憶か（1〜）
  boss?: EnemyId; // 倒したばかりのボス（あれば、そのボスに合わせた一文を添える）
  doneLabel: string; // 閉じるボタンの文字
  onDone: () => void;
}

export function MemoryScreen({ index, boss, doneLabel, onDone }: MemoryScreenProps) {
  const memory = MEMORIES[index - 1];
  if (!memory) return null;
  const echo = boss ? BOSS_ECHOES[boss] : undefined;
  const last = index >= STORY_CONFIG.memories;
  // 行ごとに、少しずつ遅らせて出す
  const delay = (n: number) => ({ animationDelay: `${0.5 + n * 0.9}s` });
  const lines = [...memory.lines, ...(echo ? [echo] : [])];

  return (
    <main className="screen screen--narrow screen--fit memory">
      <header className="top">
        <div>
          <p className="top__run">
            記憶 {index}／{STORY_CONFIG.memories}
          </p>
          <h1 className="top__title">{memory.title}</h1>
        </div>
      </header>

      <section className="memory__body screen__scroll" aria-label={`記憶：${memory.title}`}>
        {lines.map((line, i) => (
          <p key={i} className={`memory__line${echo && i === lines.length - 1 ? ' memory__line--echo' : ''}`} style={delay(i)}>
            {line}
          </p>
        ))}
        {last && (
          <div className="memory__ending">
            {ENDING.map((line, i) => (
              <p key={i} className={`memory__line${line === '' ? ' memory__line--gap' : ''}`} style={delay(lines.length + 1 + i)}>
                {line}
              </p>
            ))}
          </div>
        )}
      </section>

      <button type="button" className="primary primary--wide" onClick={onDone}>
        {doneLabel}
      </button>
    </main>
  );
}

/** 思い出した記憶の一覧（ダンジョンを選ぶ画面から開く）。選ぶと、その記憶をもう一度読める */
export function MemoryLogScreen({ memories, onBack }: { memories: number; onBack: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  if (open !== null) return <MemoryScreen index={open} doneLabel="一覧に戻る" onDone={() => setOpen(null)} />;
  return (
    <main className="screen screen--narrow screen--fit">
      <header className="top">
        <div>
          <p className="top__run">
            思い出した記憶 {memories}／{STORY_CONFIG.memories}
          </p>
          <h1 className="top__title">記憶</h1>
        </div>
      </header>
      <ul className="choose__list screen__scroll" aria-label="思い出した記憶">
        {MEMORIES.map((m, i) => (
          <li key={m.title} className="choose__item">
            {i < memories ? (
              <button type="button" className="memory__item" onClick={() => setOpen(i + 1)}>
                <span className="memory__item-no">{i + 1}</span>
                {m.title}
              </button>
            ) : (
              <p className="memory__item memory__item--locked">
                <span className="memory__item-no">{i + 1}</span>
                まだ思い出せない
              </p>
            )}
          </li>
        ))}
      </ul>
      <button type="button" className="primary primary--wide" onClick={onBack}>
        ダンジョンを選ぶに戻る
      </button>
    </main>
  );
}
