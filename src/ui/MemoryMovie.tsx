// 記憶の「動く場面」（docs/memory-movie.md）：文章が出る時刻・画面の揺れ・光・炎・煙・火の粉・灰・闇を、1つの時計で動かす。
// 時刻から決まる値は memoryMovie.ts の関数。文字の出方は CSS（--at 秒の遅れ）。
// 描き直しは React を通さない（requestAnimationFrame で、画面の部品と canvas に直接書く）。
// 音は、場面のはじめに、すべての音の予定を Web Audio に予約する（movieSound.ts）。場面を離れたら、予約した音ごと静かにする。
//
// 重ね順（下から）：後ろの光（DOM）→ canvas（炎・煙・火の粉・灰 → 四方から迫る闇 → 声の波）→ 文字 → 赤いフラッシュ → 冷めた色 → フィルムの粒

import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { openSoundBus } from '../audio/sound';
import {
  MOVIE_CONFIG,
  ashLook,
  burnEmbers,
  burnProgress,
  burstEmbers,
  driftAt,
  emberLook,
  encloseAt,
  fireAt,
  flameLook,
  flashAt,
  flickerAt,
  glowAt,
  heartTimes,
  itemTimes,
  kicksOf,
  punchAt,
  pulseAt,
  quakeAt,
  ringsAt,
  smokeLook,
  stepAsh,
  stepEmbers,
  stepFlames,
  stepSmoke,
  valueAt,
  writeSeconds,
  type Ember,
  type Flake,
  type Flame,
  type MovieDef,
  type Puff,
  type Write,
} from './memoryMovie';
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

/** やわらかい光の粒の絵（炎・煙）。はじめに1度だけ描いておく（毎フレーム、グラデーションを作らない） */
function sprite(stops: readonly (readonly [number, string])[]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    for (const [k, color] of stops) grad.addColorStop(k, color);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return c;
}

