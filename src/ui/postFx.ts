// 画面全体の仕上げ（後処理）。描いた画面に、次の3つをかけてから画面に出す：
// - 光のにじみ（ブルーム）：明るいところ（たいまつ・光る目・呪文・壁掛けのたいまつ）を取り出してぼかし、元の画面に足す
// - 周辺減光：画面の四隅をわずかに暗くして、視線を真ん中（主人公）に集める
// - 粒子感：ごく薄いざらつきを毎フレーム変えて重ね、絵が平らに見えないようにする
// 軽くするため、ぼかしは縦横1回ずつ、重ね描き（マルチサンプル）は大きな画面では減らす（数値は POST_FX）。
// 処理の弱い端末や、描くのが間に合わないときは使わない（explore3d.ts が決める）。数値は explore3dConfig.ts の POST_FX。

import * as THREE from 'three';
import { POST_FX } from './explore3dConfig';

const VERTEX = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }';

export class PostFx {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly main: THREE.WebGLRenderTarget; // 描いた画面（明るさ1を超える光も残せるよう、半精度の小数で持つ）
  private readonly blurA: THREE.WebGLRenderTarget; // にじみ用の小さな画面（縦横1/4）
  private readonly blurB: THREE.WebGLRenderTarget;
  private readonly bright: THREE.ShaderMaterial;
  private readonly blur: THREE.ShaderMaterial;
  private readonly composite: THREE.ShaderMaterial;
  private time = 0;
  private readonly step = new THREE.Vector2();

  constructor() {
    const opts = { type: THREE.HalfFloatType, depthBuffer: false } as const;
    this.main = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: POST_FX.samples }); // 縁のギザギザを消す（マルチサンプル）
    this.blurA = new THREE.WebGLRenderTarget(1, 1, opts);
    this.blurB = new THREE.WebGLRenderTarget(1, 1, opts);
    for (const t of [this.blurA, this.blurB]) t.texture.minFilter = t.texture.magFilter = THREE.LinearFilter;

    // 明るいところだけを取り出す（しきい値の手前から、なめらかに増やす）
    this.bright = new THREE.ShaderMaterial({
      uniforms: { tex: { value: null } },
      vertexShader: VERTEX,
      fragmentShader: `uniform sampler2D tex; varying vec2 vUv;
        void main() {
          vec3 c = texture2D( tex, vUv ).rgb;
          float l = max( c.r, max( c.g, c.b ) );
          float k = smoothstep( ${POST_FX.threshold.toFixed(3)}, ${(POST_FX.threshold + POST_FX.knee).toFixed(3)}, l );
          gl_FragColor = vec4( c * k, 1.0 );
        }`,
    });
    // 縦か横に、なめらかにぼかす（9点。縦横1回ずつ。step で幅を決める）
    this.blur = new THREE.ShaderMaterial({
      uniforms: { tex: { value: null }, step: { value: new THREE.Vector2() } },
      vertexShader: VERTEX,
      fragmentShader: `uniform sampler2D tex; uniform vec2 step; varying vec2 vUv;
        void main() {
          vec3 c = texture2D( tex, vUv ).rgb * 0.2270;
          c += ( texture2D( tex, vUv + step * 1.3846 ).rgb + texture2D( tex, vUv - step * 1.3846 ).rgb ) * 0.3162;
          c += ( texture2D( tex, vUv + step * 3.2308 ).rgb + texture2D( tex, vUv - step * 3.2308 ).rgb ) * 0.0703;
          gl_FragColor = vec4( c, 1.0 );
        }`,
    });
    // 元の画面ににじみを足し、四隅を暗くし、画面の色に直してから、ざらつきを重ねる
    this.composite = new THREE.ShaderMaterial({
      uniforms: { tex: { value: null }, glow: { value: null }, time: { value: 0 }, size: { value: new THREE.Vector2(1, 1) } },
      vertexShader: VERTEX,
      fragmentShader: `uniform sampler2D tex; uniform sampler2D glow; uniform float time; uniform vec2 size; varying vec2 vUv;
        float grainHash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
        void main() {
          vec3 c = texture2D( tex, vUv ).rgb + texture2D( glow, vUv ).rgb * ${POST_FX.bloom.toFixed(3)};
          vec2 d = ( vUv - 0.5 ) * vec2( size.x / size.y, 1.0 );
          c *= 1.0 - ${POST_FX.vignette.toFixed(3)} * smoothstep( 0.35, 0.95, length( d ) );
          gl_FragColor = vec4( c, 1.0 );
          #include <colorspace_fragment>
          gl_FragColor.rgb += ( grainHash( floor( vUv * size ) + fract( time ) * 91.7 ) - 0.5 ) * ${POST_FX.grain.toFixed(3)};
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.composite);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  /** シーンを描く先の画面（描き方は描く先の色の扱いで変わるので、描き方を先に作るときに使う） */
  get target(): THREE.WebGLRenderTarget {
    return this.main;
  }

  /** 仕上げの描き方（シェーダー）を先に作っておく（描き方は描く先の色の扱いで変わるので、実際に描く先を指して作る） */
  compile(renderer: THREE.WebGLRenderer) {
    const previous = renderer.getRenderTarget();
    try {
      const jobs: [THREE.ShaderMaterial, THREE.WebGLRenderTarget | null][] = [[this.bright, this.blurA], [this.blur, this.blurA], [this.composite, null]];
      for (const [material, target] of jobs) {
        this.quad.material = material;
        renderer.setRenderTarget(target);
        void renderer.compileAsync(this.scene, this.camera).catch(() => undefined);
      }
    } catch {
      // 失敗しても、初めて描くときに作られる
    } finally {
      renderer.setRenderTarget(previous);
    }
  }

  /** 描く大きさ（実際のピクセル数）。画面の大きさや解像度が変わったら呼ぶ */
  setSize(width: number, height: number) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    // 大きな画面では、重ね描きの回数を減らす（細かい画面なので、縁のギザギザは目立たない）。回数を変えるには作り直す
    const samples = w * h > POST_FX.bigPixels ? POST_FX.samplesBig : POST_FX.samples;
    if (samples !== this.main.samples) {
      this.main.samples = samples;
      this.main.dispose();
    }
    this.main.setSize(w, h);
    this.blurA.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    this.blurB.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    this.composite.uniforms.size!.value.set(w, h);
  }

  /** シーンを描き、仕上げをかけて画面に出す。dt は前のフレームからの秒数（「動きを減らす」設定では 0 にして、ざらつきを止める） */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, dt: number) {
    this.time += dt;
    renderer.setRenderTarget(this.main);
    renderer.render(scene, camera);

    this.pass(renderer, this.bright, { tex: this.main.texture }, this.blurA);
    const w = this.blurA.width;
    const h = this.blurA.height;
    this.pass(renderer, this.blur, { tex: this.blurA.texture, step: this.step.set(POST_FX.spread / w, 0) }, this.blurB);
    this.pass(renderer, this.blur, { tex: this.blurB.texture, step: this.step.set(0, POST_FX.spread / h) }, this.blurA);
    this.pass(renderer, this.composite, { tex: this.main.texture, glow: this.blurA.texture, time: this.time }, null);
  }

  private pass(renderer: THREE.WebGLRenderer, material: THREE.ShaderMaterial, values: Record<string, unknown>, target: THREE.WebGLRenderTarget | null) {
    for (const [k, v] of Object.entries(values)) material.uniforms[k]!.value = v;
    this.quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    for (const t of [this.main, this.blurA, this.blurB]) t.dispose();
    for (const m of [this.bright, this.blur, this.composite]) m.dispose();
    this.quad.geometry.dispose();
  }
}
