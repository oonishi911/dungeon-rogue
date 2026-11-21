// 記憶の「動く場面」（docs/memory-movie.md）：文章が出る時刻・画面の揺れ・光・粒・闇（霜）を、1つの時計で動かす。
// 時刻から決まる値は memoryMovie.ts の関数。文字の出方は CSS（--at 秒の遅れ）。
// 描き直しは React を通さない（requestAnimationFrame で、画面の部品と canvas に直接書く）。canvas の描き方は場面の型ごと（flamePainter.ts・icePainter.ts）。
// 音は、場面のはじめに、すべての音の予定を Web Audio に予約する（movieSound.ts）。場面を離れたら、予約した音ごと静かにする。
//
// 重ね順（下から）：後ろの光（DOM）→ canvas（型ごとの粒 → 四方から迫る闇・霜 → 声の波）→ 文字 → フラッシュ → 冷めた色 → フィルムの粒

import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { openSoundBus } from '../audio/sound';
import { darkPainter } from './darkPainter';
import { flamePainter } from './flamePainter';
import { icePainter } from './icePainter';
import { lightPainter } from './lightPainter';
import {
  MOVIE_CONFIG,
  driftAt,
  flashAt,
  flickerAt,
  glowAt,
  heartTimes,
  itemTimes,
  motionOf,
  punchAt,
  pulseAt,
  quakeAt,
  writeSeconds,
  type MovieDef,
  type Write,
} from './memoryMovie';
import type { Painter, WordBox } from './moviePaint';
import { ogrePainter } from './ogrePainter';
import { scheduleMovieSound } from './movieSound';
import type { ScrawlItem } from './scrawl';
import { InkFilter, ScrawlItemView, Scratches } from './ScrawlParts';

interface MemoryMovieProps {
  movie: MovieDef;
  items: ScrawlItem[];
  text: string; // 読み上げに渡す、きれいな文章
  echo: string;
  seed: string;
}

/** フィルムの粒（細かいノイズの絵）。1度だけ作って、使い回す */
let grainUrl: string | null = null;
function grainTile(): string {
  if (grainUrl) return grainUrl;
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 160;
  const g = c.getContext('2d');
  if (!g) return '';
  const img = g.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() < 0.5 ? 0 : 255;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = Math.random() * 70;
  }
  g.putImageData(img, 0, 0);
  grainUrl = c.toDataURL();
  return grainUrl;
}

/** 場面の型ごとの、canvas の描き方 */
function painterOf(ctx: CanvasRenderingContext2D, movie: MovieDef): Painter {
  switch (movie.style) {
    case 'flame':
      return flamePainter(ctx, movie);
    case 'ice':
      return icePainter(ctx, movie);
    case 'ogre':
      return ogrePainter(ctx, movie);
    case 'light':
      return lightPainter(ctx, movie);
    case 'dark':
      return darkPainter(ctx, movie);
  }
}

/** 型ごとの、CSS に渡す時刻（秒）：光が崩れる・責める声が重なる・いまに戻る */
function styleVars(movie: MovieDef): Record<string, string> {
  const vars: Record<string, string> = { '--echo-at': `${movie.echoAt}s` };
  if (movie.style === 'ice') vars['--frost-at'] = `${movie.frostAt}s`;
  if (movie.style === 'light') vars['--collapse-at'] = `${movie.collapseAt}s`;
  if (movie.style === 'ogre') vars['--merge-at'] = `${movie.mergeAt}s`;
  return vars;
}

