// 氷の場面の canvas（docs/memory-movie.md）：降る雪（凍って宙で止まり、きらめく）・白い息・四方から迫る霜・呼ぶ声の波・氷の欠片。
// 時刻と乱数から決まる値は iceMovie.ts・memoryMovie.ts。MemoryMovie.tsx が毎フレーム frame を呼ぶ。

import { ICE_CONFIG, frostBranches, mistLook, mistPuff, ripplesAt, shardLook, shardsFromBox, shardsFromEdges, snowLook, stepMist, stepShards, stepSnow, type Mist, type Shard, type Snowflake } from './iceMovie';
import { MOVIE_CONFIG, heartTimes, mistTimes, pulseAt, valueAt, type IceMovie } from './memoryMovie';
import { fillEnclose, sprite, type Painter } from './moviePaint';

/** 雪のひとひら：やわらかい白い点 */
const FLAKE_STOPS = [
  [0, 'rgba(235,244,252,1)'],
  [0.55, 'rgba(225,238,250,0.75)'],
  [1, 'rgba(225,238,250,0)'],
] as const;

const MIST_STOPS = [
  [0, 'rgba(235,245,255,0.75)'],
  [0.45, 'rgba(210,228,245,0.32)'],
  [1, 'rgba(190,210,235,0)'],
] as const;

/** 霜の模様の絵：画面の四方のふちから内へ伸びる、細い枝と、ふちの白いくもり（画面の大きさごとに、1度だけ描く） */
function frostTexture(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const g = c.getContext('2d');
  if (!g) return c;
  // ふちの白いくもり
  const fog = g.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.25, w / 2, h * 0.45, Math.hypot(w, h) * 0.6);
  fog.addColorStop(0, 'rgba(200, 225, 245, 0)');
  fog.addColorStop(1, 'rgba(200, 225, 245, 0.2)');
  g.fillStyle = fog;
  g.fillRect(0, 0, w, h);
  // 結晶：太くうすい光をにじませてから、細くはっきり描く（氷が光をふくむように）
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const branches = frostBranches(w, h, Math.random);
  for (const [spread, glow] of [
    [3.2, 0.18],
    [1, 1],
  ] as const) {
    for (const b of branches) {
      g.strokeStyle = `rgba(232, 245, 255, ${(b.alpha * glow).toFixed(3)})`;
      g.lineWidth = b.width * spread;
      g.beginPath();
      b.points.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
      g.stroke();
    }
  }
  return c;
}

