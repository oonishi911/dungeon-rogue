// 記憶の画面：ボスを倒した直後に出す（ストーリー。docs/story.md）。
// 部屋の場面は、静かに浮かび上がる。記憶は、書きなぐった文字で出す（重ね書き・取り消し線・塗りつぶし。scrawl.ts）。
// 最後の記憶のあとは、最後の場面。ひとつずつ、タップで進む。

import { useState, type CSSProperties } from 'react';
import { MemoryMovie } from './MemoryMovie';
import { MOVIES, type MovieDef } from './memoryMovie';
import { scrawl, type ScrawlItem } from './scrawl';
import { InkFilter, ScrawlItemView, Scratches } from './ScrawlParts';
import type { Scene } from '../game/story';

interface MemoryScreenProps {
  scene: Scene;
  onDone: () => void;
}

type Page =
  | { kind: 'quiet'; lines: string[]; faint?: string } // 静かな文章。faint：最後に、うすく添える一文
  | { kind: 'scrawl'; items: ScrawlItem[]; text: string; echo: string; seed: string; movie?: MovieDef }; // movie：あれば、時間で動かす（memoryMovie.ts）

/** 動きを減らす設定のときは、動く場面にしない（これまでの記憶の画面のまま） */
const reduceMotion = (): boolean => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 場面を、ひとつずつ進む画面に分ける */
function pagesOf(scene: Scene): Page[] {
  if (scene.kind === 'fragment') return [{ kind: 'quiet', lines: scene.room, faint: scene.fragment }];
  const { memory } = scene;
  const pages: Page[] = [
    { kind: 'quiet', lines: scene.room },
    { kind: 'scrawl', items: scrawl(memory.lines, memory.crossed, scene.boss), text: memory.lines.join('\n'), echo: memory.echo, seed: scene.boss, movie: reduceMotion() ? undefined : MOVIES[scene.boss] },
  ];
  if (scene.ending) pages.push({ kind: 'quiet', lines: scene.ending });
  return pages;
}


export function MemoryScreen({ scene, onDone }: MemoryScreenProps) {
  const [pages] = useState(() => pagesOf(scene));
  const [at, setAt] = useState(0);
  const page = pages[at]!;
  const last = at === pages.length - 1;
  const next = () => (last ? onDone() : setAt(at + 1));

  return (
    <main
      className={`screen screen--narrow memory memory--${page.kind}${page.kind === 'scrawl' && page.movie ? ` memory--movie memory--${page.movie.style}` : ''}`}
      style={page.kind === 'scrawl' && page.movie ? ({ '--mm-duration': page.movie.duration } as CSSProperties) : undefined}
    >
      {/* ページが変わるたびに、最初から1行ずつ出し直す（key） */}
      {page.kind === 'scrawl' && page.movie ? (
        <MemoryMovie key={at} movie={page.movie} items={page.items} text={page.text} echo={page.echo} seed={page.seed} />
      ) : (
      <div className="memory__body" key={at}>
        {page.kind === 'quiet' ? (
          <div className="memory__quiet">
            {page.lines.map((line, i) => (
              <p key={i} style={{ '--i': i } as CSSProperties}>
                {line}
              </p>
            ))}
            {page.faint && (
              <p className="memory__faint" style={{ '--i': page.lines.length + 1 } as CSSProperties}>
                {page.faint}
              </p>
            )}
          </div>
        ) : (
          <>
            {/* 文字は荒れているので、読み上げには、きれいな文章を渡す */}
            <p className="sr-only">{page.text}</p>
            <InkFilter />
            <div className="scrawl">
              {page.items.map((item, i) => (
                <ScrawlItemView key={i} item={item} index={i} />
              ))}
              <Scratches seed={page.seed} />
            </div>
            <p className="memory__faint" style={{ '--i': page.items.length + 1 } as CSSProperties}>
              {page.echo}
            </p>
          </>
        )}
      </div>
      )}
      <button type="button" className="memory__next" onClick={next}>
        {last ? '目をさます' : 'つづける'}
      </button>
    </main>
  );
}