export function MemoryMovie({ movie, items, text, echo, seed }: MemoryMovieProps) {
  const body = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLElement>(null);
  const flash = useRef<HTMLElement>(null);
  const grain = useRef<HTMLElement>(null);
  const grade = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const times = useMemo(() => itemTimes(items.map((i) => i.kind), movie), [items, movie]);
  // 文字の絵ごとの、書かれていく長さ（画面の出方と、チョークの音が同じ長さを使う）
  const writes = useMemo<Write[]>(() => items.map((i) => ({ kind: i.kind, chars: i.kind === 'black' ? 0 : i.glyphs.length })), [items]);
  // 何番目の「行」か（loud の指定は、行の番号）
  const lineNo = useMemo(() => {
    let n = 0;
    return items.map((i) => (i.kind === 'line' ? n++ : -1));
  }, [items]);

  // 音：場面のはじめに予約する（音がオフ・準備前なら鳴らさない）。離れたら、すぐ静かにする
  useEffect(() => {
    const bus = openSoundBus();
    if (!bus) return;
    scheduleMovieSound(bus.ctx, bus.out, movie, writes, bus.ctx.currentTime + 0.02, { seed }); // 画面の時計と同じ瞬間に始まるよう、予約の余裕は小さく。seed：赤い線の向き
    return bus.close;
  }, [movie, writes, seed]);

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    if (grain.current) grain.current.style.backgroundImage = `url(${grainTile()})`;
    const painter = painterOf(ctx, movie);
    // 揺れ・迫り・フラッシュ（色は CSS）は、型ごと（memoryMovie.ts の motionOf）
    const { shakes, pushes, flashes, flicker } = motionOf(movie);
    const beats = heartTimes(movie);
    /** 書いては消した言葉の場所（canvas の左上から px） */
    const wordBox = (): WordBox | null => {
      const r = body.current?.querySelector('.scrawl__line--crossed')?.getBoundingClientRect();
      if (!r) return null;
      const cr = cv.getBoundingClientRect();
      return { left: r.left - cr.left, right: r.right - cr.left, top: r.top - cr.top, bottom: r.bottom - cr.top };
    };
    let w = 0;
    let h = 0;
    const resize = () => {
      // 炎・煙・闇は、ぼやけた光なので、細かく描かなくてよい（スマホでも重くならないよう、画面の点の細かさにかかわらず1倍で描く）
      const dpr = 1;
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const start = performance.now();
    let last = start;
    let tick = 0;
    let raf = 0;
    const frame = (now: number) => {
      const t = (now - start) / 1000;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const beat = pulseAt(beats, t);
      const d = driftAt(t, movie.duration);
      const q = quakeAt(shakes, t);
      const scale = punchAt(pushes, t) * d.scale * (1 + beat * 0.008);
      if (body.current) body.current.style.transform = `translate(${(q.x + d.x).toFixed(2)}px, ${(q.y + d.y).toFixed(2)}px) rotate(${q.rot.toFixed(3)}deg) scale(${scale.toFixed(4)})`;
      const fl = flashAt(flashes, t);
      // 後ろの光：炎はゆらめき、声で明るくなる。氷は静かで、呼ぶ声で少しだけ明るくなる
      const light =
        movie.style === 'flame'
          ? glowAt(movie, t) * (flicker ? flickerAt(t) : 1) * (1 - beat * 0.12) + fl * 0.6
          : glowAt(movie, t) * (1 - beat * 0.08) + (movie.style === 'ice' ? flashAt(movie.hits, t) * 0.35 : 0) + fl * 0.4;
      if (glow.current) glow.current.style.opacity = String(Math.min(1, light));
      if (flash.current) flash.current.style.opacity = String(fl);
      // いまに戻る：冷めた色は、倒したボスの一文が出るときに置く（色を混ぜる層は重いので、それまでは置かない）
      if (grade.current && t >= movie.echoAt && grade.current.style.display !== 'block') grade.current.style.display = 'block';
      // フィルムの粒：少しずつ、ずらす（描き直さず、位置だけ動かす）
      if (grain.current && tick++ % 3 === 0) grain.current.style.transform = `translate(${Math.round(Math.random() * 160 - 80)}px, ${Math.round(Math.random() * 160 - 80)}px)`;

      painter.frame({ t, dt, w, h, wordBox });
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
        <div
          className="scrawl mm__scrawl"
          style={
            {
              '--strike-delay': `${MOVIE_CONFIG.strikeDelay}s`,
              '--break-at': `${movie.breakAt}s`,
              '--break-for': `${movie.breakFor}s`,
              ...styleVars(movie),
            } as CSSProperties
          }
        >
          {items.map((item, i) => (
            <ScrawlItemView
              key={i}
              item={item}
              index={i}
              at={times[i]}
              write={writeSeconds(writes[i]!)}
              loud={movie.loud.includes(lineNo[i]!)}
              extraClass={lineNo[i]! >= 0 ? `mm-line-${lineNo[i]}` : undefined}
            />
          ))}
          <Scratches seed={seed} at={movie.crossedAt + MOVIE_CONFIG.strikeDelay} />
        </div>
        <p className="memory__faint mm__echo" style={{ '--at': movie.echoAt } as CSSProperties}>
          {echo}
        </p>
      </div>
      <i className="mm__flash" ref={flash} aria-hidden="true" />
      <i className="mm__grade" ref={grade} aria-hidden="true" />
      <i className="mm__grain" ref={grain} aria-hidden="true" />
    </>
  );
}