/** 炎の粒：熱い（黄色）・燃える（橙）・冷めた（赤）の3段 */
const FLAME_STOPS = [
  [
    [0, 'rgba(255,246,205,1)'],
    [0.25, 'rgba(255,205,95,0.85)'],
    [0.55, 'rgba(255,120,30,0.35)'],
    [1, 'rgba(255,60,10,0)'],
  ],
  [
    [0, 'rgba(255,185,80,0.95)'],
    [0.3, 'rgba(255,115,30,0.7)'],
    [0.65, 'rgba(200,50,10,0.25)'],
    [1, 'rgba(160,30,10,0)'],
  ],
  [
    [0, 'rgba(225,70,20,0.8)'],
    [0.4, 'rgba(160,30,10,0.4)'],
    [1, 'rgba(100,15,5,0)'],
  ],
] as const;
const SMOKE_STOPS = [
  [0, 'rgba(130,80,70,0.6)'],
  [0.5, 'rgba(85,48,42,0.28)'],
  [1, 'rgba(40,20,18,0)'],
] as const;

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
    scheduleMovieSound(bus.ctx, bus.out, movie, writes, bus.ctx.currentTime + 0.02); // 画面の時計と同じ瞬間に始まるよう、予約の余裕は小さく
    return bus.close;
  }, [movie, writes]);

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    if (grain.current) grain.current.style.backgroundImage = `url(${grainTile()})`;
    const flameArt = FLAME_STOPS.map((s) => sprite(s));
    const smokeArt = sprite(SMOKE_STOPS);
    const shakes = [...movie.hits, ...kicksOf(movie)]; // 声と、赤い線・燃え上がりの小さな揺れ
    const beats = heartTimes(movie);
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
    let embers: Ember[] = [];
    let flames: Flame[] = [];
    let smoke: Puff[] = [];
    let ash: Flake[] = [];
    let burnBox: { x0: number; x1: number; y0: number; y1: number } | null = null; // 燃える言葉の場所（燃え始めに測る。x は幅に対する割合、y は下から px）
    const start = performance.now();
    let last = start;
    let lastT = 0;
    let tick = 0;
    let raf = 0;
    const frame = (now: number) => {
      const t = (now - start) / 1000;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const beat = pulseAt(beats, t);
      const d = driftAt(t, movie.duration);
      const q = quakeAt(shakes, t);
      const scale = punchAt(movie.hits, t) * d.scale * (1 + beat * 0.008);
      if (body.current) body.current.style.transform = `translate(${(q.x + d.x).toFixed(2)}px, ${(q.y + d.y).toFixed(2)}px) rotate(${q.rot.toFixed(3)}deg) scale(${scale.toFixed(4)})`;
      const fl = flashAt(movie.hits, t);
      if (glow.current) glow.current.style.opacity = String(Math.min(1, glowAt(movie, t) * flickerAt(t) * (1 - beat * 0.12) + fl * 0.6));
      if (flash.current) flash.current.style.opacity = String(fl);
      // いまに戻る：冷めた色は、倒したボスの一文が出るときに置く（色を混ぜる層は重いので、それまでは置かない）
      if (grade.current && t >= movie.echoAt && grade.current.style.display !== 'block') grade.current.style.display = 'block';
      // フィルムの粒：少しずつ、ずらす（描き直さず、位置だけ動かす）
      if (grain.current && tick++ % 3 === 0) grain.current.style.transform = `translate(${Math.round(Math.random() * 160 - 80)}px, ${Math.round(Math.random() * 160 - 80)}px)`;

      // 粒を進める
      const fire = fireAt(movie, t);
      const wide = Math.min(3, Math.max(1, w / 390)); // 広い画面では、炎の数を増やす
      flames = stepFlames(flames, dt, MOVIE_CONFIG.fire.rate * fire * wide, fire, Math.random, Math.round(MOVIE_CONFIG.fire.max * wide));
      smoke = stepSmoke(smoke, dt, valueAt(movie.smoke, t), Math.random);
      embers = stepEmbers(embers, dt, valueAt(movie.embers, t), Math.random);
      // 声が響いた瞬間に、火の粉が下から噴き上がる
      for (const hit of movie.hits) if (hit.at > lastT && hit.at <= t) embers = [...embers, ...burstEmbers(hit.power, Math.random)].slice(-MOVIE_CONFIG.ember.max);
      lastT = t;
      // 言葉が燃えているあいだ、燃えている縁（下から上へ進む）から火の粉が上る
      const bp = burnProgress(movie, t);
      if (bp > 0 && bp < 1) {
        if (!burnBox) {
          const word = body.current?.querySelector('.scrawl__line--crossed');
          const cr = cv.getBoundingClientRect();
          const r = word?.getBoundingClientRect();
          if (r && w > 0) burnBox = { x0: (r.left - cr.left) / w, x1: (r.right - cr.left) / w, y0: cr.bottom - r.bottom, y1: cr.bottom - r.top };
        }
        if (burnBox) {
          const n = Math.floor(MOVIE_CONFIG.burn.embers * dt + Math.random());
          const edge = { x0: burnBox.x0, x1: burnBox.x1, y: burnBox.y0 + (burnBox.y1 - burnBox.y0) * bp };
          embers = [...embers, ...burnEmbers(edge, n, Math.random)].slice(-MOVIE_CONFIG.ember.max);
        }
      }
      ash = stepAsh(ash, dt, valueAt(movie.ash, t), h, Math.random);

      // 描く
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      // 炎の根元：下のふちが、勢いに応じて明るく燃える
      const base = h * MOVIE_CONFIG.fire.base * Math.min(2, fire);
      if (base > 1) {
        const grad = ctx.createLinearGradient(0, h, 0, h - base);
        grad.addColorStop(0, `rgba(255, 150, 60, ${(0.55 * Math.min(1, fire)).toFixed(3)})`);
        grad.addColorStop(0.4, `rgba(230, 70, 20, ${(0.3 * Math.min(1, fire)).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(160, 30, 10, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, h - base, w, base);
      }
      // 炎：縦長の舌。熱いうちは黄色く、上るにつれて赤く冷める
      for (const f of flames) {
        const look = flameLook(f);
        if (look.alpha <= 0.004) continue;
        const art = flameArt[look.heat < 0.35 ? 0 : look.heat < 0.7 ? 1 : 2]!;
        ctx.globalAlpha = look.alpha;
        ctx.drawImage(art, look.x * w - look.width / 2, h - f.y - look.height / 2, look.width, look.height);
      }
      // 煙：炎に下から照らされた、うすい赤茶のもや
      ctx.globalCompositeOperation = 'screen';
      for (const p of smoke) {
        const look = smokeLook(p);
        ctx.globalAlpha = look.alpha;
        ctx.drawImage(smokeArt, look.x * w - look.size / 2, h - p.y - look.size / 2, look.size, look.size);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'lighter';
      for (const e of embers) {
        const { x, alpha } = emberLook(e);
        ctx.fillStyle = `rgba(255, ${Math.round(110 + 90 * (1 - e.age / e.life))}, 50, ${(alpha * 0.9).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x * w, h - e.y, e.size, 0, Math.PI * 2);
        ctx.fill();
      }
      // 灰：上から、くるくる舞い落ちる
      ctx.globalCompositeOperation = 'source-over';
      for (const f of ash) {
        const look = ashLook(f);
        ctx.save();
        ctx.translate(f.x * w + look.dx, f.y);
        ctx.rotate(look.angle);
        ctx.fillStyle = `rgba(196, 188, 178, ${look.alpha.toFixed(3)})`;
        ctx.fillRect(-f.size, -f.size * 0.45, f.size * 2, f.size * 0.9);
        ctx.restore();
      }
      // 四方から迫る闇（布団の中）。心音の脈で、さらに少し迫る。文字は、この上にあるので読める
      const dark = encloseAt(movie, beats, t);
      if (dark > 0.005) {
        const outer = Math.hypot(w, h) * 0.62 * (1 - 0.62 * dark);
        const grad = ctx.createRadialGradient(w / 2, h * 0.42, outer * 0.28, w / 2, h * 0.42, outer);
        grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        grad.addColorStop(1, `rgba(0, 0, 0, ${Math.min(0.97, dark * 1.35).toFixed(3)})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }
      // 声の波：下の炎から、横に広い、ぼやけた光の帯が広がる。闇の上に描く（布団の中にいても、声は入ってくる）
      ctx.globalCompositeOperation = 'lighter';
      for (const ring of ringsAt(movie.hits, t)) {
        const r = MOVIE_CONFIG.ring.reach * h * ring.progress;
        const band = 18 + 60 * ring.progress;
        const outer = r + band;
        ctx.save();
        ctx.translate(w / 2, h + 30);
        ctx.scale(1, 0.55);
        const grad = ctx.createRadialGradient(0, 0, Math.max(0, r - band), 0, 0, outer);
        grad.addColorStop(0, 'rgba(255, 110, 40, 0)');
        grad.addColorStop(0.5, `rgba(255, 140, 60, ${ring.alpha.toFixed(3)})`);
        grad.addColorStop(1, 'rgba(255, 110, 40, 0)');
        ctx.fillStyle = grad;
        // 輪のある範囲だけ塗る（画面の外に出る部分と、輪の内側の届かない所は塗らない）
        const top = Math.min(outer, (h + 30) / 0.55);
        ctx.fillRect(-Math.min(outer, w / 2 + 1), -top, Math.min(outer, w / 2 + 1) * 2, top);
        ctx.restore();
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
        <div
          className="scrawl mm__scrawl"
          style={{ '--strike-delay': `${MOVIE_CONFIG.strikeDelay}s`, '--burn-at': `${movie.burnAt}s`, '--burn-for': `${movie.burnFor}s` } as CSSProperties}
        >
          {items.map((item, i) => (
            <ScrawlItemView key={i} item={item} index={i} at={times[i]} write={writeSeconds(writes[i]!)} loud={movie.loud.includes(lineNo[i]!)} />
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
