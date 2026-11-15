// 3D表示の素材まわりの道具：敵を立てる板、床と壁のテクスチャの貼り方・でこぼこ、見えていない場所の霧。explore3d.ts から使う。

import * as THREE from 'three';
import { EXPLORE_CONFIG, type ExploreState } from '../game/exploreTypes';
import type { Pos } from '../game/map';
import { BACKGROUND, CAMERA, CORNER_SHADE, FOG_LOOK, GROUND_MIST, REMEMBERED, SIGHT_LIGHT, TEXTURE_SPAN, WALL_HEIGHT, WALL_ROUGH } from './explore3dConfig';

/**
 * 敵の絵を立てる板（ふつうは1×1、中心が原点）。板はカメラの方へ向けて使うが、そのままだと面の向きがカメラを向くので、
 * 主人公とカメラのあいだにいる敵は、たいまつの光を背中から受けて真っ暗になる。
 * そこで面の向き（法線）を、カメラの方へ向けたときにちょうど真上になるようにしておき、足元の床と同じ当たり方にする
 */
export function litBillboard(width = 1, height = 1): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(width, height);
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, CAMERA.height, CAMERA.back);
  camera.lookAt(0, 0, 0);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion.clone().invert());
  const normals = geo.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < normals.count; i++) normals.setXYZ(i, up.x, up.y, up.z);
  normals.needsUpdate = true;
  return geo;
}

/**
 * 床と壁の素材の、テクスチャの貼り方を変える。普通は面ごとに絵全体を貼るが、ここでは面のダンジョンの中の位置から、
 * 絵のどこを使うかを決める（床と壁の上面は x・z、壁の側面は壁に沿った向きの位置と高さ）。絵は TEXTURE_SPAN マスごとに繰り返す。
 * こうすると隣り合うマスの模様がつながり、マスの境目に縁取りや目地のような線が出ない。霧（applyFog）もかける
 */
export function worldMapped<T extends THREE.MeshLambertMaterial | THREE.MeshPhongMaterial>(material: T, face: 'floor' | 'top' | 'side', fog: Fog, rough = false): T {
  const defines: Record<string, string> = { TEXTURE_SPAN: TEXTURE_SPAN.toFixed(1), WALL_HEIGHT_F: WALL_HEIGHT.toFixed(1) };
  defines[`MAPPED_${face.toUpperCase()}`] = '';
  // 壁は表面を岩肌のように波打たせる（WALL_ROUGH）
  if (rough) defines.WALL_ROUGH = '';
  material.defines = { ...material.defines, ...defines };
  return applyFog(material as THREE.Material, fog, 'darken', `world-mapped-${face}`) as T;
}

// 壁の表面のでこぼこ（WALL_ROUGH を定めた素材だけ）。ダンジョンの中の位置で決まるなめらかな値のノイズを2段重ね、
// 面の向き（法線）の方へ頂点をずらす。底（下向きの面）はずらさない
export const WALL_ROUGH_GLSL = `
#ifdef WALL_ROUGH
float wallHash( vec3 p ) {
  p = fract( p * 0.3183099 + 0.1 );
  p *= 17.0;
  return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}
float wallNoise( vec3 x ) {
  vec3 i = floor( x );
  vec3 f = fract( x );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix(
    mix( mix( wallHash( i ), wallHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( wallHash( i + vec3( 0, 1, 0 ) ), wallHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
    mix( mix( wallHash( i + vec3( 0, 0, 1 ) ), wallHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( wallHash( i + vec3( 0, 1, 1 ) ), wallHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ),
    f.z );
}
#endif
`;
export const WALL_ROUGH_VERTEX = `#include <begin_vertex>
#ifdef WALL_ROUGH
{
  vec4 roughAt = vec4( position, 1.0 );
  #ifdef USE_INSTANCING
    roughAt = instanceMatrix * roughAt;
  #endif
  vec3 rp = ( modelMatrix * roughAt ).xyz * ${WALL_ROUGH.scale.toFixed(2)};
  float bump = ( wallNoise( rp ) - 0.5 ) * 1.4 + ( wallNoise( rp * 2.3 + 7.1 ) - 0.5 ) * 0.6;
  float along = objectNormal.y < -0.5 ? 0.0 : mix( 1.0, ${WALL_ROUGH.top.toFixed(2)}, max( objectNormal.y, 0.0 ) );
  transformed += objectNormal * bump * ${WALL_ROUGH.amount.toFixed(3)} * along;
}
#endif`;

