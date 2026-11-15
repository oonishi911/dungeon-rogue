// 金属と布の質感（2026-11-15）。
// - 金属：映り込み（暗いダンジョンの中で、たいまつの暖かい光が帯になって映る、決まった絵の周りの景色）を足し、
//   照り返しを金属自身の色に寄せる（金は金色に、鉄は白っぽく光る）
// - 布：照り返しをほとんどなくし、細かな織り目の凹凸を付ける（光が当たっても、つやが出ない）
// 主人公の服・マント（hero3d.ts）、武器（weapon3d.ts）、敵の鎧など光る部品（creatureKit.ts の Kit.skin）、宝箱の金具が使う。
// - 縁の光（withRim）：体の縁（横や後ろを向いた面）にうっすら青白い光を足し、暗い背景や暗い床の上でも、輪郭が浮かび上がるようにする
//   （主人公と敵の模型が使う。マスを大きく映したときに、形を見分けやすくするため）

import * as THREE from 'three';

export const METAL = { reflectivity: 0.32, shininess: 90 };
export const CLOTH = { shininess: 3, specular: 0x080808, weave: 0.6 };

let env: THREE.CubeTexture | null = null;
let weave: THREE.Texture | null = null;

/** 金属に映り込む周りの景色：上と下は暗く、横の真ん中に、たいまつの暖かい光の帯がある */
export function dungeonEnv(): THREE.CubeTexture {
  if (env) return env;
  const face = (glow: boolean) => {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 32);
    g.addColorStop(0, '#06070a');
    g.addColorStop(0.45, glow ? '#a8784a' : '#2a2420');
    g.addColorStop(0.55, glow ? '#5a3c22' : '#1c1814');
    g.addColorStop(1, '#0a0806');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    if (glow) {
      const r = ctx.createRadialGradient(16, 14, 0, 16, 14, 12);
      r.addColorStop(0, 'rgba(255,214,150,0.95)');
      r.addColorStop(1, 'rgba(255,170,90,0)');
      ctx.fillStyle = r;
      ctx.fillRect(0, 0, 32, 32);
    }
    return c;
  };
  const dark = () => {
    const c = document.createElement('canvas');
    c.width = c.height = 4;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#07080a';
    ctx.fillRect(0, 0, 4, 4);
    return c;
  };
  // 右・左・上・下・手前・奥。手前（カメラ側）と右に光の強い帯
  env = new THREE.CubeTexture([face(true), face(false), dark(), dark(), face(true), face(false)]);
  env.colorSpace = THREE.SRGBColorSpace;
  env.needsUpdate = true;
  return env;
}

/** 金属の質感にする（色はそのまま） */
export function asMetal<T extends THREE.MeshPhongMaterial>(m: T, reflectivity = METAL.reflectivity): T {
  m.envMap = dungeonEnv();
  m.combine = THREE.AddOperation;
  m.reflectivity = reflectivity;
  m.shininess = Math.max(m.shininess, METAL.shininess);
  m.specular = new THREE.Color(m.color).lerp(new THREE.Color(0xffffff), 0.35); // 照り返しは金属自身の色に寄せる
  return m;
}

/** 布の質感にする：つやを消し、細かな織り目の凹凸を付ける */
export function asCloth<T extends THREE.MeshPhongMaterial>(m: T): T {
  m.shininess = CLOTH.shininess;
  m.specular = new THREE.Color(CLOTH.specular);
  m.bumpMap = weaveTexture();
  m.bumpScale = CLOTH.weave;
  return m;
}

/** 織り目：細かい格子に、ゆらぎを混ぜた絵 */
function weaveTexture(): THREE.Texture {
  if (weave) return weave;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const v = 128 + ((x + y) % 2 === 0 ? 40 : -40) + ((x * 7 + y * 13) % 11) * 3;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  weave = new THREE.CanvasTexture(c);
  weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
  weave.repeat.set(4, 4);
  return weave;
}

/** 縁の光の色と強さ（強さは、縁でどれだけ明るさを足すか。0なら光らない） */
export const RIM = { color: 0x7f93b8, strength: 0.3, power: 2.5 };

/**
 * 縁の光を付ける：カメラに対して横を向いた面（縁）ほど、色を足す。上を向いた面（真正面に近い）はほとんど変わらない。
 * 先に付いている onBeforeCompile（霧の手直しなど）も生かすので、霧をかける前に呼ぶ。
 * 色と強さは素材ごとに違えられる（光の当たらない霊の体などは弱く）
 */
export function withRim<T extends THREE.MeshPhongMaterial>(m: T, strength = RIM.strength, color: number = RIM.color): T {
  if (strength <= 0) return m;
  const before = m.onBeforeCompile.bind(m);
  m.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    shader.uniforms.rimColor = { value: new THREE.Color(color) };
    shader.uniforms.rimStrength = { value: strength };
    shader.fragmentShader =
      'uniform vec3 rimColor;\nuniform float rimStrength;\n' +
      shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `{
          float rimDot = 1.0 - clamp( dot( normalize( normal ), normalize( vViewPosition ) ), 0.0, 1.0 );
          outgoingLight += rimColor * rimStrength * pow( rimDot, ${RIM.power.toFixed(2)} );
        }
        #include <opaque_fragment>`,
      );
  };
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => key() + '|rim';
  return m;
}
