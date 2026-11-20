// 記憶の画面で使う「書きなぐった文字」の部品（MemoryScreen.tsx と、動く場面の MemoryMovie.tsx が使う）。決め方は scrawl.ts

import type { CSSProperties } from 'react';
import { INK_FILTER, SCRAWL_CONFIG, scratches, type Glyph, type ScrawlItem } from './scrawl';

const glyphStyle = (g: Glyph): CSSProperties =>
  ({ '--r': `${g.rot}deg`, '--x': `${g.dx}em`, '--y': `${g.dy}em`, fontSize: `${g.size}em` }) as CSSProperties;

function Glyphs({ glyphs }: { glyphs: Glyph[] }) {
  return (
    <>
      {glyphs.map((g, i) => (
        <span key={i} className="scrawl__ch" style={glyphStyle(g)} aria-hidden="true">
          {g.ch}
          {g.over.map((o, k) => (
            <span key={k} className="scrawl__over" style={{ '--r': `${o.rot}deg`, '--x': `${o.dx}em`, '--y': `${o.dy}em` } as CSSProperties}>
              {g.ch}
            </span>
          ))}
        </span>
      ))}
    </>
  );
}

/** 文字の絵を1つ出す。at：動く場面で、出る時刻（秒）。ないときは、番号 index の順に、一定の間をあけて出る。loud：大きな声で、文字がふるえる */
export function ScrawlItemView({ item, index, at, loud }: { item: ScrawlItem; index: number; at?: number; loud?: boolean }) {
  const style = { '--i': index, '--tilt': `${item.tilt}deg`, '--shift': `${item.shift}%`, ...(at === undefined ? {} : { '--at': at }) } as CSSProperties;
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
    <p className={loud ? 'scrawl__line scrawl__line--loud' : 'scrawl__line'} style={style} aria-hidden="true">
      <Glyphs glyphs={item.glyphs} />
    </p>
  );
}

/** 文字を「絵」に変える墨のフィルタ：輪郭をゆがめて筆の跡のようにし、粒状にかすれさせる（scrawl.css の .scrawl が使う） */
export function Scratches({ seed, at }: { seed: string; at?: number }) {
  return (
    <svg className="scrawl__scratches" style={at === undefined ? undefined : ({ '--at': at } as CSSProperties)} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {scratches(seed).map((sc, i) => (
        <polyline key={i} points={sc.points.map(([x, y]) => `${x},${y}`).join(' ')} style={{ '--i': i } as CSSProperties} />
      ))}
    </svg>
  );
}

export function InkFilter() {
  const ink = SCRAWL_CONFIG.ink;
  return (
    <svg className="scrawl__defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <filter id={INK_FILTER} x="-6%" y="-10%" width="112%" height="120%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency={ink.warpFreq} numOctaves="2" seed="4" result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale={ink.warpScale} xChannelSelector="R" yChannelSelector="G" result="wobbly" />
          <feTurbulence type="fractalNoise" baseFrequency={`${ink.grainX} ${ink.grainY}`} numOctaves="2" seed="11" result="grain" />
          {/* 粒のノイズを、白黒に近づけて、欠ける場所のマスクにする（赤の値が cut より小さいところが欠ける） */}
          <feColorMatrix in="grain" type="matrix" values={`0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  9 0 0 0 ${-9 * ink.grainCut}`} result="mask" />
          <feComposite in="wobbly" in2="mask" operator="in" />
        </filter>
      </defs>
    </svg>
  );
}
