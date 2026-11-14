// 呪文の演出の道具：計算の小道具、画面全体の板、白で描くテクスチャ。spellFx.ts から使う。
import * as THREE from 'three';
import type { CastEvent, Dir } from '../game/exploreTypes';
import type { Pos } from '../game/map';

// ===== 計算の小道具 =====

export const easeOut = (t: number) => 1 - (1 - t) ** 3;
export const easeIn = (t: number) => t * t * t;
export const easeOutBack = (t: number) => {
  const c = 1.7;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};
export const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;
export const outerMat = (o: THREE.Mesh) => o.material as THREE.MeshBasicMaterial;

export function randomUnit(): THREE.Vector3 {
  const u = Math.random() * 2 - 1;
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);
  return new THREE.Vector3(r * Math.cos(a), u, r * Math.sin(a));
}

/** 色を灰色に寄せる（効きにくいとき）。amount は寄せる割合 */
export function muted(color: number, amount: number): number {
  const c = new THREE.Color(color);
  const gray = (c.r + c.g + c.b) / 3;
  return c.lerp(new THREE.Color(gray, gray, gray), amount).multiplyScalar(0.8).getHex();
}

const DIR_VECTORS: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/** 呪文の向き（床の上の向き。x と z） */
export function directionOf(cast: CastEvent, from: Pos): THREE.Vector3 {
  const end = cast.path.at(-1);
  if (end && (end.x !== from.x || end.y !== from.y)) return new THREE.Vector3(end.x - from.x, 0, end.y - from.y).normalize();
  const [dx, dz] = DIR_VECTORS[cast.dir ?? 'down'];
  return new THREE.Vector3(dx, 0, dz);
}

