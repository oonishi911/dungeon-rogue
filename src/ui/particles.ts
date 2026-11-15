// 空気の粒。主人公のまわりに漂う粒と、たいまつから舞い上がる火の粉。
// - 漂う粒は、ダンジョンの特性ごとに変える（炎：灰と火の粉、氷：細かな雪、光：金色の光の粒、闇：黒いもや、無属性：ちり）。
//   主人公のまわりの箱の中で動かし、はみ出したら反対側へ戻す。視界の中だけに見え、外へ向かって薄くなる
// - 火の粉は、近くの壁掛けたいまつ（sconces.ts）の炎から立ちのぼり、上るほど薄くなって消える
// 動きはすべてシェーダで計算する（毎フレームの計算は、時間と主人公の位置を渡すだけ）。時間は霧の模様と同じものを使うので、
// 「動きを減らす」設定では止まる。数値は explore3dConfig.ts の PARTICLES。

import * as THREE from 'three';
import type { TraitId } from '../game/types';
import type { Fog } from './explore3dKit';
import { PARTICLES } from './explore3dConfig';

type Kind = (typeof PARTICLES.kinds)[TraitId];

export class Particles {
  readonly root = new THREE.Group();
  private readonly air: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly embers: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private trait: TraitId | null = null;
  private readonly pixelRatio = { value: 1 };
  // 火の粉を出す炎の位置（w が 1 なら灯っている。0 なら出さない）
  private readonly sources = { value: Array.from({ length: PARTICLES.sources }, () => new THREE.Vector4()) };

  constructor(fog: Fog) {
    const shared = { ...fog.uniforms, pixelRatio: this.pixelRatio };
    this.air = new THREE.Points(seeds(PARTICLES.air), airMaterial(shared));
    this.embers = new THREE.Points(seeds(PARTICLES.embers), emberMaterial({ ...shared, sources: this.sources }));
    for (const p of [this.air, this.embers]) {
      p.frustumCulled = false;
      p.renderOrder = 2;
      this.root.add(p);
    }
  }

  /** ダンジョンの特性に合わせて、漂う粒の種類を変える */
  setTrait(trait: TraitId) {
    if (trait === this.trait) return;
    this.trait = trait;
    const k: Kind = PARTICLES.kinds[trait];
    const u = this.air.material.uniforms;
    u.color!.value.set(k.color);
    u.velocity!.value.set(...k.velocity);
    u.sway!.value = k.sway;
    u.size!.value = k.size;
    u.opacity!.value = k.opacity;
    this.air.material.blending = k.glow ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.air.material.needsUpdate = true;
  }

  /** 毎フレーム：火の粉を出す炎の位置（灯っている壁掛けたいまつ）と、画面の解像度を伝える */
  tick(flames: readonly THREE.Vector3[], pixelRatio: number) {
    this.sources.value.forEach((s, i) => {
      const f = flames[i];
      if (f) s.set(f.x, f.y, f.z, 1);
      else s.w = 0;
    });
    this.pixelRatio.value = pixelRatio;
  }

  dispose() {
    for (const p of [this.air, this.embers]) {
      p.geometry.dispose();
      p.material.dispose();
    }
  }
}

/** 粒ごとの乱数（0〜1 を4つ）。決まった式で作るので、いつも同じ並び */
function seeds(count: number): THREE.BufferGeometry {
  const a = new Float32Array(count * 4);
  for (let i = 0; i < a.length; i++) a[i] = fract(Math.sin(i * 12.9898 + 78.233) * 43758.5453);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3)); // 位置はシェーダで決める
  geo.setAttribute('seed', new THREE.BufferAttribute(a, 4));
  return geo;
}

const fract = (x: number) => x - Math.floor(x);

const DOT_FRAGMENT = `
  uniform vec3 color;
  varying float vAlpha;
  void main() {
    float d = length( gl_PointCoord - 0.5 ) * 2.0;
    float a = vAlpha * ( 1.0 - smoothstep( 0.2, 1.0, d ) );
    if ( a < 0.01 ) discard;
    gl_FragColor = vec4( color, a );
    #include <colorspace_fragment>
  }`;