// ===== 霧（ピクセル単位） =====

/**
 * 霧の地図と、描くときに使う値。地図は1マス1ドットで、R が「今見えている」、G が「一度見た」の度合い（0〜255）。
 * 描くときはこの地図をなめらかに引き伸ばして読むので、見えている・一度見た・まだ見ていない場所の境目が、
 * マスの形ではなく1マスほどのなだらかなグラデーションになる
 */
export interface Fog {
  readonly uniforms: {
    fogMap: { value: THREE.DataTexture };
    fogSize: { value: THREE.Vector2 };
    fogPlayer: { value: THREE.Vector2 };
    fogRadius: { value: number }; // 視界の半径（マス。持っていった道具で変わる）に半マス足したもの。たいまつのゆらぎで少し動く
    fogTime: { value: number }; // 霧の模様を流すための時間（秒。「動きを減らす」設定では止まる）
  };
  /** 状態が変わったときに、目標の見え方を入れる（階が変わったら地図を作り直し、今の見え方にすぐ合わせる） */
  setTargets(state: ExploreState, visible: Set<number>): void;
  /** 毎フレーム：主人公の位置（動いている途中）を伝え、見え方を目標へ少しずつ近づける。flicker は視界の端のちらつき（半径の割合） */
  update(player: Pos, dt: number, reduceMotion: boolean, flicker?: number): void;
  dispose(): void;
}

export function createFog(): Fog {
  let map: unknown = null;
  let width = 1;
  let height = 1;
  let visible = new Float32Array(1); // 今の見え方（0〜1）。目標へ少しずつ近づける
  let seen = new Float32Array(1);
  let visibleTarget = new Uint8Array(1); // 目標（0 か 1）
  let seenTarget = new Uint8Array(1);
  let dirty = true;
  let texture = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  const uniforms = {
    fogMap: { value: texture },
    fogSize: { value: new THREE.Vector2(1, 1) },
    fogPlayer: { value: new THREE.Vector2() },
    fogRadius: { value: EXPLORE_CONFIG.sightRadius + 0.5 },
    fogTime: { value: 0 },
  };
  let radius = EXPLORE_CONFIG.sightRadius + 0.5;
  const write = () => {
    const data = texture.image.data as Uint8Array;
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = Math.round(visible[i]! * 255);
      data[i * 4 + 1] = Math.round(seen[i]! * 255);
    }
    texture.needsUpdate = true;
  };
  return {
    uniforms,
    setTargets(state, visibleTiles) {
      const fresh = state.map !== map;
      if (fresh) {
        map = state.map;
        width = state.map.width;
        height = state.map.height;
        visible = new Float32Array(width * height);
        seen = new Float32Array(width * height);
        visibleTarget = new Uint8Array(width * height);
        seenTarget = new Uint8Array(width * height);
        texture.dispose();
        texture = new THREE.DataTexture(new Uint8Array(width * height * 4), width, height);
        // なめらかに引き伸ばして読む（マスとマスのあいだが、なだらかにつながる）
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearFilter;
        uniforms.fogMap.value = texture;
        uniforms.fogSize.value.set(width, height);
      }
      radius = state.sightRadius + 0.5;
      for (let i = 0; i < width * height; i++) {
        visibleTarget[i] = visibleTiles.has(i) ? 1 : 0;
        seenTarget[i] = state.seen[i] ? 1 : 0;
      }
      // 階を移ったとき（戻ったときも）は、ゆっくり変えずに今の見え方にすぐ合わせる
      if (fresh) {
        visible.set(visibleTarget);
        seen.set(seenTarget);
      }
      dirty = true;
    },
    update(player, dt, reduceMotion, flicker = 0) {
      uniforms.fogPlayer.value.set(player.x, player.y);
      uniforms.fogRadius.value = radius * (1 + flicker);
      if (!reduceMotion) uniforms.fogTime.value += dt;
      if (!dirty) return;
      const step = reduceMotion ? 1 : Math.min(1, dt * SIGHT_LIGHT.fade);
      let moving = false;
      for (let i = 0; i < width * height; i++) {
        const v = visible[i]! + (visibleTarget[i]! - visible[i]!) * step;
        const s = seen[i]! + (seenTarget[i]! - seen[i]!) * step;
        visible[i] = Math.abs(visibleTarget[i]! - v) < 0.004 ? visibleTarget[i]! : v;
        seen[i] = Math.abs(seenTarget[i]! - s) < 0.004 ? seenTarget[i]! : s;
        if (visible[i] !== visibleTarget[i] || seen[i] !== seenTarget[i]) moving = true;
      }
      write();
      dirty = moving; // 目標に着いたら、次に状態が変わるまで書き直さない
    },
    dispose() {
      texture.dispose();
    },
  };
}

