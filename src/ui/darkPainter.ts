// 闇の場面の canvas（docs/memory-movie.md）：夜の粒・墨のように迫る闇・小さな光（まわりの闇を押し返す）・墨に溶ける言葉のもや。
// 表現の約束（docs/story.md）：消えることを美しく描かない。小さな光は、現れてからは消えず、闇は光のまわりを残す。
// 時刻と乱数から決まる値は darkMovie.ts・memoryMovie.ts。MemoryMovie.tsx が毎フレーム frame を呼ぶ。

import { DARK_CONFIG, inkClouds, inkLook, nightMoteLook, smallLightPulse, stepNightMotes, stepWisps, wispLook, wispsFromBox, type NightMote, type Wisp } from './darkMovie';
import { encloseAt, heartTimes, valueAt, type DarkMovie } from './memoryMovie';
import { fillEnclose, sprite, type Painter } from './moviePaint';

const INK_STOPS = [
  [0, 'rgba(2,2,6,0.9)'],
  [0.55, 'rgba(3,3,8,0.55)'],
  [1, 'rgba(4,4,10,0)'],
] as const;
const CORE_STOPS = [
  [0, 'rgba(255,246,220,1)'],
  [0.3, 'rgba(255,214,150,0.8)'],
  [1, 'rgba(255,170,90,0)'],
] as const;
const HALO_STOPS = [
  [0, 'rgba(255,195,125,0.5)'],
  [0.4, 'rgba(235,155,105,0.18)'],
  [1, 'rgba(200,120,90,0)'],
] as const;
const WISP_STOPS = [
  [0, 'rgba(205,198,235,0.7)'],
  [0.5, 'rgba(170,160,210,0.25)'],
  [1, 'rgba(140,130,190,0)'],
] as const;

export function darkPainter(ctx: CanvasRenderingContext2D, movie: DarkMovie): Painter {
  const inkArt = sprite(INK_STOPS, 96);
  const coreArt = sprite(CORE_STOPS, 48);
  const haloArt = sprite(HALO_STOPS, 96);
  const wispArt = sprite(WISP_STOPS, 48);
  const clouds = inkClouds(Math.random);
  const beats = heartTimes(movie);
  // 墨の闇は、ぼやけてゆっくり動くので、半分の細かさの下書きに描き、1フレームおきに描き直す（重くならないように）
  const inkLayer = document.createElement('canvas');
  const inkCtx = inkLayer.getContext('2d');
  let inkTick = 0;
  let motes: NightMote[] = [];
  let wisps: Wisp[] = [];
  let lastT = 0;
  return {
    frame({ t, dt, w, h, wordBox }) {
      motes = stepNightMotes(motes, dt, valueAt(movie.motes, t) * Math.min(3, Math.max(1, w / 390)), w, h, Math.random);
      if (movie.breakAt > lastT && movie.breakAt <= t) {
        const r = wordBox();
        if (r) wisps = [...wisps, ...wispsFromBox({ x0: r.left, x1: r.right, y0: r.top, y1: r.bottom }, DARK_CONFIG.wisp.count, Math.random)];
      }
      wisps = stepWisps(wisps, dt);
      lastT = t;

      ctx.clearRect(0, 0, w, h);
      // 夜の粒：かすかに、あてもなく ただよう
      ctx.globalCompositeOperation = 'lighter';
      for (const m of motes) {
        const a = nightMoteLook(m, t);
        if (a <= 0.01) continue;
        ctx.fillStyle = `rgba(200, 195, 240, ${a.toFixed(3)})`;
        ctx.fillRect(m.x, m.y, m.size, m.size);
      }
      // 墨のように迫る闇：ふちから、ゆらぎながら染み込み、夜の粒を呑む
      ctx.globalCompositeOperation = 'source-over';
      const amount = encloseAt(movie, beats, t);
      fillEnclose(ctx, w, h, amount, '1, 1, 4', 0.92);
      if (amount > 0.01 && inkCtx) {
        const lw = Math.max(1, Math.round(w / 2));
        const lh = Math.max(1, Math.round(h / 2));
        if (inkLayer.width !== lw || inkLayer.height !== lh) {
          inkLayer.width = lw;
          inkLayer.height = lh;
          inkTick = 0;
        }
        if (inkTick++ % 2 === 0) {
          inkCtx.setTransform(0.5, 0, 0, 0.5, 0, 0);
          inkCtx.clearRect(0, 0, w, h);
          for (const c of clouds) {
            const look = inkLook(c, w, h, amount, t);
            inkCtx.globalAlpha = look.alpha;
            inkCtx.drawImage(inkArt, look.x - look.size / 2, look.y - look.size / 2, look.size, look.size);
          }
          inkCtx.globalAlpha = 1;
        }
        ctx.drawImage(inkLayer, 0, 0, w, h);
      }
      // 小さな光：現れてからは、消えない。まわりの闇を、そっと押し返す
      const intensity = valueAt(movie.smallLight, t);
      if (intensity > 0.002) {
        const L = DARK_CONFIG.light;
        const x = L.x * w;
        const y = L.y * h;
        const glow = smallLightPulse(t, intensity);
        const hole = L.size * L.halo * (0.7 + 0.5 * intensity);
        ctx.globalCompositeOperation = 'destination-out';
        const clear = ctx.createRadialGradient(x, y, 0, x, y, hole);
        clear.addColorStop(0, `rgba(0, 0, 0, ${Math.min(0.9, intensity * 1.3).toFixed(3)})`);
        clear.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = clear;
        ctx.fillRect(x - hole, y - hole, hole * 2, hole * 2);
        ctx.globalCompositeOperation = 'lighter';
        const halo = hole * 1.3;
        ctx.globalAlpha = Math.min(1, glow);
        ctx.drawImage(haloArt, x - halo, y - halo, halo * 2, halo * 2);
        const core = L.size * (0.8 + 0.4 * glow);
        ctx.drawImage(coreArt, x - core / 2, y - core / 2, core, core);
        ctx.globalAlpha = 1;
      }
      // 墨に溶ける言葉：うすい藤色のもやが、立ちのぼって広がる
      ctx.globalCompositeOperation = 'screen';
      for (const p of wisps) {
        const look = wispLook(p);
        if (look.alpha <= 0.003) continue;
        ctx.globalAlpha = look.alpha;
        ctx.drawImage(wispArt, p.x - look.size / 2, p.y - look.size / 2, look.size, look.size);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}