function airMaterial(shared: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  const box = PARTICLES.box;
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      color: { value: new THREE.Color() },
      velocity: { value: new THREE.Vector3() },
      sway: { value: 0 },
      size: { value: 1 },
      opacity: { value: 1 },
    },
    vertexShader: `
      attribute vec4 seed;
      uniform vec2 fogPlayer;
      uniform float fogRadius;
      uniform float fogTime;
      uniform float pixelRatio;
      uniform vec3 velocity;
      uniform float sway;
      uniform float size;
      uniform float opacity;
      varying float vAlpha;
      void main() {
        vec3 box = vec3( ${box.width.toFixed(1)}, ${box.height.toFixed(1)}, ${box.width.toFixed(1)} );
        vec3 p = seed.xyz * box + velocity * fogTime * ( 0.6 + 0.8 * seed.w );
        p.x += sin( fogTime * 0.7 + seed.w * 31.0 ) * sway;
        p.z += cos( fogTime * 0.6 + seed.x * 17.0 ) * sway;
        // 主人公のまわりの箱からはみ出したら、反対側へ戻す
        vec3 center = vec3( fogPlayer.x, 0.0, fogPlayer.y );
        p.xz = mod( p.xz - center.xz + box.xz * 0.5, box.xz ) - box.xz * 0.5 + center.xz;
        p.y = mod( p.y, box.y );
        float dist = length( p.xz - fogPlayer );
        // 視界の中だけ。外へ向かって薄く、床と天井の近くでも薄くする
        vAlpha = opacity * ( 1.0 - smoothstep( fogRadius * 0.55, fogRadius, dist ) ) * smoothstep( 0.0, 0.25, p.y ) * ( 1.0 - smoothstep( box.y - 0.4, box.y, p.y ) );
        vec4 mv = modelViewMatrix * vec4( p, 1.0 );
        gl_PointSize = size * pixelRatio * ( 0.6 + 0.8 * seed.y ) * ( 60.0 / -mv.z );
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: DOT_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
}

function emberMaterial(shared: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, color: { value: new THREE.Color(PARTICLES.emberColor) } },
    vertexShader: `
      attribute vec4 seed;
      uniform vec4 sources[ ${PARTICLES.sources} ];
      uniform float fogTime;
      uniform float pixelRatio;
      varying float vAlpha;
      void main() {
        // 0〜1 をくり返す、火の粉の一生（粒ごとにずらす）
        float life = fract( fogTime * ${PARTICLES.emberSpeed.toFixed(3)} * ( 0.7 + 0.6 * seed.y ) + seed.w );
        // 粒ごとに、どの炎から出るかを決める（灯っていない炎の粒は出さない）
        int k = int( floor( seed.y * ${PARTICLES.sources.toFixed(1)} ) );
        vec4 src = sources[ 0 ];
        ${Array.from({ length: PARTICLES.sources - 1 }, (_, i) => `if ( k == ${i + 1} ) src = sources[ ${i + 1} ];`).join(' ')}
        vec3 p = src.xyz + vec3( ( seed.x - 0.5 ) * 0.08, 0.0, ( seed.z - 0.5 ) * 0.08 );
        p.y += life * ${PARTICLES.emberRise.toFixed(2)};
        p.x += sin( life * 9.0 + seed.y * 20.0 ) * 0.07 * life;
        p.z += cos( life * 7.0 + seed.x * 20.0 ) * 0.07 * life;
        vAlpha = src.w * ( 1.0 - life ) * smoothstep( 0.0, 0.08, life ) * ( fogTime > 0.0 ? 1.0 : 0.0 );
        vec4 mv = modelViewMatrix * vec4( p, 1.0 );
        gl_PointSize = ${PARTICLES.emberSize.toFixed(2)} * pixelRatio * ( 1.0 - life * 0.5 ) * ( 60.0 / -mv.z );
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: DOT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}