/** 霧の模様（もやもやしたノイズ）。fogNoise は 0〜1 */
const FOG_NOISE_GLSL = `
  float fogHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
  float fogValue( vec2 p ) {
    vec2 i = floor( p ), f = fract( p );
    vec2 u = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( fogHash( i ), fogHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( fogHash( i + vec2( 0.0, 1.0 ) ), fogHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
  }
  float fogNoise( vec2 p ) { return 0.65 * fogValue( p ) + 0.35 * fogValue( p * 2.1 + 17.3 ); }
`;

/**
 * 霧の地図を読む部分（applyFog と地面をはう霧で共通）。次の値を作る：
 * - fogPattern：流れる模様（0〜1）
 * - fogD：主人公からの距離（ゆらいだ視界の半径で割ったもの。0〜1）
 * - fogLit：今見えている度合い（視界の端はゆらいで、一度見た場所の見え方へ移る）
 * - fogSeen：一度見た度合い（境目はゆらいで、まだ見ていない場所＝背景へ溶け込む）
 */
const FOG_SAMPLE_GLSL = `
  vec2 fogFlow = vec2( fogTime * ${FOG_LOOK.drift.toFixed(3)}, fogTime * ${(FOG_LOOK.drift * 0.6).toFixed(3)} );
  float fogPattern = fogNoise( vFogWorld.xz * ${FOG_LOOK.scale.toFixed(3)} + fogFlow );
  vec2 fogWarp = ( vec2( fogPattern, fogNoise( vFogWorld.zx * ${FOG_LOOK.scale.toFixed(3)} - fogFlow + 5.2 ) ) - 0.5 ) * ${(FOG_LOOK.edgeWarp * 2).toFixed(3)};
  // マスの中心が整数の座標なので、半マスずらして霧の地図のドットの中心に合わせる
  vec2 fogTexel = texture2D( fogMap, ( vFogWorld.xz + fogWarp + 0.5 ) / fogSize ).rg;
  float fogD = clamp( length( vFogWorld.xz - fogPlayer ) / ( fogRadius * ( 1.0 + ${FOG_LOOK.wobble.toFixed(3)} * ( fogPattern * 2.0 - 1.0 ) ) ), 0.0, 1.0 );
  float fogLit = smoothstep( 0.0, 1.0, fogTexel.r ) * ( 1.0 - smoothstep( ${FOG_LOOK.clearFrom.toFixed(2)}, 1.0, fogD ) );
  float fogSeen = smoothstep( 0.5, 1.0, fogTexel.g ); // マスの境目（0.5）で、ちょうど背景に溶け込む
`;

