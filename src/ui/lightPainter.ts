// 光の場面の canvas（docs/memory-movie.md）：上からの光の筋・舞い上がる（崩れると落ちる）光の粒・まぶしさ・光が崩れたあとの暗がり。
// 時刻と乱数から決まる値は lightMovie.ts・memoryMovie.ts。MemoryMovie.tsx が毎フレーム frame を呼ぶ。

import { LIGHT_CONFIG, moteLook, rayAlpha, rayShapes, stepMotes, type Mote } from './lightMovie';
import { encloseAt, flashAt, heartTimes, valueAt, type LightMovie } from './memoryMovie';
import { fillEnclose, sprite, type Painter } from './moviePaint';

const MOTE_STOPS = [
  [0, 'rgba(255,248,220,1)'],
  [0.35, 'rgba(255,220,140,0.6)'],
  [1, 'rgba(255,200,110,0)'],
] as const;

export function lightPainter(ctx: CanvasRenderingContext2D, movie: LightMovie): Painter {
  const rays = rayShapes();
  const moteArt = sprite(MOTE_STOPS, 24);
  const beats = heartTimes(movie);
  let motes: Mote[] = [];
  return {
    frame({ t, dt, w, h }) {
      const wide = Math.min(3, Math.max(1, w / 390));
      motes = stepMotes(motes, dt, valueAt(movie.motes, t) * wide, valueAt(movie.fall, t), w, h, Math.random);

      ctx.clearRect(0, 0, w, h);
      // 光の筋：画面の上の、さらに上から、扇のように差し込む。ゆっくりゆらめく
      const strength = valueAt(movie.rays, t);
      ctx.globalCompositeOperation = 'lighter';
      if (strength > 0.005) {
        const c = LIGHT_CONFIG.rays;
        const ox = w / 2;
        const oy = c.originY * h;
        const length = c.length * h;
        for (const ray of rays) {
          const a = rayAlpha(ray, t, strength);
          if (a <= 0.003) continue;
          ctx.save();
          ctx.translate(ox, oy);
          ctx.rotate(ray.angle + Math.sin(t * 0.13 + ray.phase) * 0.015);
          const grad = ctx.createLinearGradient(0, 0, 0, length);
          grad.addColorStop(0, `rgba(255, 238, 190, ${(0.38 * a).toFixed(3)})`);
          grad.addColorStop(0.55, `rgba(255, 215, 150, ${(0.14 * a).toFixed(3)})`);
          grad.addColorStop(1, 'rgba(255, 210, 140, 0)');
          ctx.fillStyle = grad;
          const near = w * 0.012;
          const far = ray.width * w;
          ctx.beginPath();
          ctx.moveTo(-near, 0);
          ctx.lineTo(near, 0);
          ctx.lineTo(far, length);
          ctx.lineTo(-far, length);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
      // 光の粒：あたたかく舞い上がり、ときどききらめく（光が崩れたあとは、落ちて消える）
      for (const m of motes) {
        const a = moteLook(m, t);
        if (a <= 0.01) continue;
        const d = m.size * 4;
        ctx.globalAlpha = a;
        ctx.drawImage(moteArt, m.x * w - d / 2, m.y - d / 2, d, d);
      }
      ctx.globalAlpha = 1;
      // まぶしさ：光の守護者が消える瞬間と、言葉が白く飛ぶ瞬間に、上の真ん中から、白い光があふれる
      const glare = flashAt(movie.impacts, t);
      if (glare > 0.005) {
        const r = Math.hypot(w, h) * 0.75;
        const grad = ctx.createRadialGradient(w / 2, h * 0.3, 0, w / 2, h * 0.3, r);
        grad.addColorStop(0, `rgba(255, 252, 240, ${Math.min(1, glare * 0.9).toFixed(3)})`);
        grad.addColorStop(0.5, `rgba(255, 240, 210, ${(glare * 0.35).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(255, 235, 200, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }
      // 光が崩れたあとの、冷たい暗がり
      ctx.globalCompositeOperation = 'source-over';
      fillEnclose(ctx, w, h, encloseAt(movie, beats, t), '0, 0, 0', 0.85);
    },
  };
}