/** 画面全体に直接描く板。vignette なら、画面の端ほど濃くする（暗くする幕） */
export function screenQuad(blending: THREE.Blending, vignette: boolean): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  const material = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(0xffffff) }, opacity: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform vec3 color; uniform float opacity; varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 1.4;
        float a = ${vignette ? 'opacity * mix(0.35, 1.0, smoothstep(0.1, 0.9, d))' : 'opacity * mix(1.0, 0.6, d)'};
        gl_FragColor = vec4(color${vignette ? '' : ' * a'}, ${vignette ? 'a' : '1.0'});
      }`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1000;
  mesh.visible = false;
  return mesh;
}

// ===== テクスチャ（すべて白で描き、素材の色で色を付ける） =====

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void, h = size): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** 中心が白く、外へ向かってなめらかに透ける丸 */
export function radialTexture(): THREE.Texture {
  return canvasTexture(64, (ctx, size) => {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
}

/** 小さく鋭い光の点（火の粉・きらめき） */
export function sparkTexture(): THREE.Texture {
  return canvasTexture(32, (ctx, size) => {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.15, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.2)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
}

/** 煙のかたまり（ふちがでこぼこした、やわらかい丸） */
export function smokeTexture(): THREE.Texture {
  return canvasTexture(64, (ctx, size) => {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const r = i === 0 ? 0 : size * 0.16;
      const x = size / 2 + Math.cos(a) * r;
      const y = size / 2 + Math.sin(a) * r;
      const g = ctx.createRadialGradient(x, y, 0, x, y, size * 0.3);
      g.addColorStop(0, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
  });
}

/** 魔法陣：二重の外の輪、文字の代わりの記号、内の輪、六芒星 */
export function circleTexture(): THREE.Texture {
  return canvasTexture(256, (ctx, size) => {
    const c = size / 2;
    ctx.strokeStyle = 'rgba(255,255,255,1)';
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.shadowColor = 'rgba(255,255,255,0.9)';
    ctx.shadowBlur = 6;
    const ring = (r: number, w: number) => {
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(c, c, r * c, 0, Math.PI * 2);
      ctx.stroke();
    };
    ring(0.94, 5);
    ring(0.84, 2);
    // 輪のあいだの記号（短い線と小さな丸を交互に）
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const x = c + Math.cos(a) * c * 0.89;
      const y = c + Math.sin(a) * c * 0.89;
      ctx.beginPath();
      if (i % 2) ctx.arc(x, y, 3, 0, Math.PI * 2);
      else {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.fillRect(-1.5, -6, 3, 12);
        ctx.restore();
      }
      ctx.fill();
    }
    ring(0.62, 3);
    // 六芒星
    ctx.lineWidth = 3;
    for (const start of [-Math.PI / 2, Math.PI / 2]) {
      ctx.beginPath();
      for (let i = 0; i <= 3; i++) {
        const a = start + (i / 3) * Math.PI * 2;
        const x = c + Math.cos(a) * c * 0.6;
        const y = c + Math.sin(a) * c * 0.6;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ring(0.22, 2);
    const g = ctx.createRadialGradient(c, c, 0, c, c, c * 0.3);
    g.addColorStop(0, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.shadowBlur = 0;
    ctx.fillRect(0, 0, size, size);
  });
}

/** 十字のきらめき（4本の細い光と、真ん中の丸い光） */
export function starTexture(): THREE.Texture {
  return canvasTexture(128, (ctx, size) => {
    const c = size / 2;
    for (const a of [0, Math.PI / 2]) {
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(a);
      const g = ctx.createLinearGradient(-c, 0, c, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-c, 0);
      ctx.lineTo(0, -size * 0.045);
      ctx.lineTo(c, 0);
      ctx.lineTo(0, size * 0.045);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    const g = ctx.createRadialGradient(c, c, 0, c, c, c * 0.35);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
}

/** 渦（3本の腕が、外から中へ巻きこむ） */
export function spiralTexture(): THREE.Texture {
  return canvasTexture(256, (ctx, size) => {
    const c = size / 2;
    ctx.lineCap = 'round';
    for (let arm = 0; arm < 3; arm++) {
      for (let i = 0; i < 90; i++) {
        const u = i / 90;
        const a = arm * ((Math.PI * 2) / 3) + u * Math.PI * 2.2;
        const r = c * (0.08 + 0.88 * u);
        ctx.fillStyle = `rgba(255,255,255,${(0.9 * (1 - u * 0.7)).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 2 + 10 * u * (1 - u), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const g = ctx.createRadialGradient(c, c, 0, c, c, c * 0.25);
    g.addColorStop(0, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
}

/** やわらかい輪（衝撃の輪・霜の輪） */
export function ringTexture(): THREE.Texture {
  return canvasTexture(128, (ctx, size) => {
    const c = size / 2;
    const g = ctx.createRadialGradient(c, c, c * 0.55, c, c, c);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.7, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
}

/** 光の槍の筋（長さの向きには同じ明るさで、両端だけ消える。幅の向きは真ん中が明るい） */
export function beamTexture(): THREE.Texture {
  return canvasTexture(
    128,
    (ctx) => {
      const w = 128;
      const h = 32;
      const along = ctx.createLinearGradient(0, 0, w, 0);
      along.addColorStop(0, 'rgba(255,255,255,0)');
      along.addColorStop(0.08, 'rgba(255,255,255,1)');
      along.addColorStop(0.92, 'rgba(255,255,255,1)');
      along.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = along;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'destination-in';
      const across = ctx.createLinearGradient(0, 0, 0, h);
      across.addColorStop(0, 'rgba(0,0,0,0)');
      across.addColorStop(0.5, 'rgba(0,0,0,1)');
      across.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = across;
      ctx.fillRect(0, 0, w, h);
    },
    32,
  );
}

/** 光の柱（根元が明るく、上へ向かって消える） */
export function columnTexture(): THREE.Texture {
  return canvasTexture(
    16,
    (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,1)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 16, 128);
    },
    128,
  );
}

/** 右（進む先）ほど明るく、左へ消えていき、上下の縁がぼける筋（なぎ払い） */
export function streakTexture(): THREE.Texture {
  return canvasTexture(
    128,
    (ctx) => {
      const w = 128;
      const h = 32;
      const along = ctx.createLinearGradient(0, 0, w, 0);
      along.addColorStop(0, 'rgba(255,255,255,0)');
      along.addColorStop(0.7, 'rgba(255,255,255,0.7)');
      along.addColorStop(1, 'rgba(255,255,255,1)');
      ctx.fillStyle = along;
      ctx.fillRect(0, 0, w, h);
      // 上下の縁をぼかす（真ん中の細い線だけ明るく残す）
      ctx.globalCompositeOperation = 'destination-in';
      const across = ctx.createLinearGradient(0, 0, 0, h);
      across.addColorStop(0, 'rgba(0,0,0,0)');
      across.addColorStop(0.5, 'rgba(0,0,0,1)');
      across.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = across;
      ctx.fillRect(0, 0, w, h);
    },
    32,
  );
}