export const FOG_BACKGROUND = new THREE.Color(BACKGROUND); // 背景の色（光の強さの単位。シェーダで、画面の色に直す前に混ぜる）

/**
 * 素材に霧をかける。ピクセルごとに、霧の地図から「今見えている」「一度見た」の度合いを読み、
 * - 見えている場所は、主人公から離れるほどなめらかに暗く（端で SIGHT_LIGHT.edge）
 * - 一度見ただけの場所は REMEMBERED の明るさ
 * - まだ見ていない場所へ向かっては、背景の色に溶け込ませる（mode が 'fade-alpha' なら、色ではなく濃さを消す）
 * worldMapped の素材では、テクスチャの貼り方の変更（MAPPED_* の定義）も一緒に行う
 */
export function applyFog<T extends THREE.Material>(material: T, fog: Fog, mode: 'darken' | 'fade-alpha' = 'darken', key = ''): T {
  const bg = FOG_BACKGROUND; // 光の強さの単位（three.js の色は、この単位で持つ）
  const before = material.onBeforeCompile.bind(material); // 先に付いている手直し（絵を投影して貼る素材など）も生かす
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    Object.assign(shader.uniforms, fog.uniforms);
    shader.vertexShader =
      'varying vec3 vFogWorld;\n' +
      WALL_ROUGH_GLSL +
      shader.vertexShader.replace('#include <begin_vertex>', WALL_ROUGH_VERTEX).replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        {
          vec4 world = vec4( position, 1.0 );
          #ifdef USE_INSTANCING
            world = instanceMatrix * world;
          #endif
          world = modelMatrix * world;
          vFogWorld = world.xyz;
          #ifdef USE_MAP
            #if defined( MAPPED_FLOOR )
              // 画像から作った素材は、床と壁の上面が同じ絵なので、床は90度回して位置もずらし、模様がそろわないようにする
              vMapUv = vec2( -world.z, world.x ) / TEXTURE_SPAN + vec2( 0.37, 0.61 );
            #elif defined( MAPPED_TOP )
              // 上から見て、絵の上が奥（-z）になるように
              vMapUv = vec2( world.x, -world.z ) / TEXTURE_SPAN;
            #elif defined( MAPPED_SIDE )
              // 外から見て、絵が左右反転しないように、面の向きで進む向きを決める
              float along = abs( normal.x ) > 0.5 ? -world.z * sign( normal.x ) : world.x * sign( normal.z );
              vMapUv = vec2( along / TEXTURE_SPAN, world.y / WALL_HEIGHT_F );
            #endif
            // 凹凸（bumpMap）も、色と同じ貼り方で読む
            #if defined( USE_BUMPMAP ) && ( defined( MAPPED_FLOOR ) || defined( MAPPED_TOP ) || defined( MAPPED_SIDE ) )
              vBumpMapUv = vMapUv;
            #endif
            #if defined( USE_SPECULARMAP ) && ( defined( MAPPED_FLOOR ) || defined( MAPPED_TOP ) || defined( MAPPED_SIDE ) )
              vSpecularMapUv = vMapUv;
            #endif
          #endif
        }`,
      );
    shader.fragmentShader =
      `varying vec3 vFogWorld;
      uniform sampler2D fogMap;
      uniform vec2 fogSize;
      uniform vec2 fogPlayer;
      uniform float fogRadius;
      uniform float fogTime;
      ${FOG_NOISE_GLSL}
      ` +
      shader.fragmentShader
        .replace(
          '#include <opaque_fragment>',
          `${FOG_SAMPLE_GLSL}
          #ifdef MAPPED_SIDE
            // 壁と床の隅の暗がり：壁の側面の根元ほど暗く
            outgoingLight *= mix( ${CORNER_SHADE.min.toFixed(2)}, 1.0, smoothstep( 0.0, ${CORNER_SHADE.height.toFixed(2)}, vFogWorld.y ) );
          #endif
          ${
            mode === 'darken'
              ? `{
            float fogNear = 1.0 - ${(1 - SIGHT_LIGHT.edge).toFixed(2)} * fogD * fogD * ( 3.0 - 2.0 * fogD );
            // 一度見た場所：色を抜いて暗くし、青白いもやを、流れる模様で濃い・薄いを付けて混ぜる
            float fogLum = dot( outgoingLight, vec3( 0.299, 0.587, 0.114 ) );
            vec3 fogMemory = mix( vec3( fogLum ), outgoingLight, ${FOG_LOOK.saturation.toFixed(2)} ) * ${REMEMBERED.toFixed(2)};
            fogMemory = mix( fogMemory, vec3( ${FOG_LOOK.mist.map((v) => v.toFixed(3)).join(', ')} ), ${FOG_LOOK.mistAmount.toFixed(2)} * ( 0.45 + 0.9 * fogPattern ) );
            outgoingLight = mix( fogMemory, outgoingLight * fogNear, fogLit );
          }`
              : ''
          }
          #include <opaque_fragment>`,
        )
        .replace(
          '#include <colorspace_fragment>',
          // 背景の色との混ぜ合わせは、画面の色に直す前（光の強さの単位）で行う。画面の仕上げ（postFx.ts）を通すときも、通さないときも同じ色になる
          `${
            mode === 'darken'
              ? `gl_FragColor.rgb = mix( vec3( ${bg.r.toFixed(4)}, ${bg.g.toFixed(4)}, ${bg.b.toFixed(4)} ), gl_FragColor.rgb, fogSeen );`
              : 'gl_FragColor.a *= fogSeen;'
          }
          #include <colorspace_fragment>`,
        );
  };
  material.customProgramCacheKey = () => `fog-${mode}-${key}`;
  return material;
}

