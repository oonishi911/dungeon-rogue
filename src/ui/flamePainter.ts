// 炎の場面の canvas（docs/memory-movie.md）：下で燃える炎・声の波・煙・火の粉・燃える言葉から上る火の粉・灰・四方から迫る闇。
// 時刻から決まる値は memoryMovie.ts。MemoryMovie.tsx が毎フレーム frame を呼ぶ。

import {
  MOVIE_CONFIG,
  ashLook,
  breakProgress,
  burnEmbers,
  burstEmbers,
  emberLook,
  encloseAt,
  fireAt,
  flameLook,
  heartTimes,
  ringsAt,
  smokeLook,
  stepAsh,
  stepEmbers,
  stepFlames,
  stepSmoke,
  valueAt,
  type Ember,
  type Flake,
  type Flame,
  type FlameMovie,
  type Puff,
} from './memoryMovie';
import { fillEnclose, sprite, type Painter } from './moviePaint';

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

export function flamePainter(ctx: CanvasRenderingContext2D, movie: FlameMovie): Painter {
  const flameArt = FLAME_STOPS.map((s) => sprite(s));
  const smokeArt = sprite(SMOKE_STOPS);
  const beats = heartTimes(movie);
  let embers: Ember[] = [];
  let flames: Flame[] = [];
  let smoke: Puff[] = [];
  let ash: Flake[] = [];
  let burnBox: { x0: number; x1: number; y0: number; y1: number } | null = null; // 燃える言葉の場所（燃え始めに測る。x は幅に対する割合、y は下から px）
  let lastT = 0;
  return {
    frame({ t, dt, w, h, wordBox }) {
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
        const bp = breakProgress(movie, t);
        if (bp > 0 && bp < 1) {
          if (!burnBox) {
            const r = wordBox();
            if (r && w > 0) burnBox = { x0: r.left / w, x1: r.right / w, y0: h - r.bottom, y1: h - r.top };
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
        fillEnclose(ctx, w, h, encloseAt(movie, beats, t), '0, 0, 0', 0.97);
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
    },
  };
}