export function icePainter(ctx: CanvasRenderingContext2D, movie: IceMovie): Painter {
  const mistArt = sprite(MIST_STOPS);
  const flakeArt = sprite(FLAKE_STOPS, 16);
  const beats = heartTimes(movie);
  const puffs = mistTimes(movie);
  const layer = document.createElement('canvas'); // 霜を、迫り方の形に切り抜くための下書き
  const layerCtx = layer.getContext('2d');
  let tex: HTMLCanvasElement | null = null;
  let layerFrost = -1; // 下書きを作ったときの霜の量（変わったときだけ作り直す）
  let snow: Snowflake[] = [];
  let mist: Mist[] = [];
  let shards: Shard[] = [];
  let lastT = 0;
  const crossed = (at: number, t: number) => at > lastT && at <= t;
  return {
    frame({ t, dt, w, h, wordBox }) {
      const speed = valueAt(movie.freeze, t);
      // 粒を進める
      const wide = Math.min(3, Math.max(1, w / 390));
      snow = stepSnow(snow, dt, valueAt(movie.snow, t) * wide, speed, h, Math.random);
      for (const at of puffs) if (crossed(at, t)) mist = [...mist, ...mistPuff(Math.random)];
      mist = stepMist(mist, dt, w);
      if (crossed(movie.breakAt, t)) {
        const r = wordBox();
        if (r) shards = [...shards, ...shardsFromBox({ x0: r.left, x1: r.right, y0: r.top, y1: r.bottom }, ICE_CONFIG.shard.fromWord, Math.random)];
      }
      if (crossed(movie.echoAt, t)) shards = [...shards, ...shardsFromEdges(w, h, Math.round(ICE_CONFIG.shard.fromEdges * wide), Math.random)];
      shards = stepShards(shards, dt);
      lastT = t;

      // 描く
      ctx.clearRect(0, 0, w, h);
      // 雪：奥の小さな粒は薄く遅く、手前の大きな粒は濃く速い。止まると、ときどききらりと光る
      ctx.globalCompositeOperation = 'source-over';
      for (const f of snow) {
        const look = snowLook(f, t, speed);
        const x = f.x * w + look.dx;
        const d = f.size * 2.4; // やわらかい点なので、少し大きめに置く
        ctx.globalAlpha = look.alpha;
        ctx.drawImage(flakeArt, x - d / 2, f.y - d / 2, d, d);
        ctx.globalAlpha = 1;
        if (look.glint > 0.05) {
          const s = 3 + f.size * 3 * look.glint;
          ctx.strokeStyle = `rgba(255, 255, 255, ${(0.9 * look.glint).toFixed(3)})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(x - s, f.y);
          ctx.lineTo(x + s, f.y);
          ctx.moveTo(x, f.y - s);
          ctx.lineTo(x, f.y + s);
          ctx.stroke();
        }
      }
      // 白い息：下の真ん中から、もやが上って、消える
      ctx.globalCompositeOperation = 'screen';
      for (const m of mist) {
        const look = mistLook(m);
        if (look.alpha <= 0.003) continue;
        ctx.globalAlpha = look.alpha;
        ctx.drawImage(mistArt, look.x * w - look.size / 2, h - m.y - look.size / 2, look.size, look.size);
      }
      ctx.globalAlpha = 1;
      // 霜：四方のふちから迫る。文字は、この上にあるので読める。
      // 霜の形（下書き）は、霜の量が変わったときだけ作り直す（毎フレーム作ると重い）。心音の脈は、濃さだけで表す
      const frost = Math.round(valueAt(movie.enclose, t) / 0.015) * 0.015; // 霜の量は、目に見えない細かさで区切る（作り直しを減らす）
      if (frost > 0.005 && layerCtx) {
        if (!tex || tex.width !== Math.round(w) || tex.height !== Math.round(h)) {
          tex = frostTexture(w, h);
          layer.width = tex.width;
          layer.height = tex.height;
          layerFrost = -1;
        }
        if (frost !== layerFrost) {
          layerCtx.globalCompositeOperation = 'source-over';
          layerCtx.clearRect(0, 0, w, h);
          fillEnclose(layerCtx, w, h, frost * 0.7, '140, 175, 205', 0.16); // 冷えて、ふちが白くかすむ
          layerCtx.drawImage(tex, 0, 0);
          layerCtx.globalCompositeOperation = 'destination-in';
          // 霜は、ふちに留まる（真ん中の文字のまわりまでは来ない）
          const outer = Math.hypot(w, h) * 0.6 * (1 - 0.42 * frost);
          const mask = layerCtx.createRadialGradient(w / 2, h * 0.45, outer * 0.62, w / 2, h * 0.45, outer);
          mask.addColorStop(0, 'rgba(0, 0, 0, 0)');
          mask.addColorStop(1, 'rgba(0, 0, 0, 1)');
          layerCtx.fillStyle = mask;
          layerCtx.fillRect(0, 0, w, h);
          layerFrost = frost;
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = Math.min(1, frost * 1.6 * (1 + pulseAt(beats, t) * MOVIE_CONFIG.heart.enclose * 2));
        ctx.drawImage(layer, 0, 0);
        ctx.globalAlpha = 1;
      }
      // 呼ぶ声の波：真ん中から細い輪が広がり、どこにも届かずに消える（少し遅れて、もう1本。こだま）
      ctx.globalCompositeOperation = 'lighter';
      for (const [delay, k] of [
        [0, 1],
        [0.35, 0.45],
      ] as const) {
        for (const r of ripplesAt(movie.hits, t - delay)) {
          const radius = ICE_CONFIG.ripple.reach * h * r.progress;
          const band = 5 + 22 * r.progress; // 広がるほど、ぼやける
          const outer = radius + band;
          ctx.save();
          ctx.translate(w / 2, h * 0.45);
          ctx.scale(1, 0.8);
          const grad = ctx.createRadialGradient(0, 0, Math.max(0, radius - band), 0, 0, outer);
          grad.addColorStop(0, 'rgba(190, 225, 255, 0)');
          grad.addColorStop(0.5, `rgba(205, 232, 255, ${(r.alpha * k * 0.7).toFixed(3)})`);
          grad.addColorStop(1, 'rgba(190, 225, 255, 0)');
          ctx.fillStyle = grad;
          ctx.fillRect(-outer, -outer, outer * 2, outer * 2);
          ctx.restore();
        }
      }
      // 氷の欠片：とがった、ふぞろいな形。回りながら落ち、ときどききらりと光る（塗りと縁取りを、まとめて2回に分けて描く）
      const outline = (sh: Shard) => {
        const cos = Math.cos(sh.rot);
        const sin = Math.sin(sh.rot);
        ctx.setTransform(cos, sin, -sin, cos, sh.x, sh.y);
        ctx.beginPath();
        sh.corners.forEach((r, i) => {
          const a = (i / sh.corners.length) * Math.PI * 2;
          const px = Math.cos(a) * sh.size * r;
          const py = Math.sin(a) * sh.size * r * 0.7;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
      };
      ctx.globalCompositeOperation = 'source-over';
      for (const sh of shards) {
        outline(sh);
        ctx.fillStyle = `rgba(200, 225, 245, ${(0.35 * shardLook(sh).alpha).toFixed(3)})`;
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = 0.8;
      for (const sh of shards) {
        const look = shardLook(sh);
        outline(sh);
        ctx.strokeStyle = `rgba(240, 250, 255, ${((0.4 + 0.6 * look.glint) * look.alpha).toFixed(3)})`;
        ctx.stroke();
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}