/**
 * 地面をはう霧：床の少し上に置く、ゆっくり流れる半透明の霧の層（width × depth マス。毎フレーム主人公の位置へ動かす）。
 * 主人公のそばは晴れ、視界の外ほど濃い。まだ見ていない場所には出さない（背景のまま）。壁より低いので、壁の前では隠れる
 */
export function createGroundMist(fog: Fog, width: number, depth: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(width, depth);
  geo.rotateX(-Math.PI / 2);
  const color = new THREE.Color(GROUND_MIST.color);
  const material = new THREE.ShaderMaterial({
    uniforms: fog.uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec3 vFogWorld;
      void main() {
        vec4 world = modelMatrix * vec4( position, 1.0 );
        vFogWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      varying vec3 vFogWorld;
      uniform sampler2D fogMap;
      uniform vec2 fogSize;
      uniform vec2 fogPlayer;
      uniform float fogRadius;
      uniform float fogTime;
      ${FOG_NOISE_GLSL}
      void main() {
        ${FOG_SAMPLE_GLSL}
        vec2 mistFlow = vec2( fogTime * ${GROUND_MIST.drift.toFixed(3)}, -fogTime * ${(GROUND_MIST.drift * 0.7).toFixed(3)} );
        float mist = fogNoise( vFogWorld.xz * ${GROUND_MIST.scale.toFixed(3)} + mistFlow + 9.1 );
        float dist = length( vFogWorld.xz - fogPlayer ) / fogRadius + ( fogPattern - 0.5 ) * 0.3;
        float thick = smoothstep( ${GROUND_MIST.clearTo.toFixed(2)}, ${GROUND_MIST.thickTo.toFixed(2)}, dist );
        // 色は光の強さの単位で出し、最後に画面の色に直す（画面の仕上げを通すときは、そちらで直す）
        gl_FragColor = vec4( ${color.r.toFixed(4)}, ${color.g.toFixed(4)}, ${color.b.toFixed(4)}, ${GROUND_MIST.opacity.toFixed(2)} * thick * smoothstep( 0.3, 0.8, mist ) * fogSeen );
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = 1; // 床と壁のあと、敵や主人公の前に描く
  mesh.frustumCulled = false;
  return mesh;
}
