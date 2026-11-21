// 鬼の場面の canvas（docs/memory-movie.md）：責める打撃の跡（輪とひび）・四方の暗がり・上下から押しつぶす帯・ほこり。
// 時刻と乱数から決まる値は ogreMovie.ts・memoryMovie.ts。MemoryMovie.tsx が毎フレーム frame を呼ぶ。

import { heartTimes, encloseAt, markPositions, valueAt, type OgreMovie } from './memoryMovie';
import { fillEnclose, type Painter } from './moviePaint';
import { OGRE_CONFIG, barDepth, dustBurst, dustLook, stampCracks, stampsAt, stepDust, type Dust } from './ogreMovie';

export function ogrePainter(ctx: CanvasRenderingContext2D, movie: OgreMovie): Painter {
  const beats = heartTimes(movie);
  const marks = markPositions(movie);
  let dust: Dust[] = [];
  let lastT = 0;
  const crossed = (at: number, t: number) => at > lastT && at <= t;
  return {
    frame({ t, dt, w, h, wordBox }) {
      // 粒を進める
      const wide = Math.min(3, Math.max(1, w / 390));
      movie.hits.forEach((hit, i) => {
        if (crossed(hit.at, t)) dust = [...dust, ...dustBurst(marks[i]!.x, marks[i]!.y * h, Math.round(20 * hit.power), Math.random)];
      });
      if (crossed(movie.breakAt, t)) {
        const r = wordBox();
        if (r && w > 0) dust = [...dust, ...dustBurst((r.left + r.right) / 2 / w, (r.top + r.bottom) / 2, 34, Math.random)];
      }
      if (crossed(movie.echoAt, t)) {
        // 膝をつく：下から、ほこりが大きく舞い上がり、上の帯からも落ちる
        for (let i = 0; i < 7; i++) dust = [...dust, ...dustBurst((i + 0.5) / 7, h * 0.97, 22, Math.random)];
        for (let i = 0; i < 5; i++) dust = [...dust, ...dustBurst((i + 0.5) / 5, h * 0.2, 12, Math.random)];
      }
      dust = stepDust(dust, dt, valueAt(movie.dust, t) * wide, w, h, Math.random).slice(-OGRE_CONFIG.dust.max * 2);
      lastT = t;

      // 描く
      ctx.clearRect(0, 0, w, h);
      // 打撃の跡：暗い赤の輪が、ぼやけて広がり、ひびが残って消える
      ctx.globalCompositeOperation = 'lighter';
      for (const s of stampsAt(movie.hits, t)) {
        const m = marks[s.index]!;
        const cx = m.x * w;
        const cy = m.y * h;
        const r = OGRE_CONFIG.stamp.reach * h * (0.6 + 0.4 * s.power) * s.progress;
        const band = 6 + 18 * s.progress;
        const grad = ctx.createRadialGradient(cx, cy, Math.max(0, r - band), cx, cy, r + band);
        grad.addColorStop(0, 'rgba(190, 50, 25, 0)');
        grad.addColorStop(0.5, `rgba(200, 60, 30, ${(0.5 * s.alpha).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(190, 50, 25, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - r - band, cy - r - band, (r + band) * 2, (r + band) * 2);
        ctx.strokeStyle = `rgba(230, 95, 50, ${(0.55 * s.alpha).toFixed(3)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        const reach = OGRE_CONFIG.stamp.reach * h * (0.6 + 0.4 * s.power) * Math.min(1, s.progress * 1.4);
        for (const c of stampCracks(s.index)) {
          ctx.moveTo(cx + Math.cos(c.angle) * reach * 0.15, cy + Math.sin(c.angle) * reach * 0.15);
          ctx.lineTo(cx + Math.cos(c.angle) * reach * c.length, cy + Math.sin(c.angle) * reach * c.length);
        }
        ctx.stroke();
      }
      // 膝をつく衝撃：下の真ん中から、大きな暗い赤の波が広がる
      const kneel = movie.impacts[movie.impacts.length - 1];
      if (kneel) {
        const k = (t - kneel.at) / 1.2;
        if (k >= 0 && k < 1) {
          const r = h * 0.9 * (1 - Math.pow(1 - k, 3));
          const band = 20 + 70 * k;
          ctx.save();
          ctx.translate(w / 2, h * 0.95);
          ctx.scale(1, 0.5);
          const grad = ctx.createRadialGradient(0, 0, Math.max(0, r - band), 0, 0, r + band);
          grad.addColorStop(0, 'rgba(200, 60, 30, 0)');
          grad.addColorStop(0.5, `rgba(210, 70, 35, ${(0.55 * Math.pow(1 - k, 1.5)).toFixed(3)})`);
          grad.addColorStop(1, 'rgba(200, 60, 30, 0)');
          ctx.fillStyle = grad;
          ctx.fillRect(-r - band, -r - band, (r + band) * 2, r + band);
          ctx.restore();
        }
      }
      // 四方の暗がり（責める声が、自分の中に入ってくるほど、暗くなる）
      ctx.globalCompositeOperation = 'source-over';
      fillEnclose(ctx, w, h, encloseAt(movie, beats, t), '0, 0, 0', 0.9);
      // 上下から押しつぶす帯：ふちは黒く、内側の縁に、暗い赤の光
      const depth = barDepth(movie, t) * h;
      if (depth > 0.5) {
        for (const top of [true, false]) {
          const y0 = top ? 0 : h - depth;
          const edge = top ? depth : h - depth;
          const grad = ctx.createLinearGradient(0, top ? 0 : h, 0, edge);
          grad.addColorStop(0, 'rgba(4, 2, 2, 1)');
          grad.addColorStop(0.85, 'rgba(14, 5, 4, 0.97)');
          grad.addColorStop(1, 'rgba(30, 9, 6, 0.9)');
          ctx.fillStyle = grad;
          ctx.fillRect(0, y0, w, depth);
          const glow = ctx.createLinearGradient(0, edge, 0, edge + (top ? 22 : -22));
          glow.addColorStop(0, 'rgba(190, 55, 28, 0.6)');
          glow.addColorStop(1, 'rgba(160, 40, 20, 0)');
          ctx.fillStyle = glow;
          ctx.fillRect(0, top ? edge : edge - 22, w, 22);
          ctx.fillStyle = 'rgba(230, 110, 70, 0.55)'; // 縁の、熱をもった細い線
          ctx.fillRect(0, top ? edge - 1 : edge, w, 1.5);
        }
      }
      // ほこり：細かく落ち、打撃で舞い散る
      for (const d of dust) {
        const a = dustLook(d);
        if (a <= 0.01) continue;
        ctx.fillStyle = `rgba(205, 175, 150, ${a.toFixed(3)})`;
        ctx.fillRect(d.x * w, d.y, d.size, d.size);
      }
    },
  };
}
