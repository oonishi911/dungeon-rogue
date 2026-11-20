// 記憶の「動く場面」（docs/memory-movie.md）：文章が出る時刻・画面の揺れ・光・火の粉を、1つの時計で動かす。
// 時刻から決まる値は memoryMovie.ts の関数（揺れ・光・フラッシュ・火の粉）。文字の出方は CSS（--at 秒の遅れ）。
// 描き直しは React を通さない（requestAnimationFrame で、画面の部品に直接書く）。

import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { MOVIE_CONFIG, emberLook, flashAt, glowAt, itemTimes, quakeAt, stepEmbers, valueAt, type Ember, type MovieDef } from './memoryMovie';
import type { ScrawlItem } from './scrawl';
import { InkFilter, ScrawlItemView, Scratches } from './ScrawlParts';

interface MemoryMovieProps {
  movie: MovieDef;
  items: ScrawlItem[];
  text: string; // 読み上げに渡す、きれいな文章
  echo: string;
  seed: string;
}

export function MemoryMovie({ movie, items, text, echo, seed }: MemoryMovieProps) {
  const body = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLElement>(null);
  const flash = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const times = useMemo(() => itemTimes(items.map((i) => i.kind), movie), [items, movie]);
  // 何番目の「行」か（loud の指定は、行の番号）
  const lineNo = useMemo(() => {
    let n = 0;
    return items.map((i) => (i.kind === 'line' ? n++ : -1));
  }, [items]);

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    let embers: Ember[] = [];
    const start = performance.now();
    let last = start;
    let raf = 0;
    const frame = (now: number) => {
      const t = (now - start) / 1000;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const q = quakeAt(movie.hits, t);
      if (body.current) body.current.style.transform = `translate(${q.x.toFixed(2)}px, ${q.y.toFixed(2)}px) rotate(${q.rot.toFixed(3)}deg)`;
      if (glow.current) glow.current.style.opacity = String(glowAt(movie, t));
      if (flash.current) flash.current.style.opacity = String(flashAt(movie.hits, t));
      embers = stepEmbers(embers, dt, valueAt(movie.embers, t), Math.random);
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (const e of embers) {
        const { x, alpha } = emberLook(e);
        ctx.fillStyle = `rgba(255, ${Math.round(110 + 90 * (1 - e.age / e.life))}, 50, ${(alpha * 0.9).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x * w, h - e.y, e.size, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [movie]);

  return (
    <>
      <i className="mm__glow" ref={glow} aria-hidden="true" />
      <canvas className="mm__embers" ref={canvas} aria-hidden="true" />
      <div className="memory__body mm__body" ref={body}>
        {/* 文字は荒れているので、読み上げには、きれいな文章を渡す */}
        <p className="sr-only">{text}</p>
        <InkFilter />
        <div className="scrawl mm__scrawl">
          {items.map((item, i) => (
            <ScrawlItemView key={i} item={item} index={i} at={times[i]} loud={movie.loud.includes(lineNo[i]!)} />
          ))}
          <Scratches seed={seed} at={movie.crossedAt + MOVIE_CONFIG.strikeDelay} />
        </div>
        <p className="memory__faint mm__echo" style={{ '--at': movie.echoAt } as CSSProperties}>
          {echo}
        </p>
      </div>
      <i className="mm__flash" ref={flash} aria-hidden="true" />
    </>
  );
}
