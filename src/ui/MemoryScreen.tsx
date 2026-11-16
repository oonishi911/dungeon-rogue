// 記憶の画面：ボスを倒した直後に出す（ストーリー。docs/story.md）。
// 部屋の場面は、静かに浮かび上がる。記憶は、書きなぐった文字で出す（重ね書き・取り消し線・塗りつぶし。scrawl.ts）。
// 最後の記憶のあとは、最後の場面。ひとつずつ、タップで進む。

import { useState, type CSSProperties } from 'react';
import { scrawl, type Glyph, type ScrawlItem } from './scrawl';
import type { Scene } from '../game/story';

interface MemoryScreenProps {
  scene: Scene;
  onDone: () => void;
}

type Page =
  | { kind: 'quiet'; lines: string[]; faint?: string } // 静かな文章。faint：最後に、うすく添える一文
  | { kind: 'scrawl'; items: ScrawlItem[]; text: string; echo: string };

/** 場面を、ひとつずつ進む画面に分ける */
function pagesOf(scene: Scene): Page[] {
  if (scene.kind === 'fragment') return [{ kind: 'quiet', lines: scene.room, faint: scene.fragment }];
  const { memory } = scene;
  const pages: Page[] = [
    { kind: 'quiet', lines: scene.room },
    { kind: 'scrawl', items: scrawl(memory.lines, memory.crossed, scene.boss), text: memory.lines.join('\n'), echo: memory.echo },
  ];
  if (scene.ending) pages.push({ kind: 'quiet', lines: scene.ending });
  return pages;
}


const glyphStyle = (g: Glyph): CSSProperties =>
  ({ '--r': `${g.rot}deg`, '--x': `${g.dx}em`, '--y': `${g.dy}em`, fontSize: `${g.size}em` }) as CSSProperties;

function Glyphs({ glyphs }: { glyphs: Glyph[] }) {
  return (
    <>
      {glyphs.map((g, i) => (
        <span key={i} className="scrawl__ch" style={glyphStyle(g)} aria-hidden="true">
          {g.ch}
          {g.over && (
            <span className="scrawl__over" style={{ '--r': `${g.over.rot}deg`, '--x': `${g.over.dx}em`, '--y': `${g.over.dy}em` } as CSSProperties}>
              {g.ch}
            </span>
          )}
        </span>
      ))}
    </>
  );
}

function ScrawlItemView({ item, index }: { item: ScrawlItem; index: number }) {
  const style = { '--i': index, '--tilt': `${item.tilt}deg`, '--shift': `${item.shift}%` } as CSSProperties;
  if (item.kind === 'black') {
    const s = item.shape;
    const clip = `polygon(0% ${s[0]}%, 33% ${s[1]}%, 66% ${s[2]}%, 100% ${s[3]}%, 100% ${100 - s[4]!}%, 66% ${100 - s[5]!}%, 33% ${100 - s[6]!}%, 0% ${100 - s[7]!}%)`;
    return <div className="scrawl__black" style={{ ...style, width: `${item.width * 100}%`, clipPath: clip }} aria-hidden="true" />;
  }
  if (item.kind === 'crossed') {
    const n = item.zig.length;
    const points = item.zig.map((y, i) => `${(i / (n - 1)) * 100},${y * 100}`).join(' ');
    return (
      <p className="scrawl__line scrawl__line--crossed" style={style} aria-hidden="true">
        <Glyphs glyphs={item.glyphs} />
        <svg className="scrawl__strike" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline points={points} fill="none" />
        </svg>
      </p>
    );
  }
  return (
    <p className="scrawl__line" style={style} aria-hidden="true">
      <Glyphs glyphs={item.glyphs} />
    </p>
  );
}

export function MemoryScreen({ scene, onDone }: MemoryScreenProps) {
  const [pages] = useState(() => pagesOf(scene));
  const [at, setAt] = useState(0);
  const page = pages[at]!;
  const last = at === pages.length - 1;
  const next = () => (last ? onDone() : setAt(at + 1));

  return (
    <main className={`screen screen--narrow memory memory--${page.kind}`}>
      {/* ページが変わるたびに、最初から1行ずつ出し直す（key） */}
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
            <div className="scrawl">
              {page.items.map((item, i) => (
                <ScrawlItemView key={i} item={item} index={i} />
              ))}
            </div>
            <p className="memory__faint" style={{ '--i': page.items.length + 1 } as CSSProperties}>
              {page.echo}
            </p>
          </>
        )}
      </div>
      <button type="button" className="memory__next" onClick={next}>
        {last ? '目をさます' : 'つづける'}
      </button>
    </main>
  );
}
