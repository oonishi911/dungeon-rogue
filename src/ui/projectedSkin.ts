// 設定画の絵を、立体の模型の表面に投影して貼る素材。
// 正面・側面・背面の3枚の絵（背景を透明にした切り抜き）を、模型の作ったときの姿勢で、それぞれの方向からまっすぐ投影する。
// 表面の向き（法線）で3枚を混ぜる：前を向いた面は正面の絵、後ろを向いた面は背面の絵、横を向いた面は側面の絵。
// 側面の絵は左向き（模型の左側 +x から見た絵）なので、右側（-x）の面には、同じ絵を裏返して貼ることになる（式は同じ）。
// 絵が透明なところ（模型の形と絵の輪郭がずれたところ）は、ほかの方向の絵で埋め、どれも透明なら暗い色にする。
//
// 腕や頭を動かしても絵がずれないよう、貼る位置は作ったときの姿勢での位置（restPos）と向き（restNormal）で決め、頂点に覚えさせる（bakeRestPose）。

import * as THREE from 'three';

export interface ProjectedView {
  file: string;
  footX: number; // 足元（模型の原点）が、絵の左から何割のところか
  aspect: number; // 絵の横:縦
}

export interface ProjectedViews {
  height: number; // 模型の高さ（マス）。絵の vFeet から vTop までがこの高さ
  vFeet: number; // 足元が、絵の下から何割のところか
  vTop: number; // 頭のてっぺんが、絵の下から何割のところか
  front: ProjectedView;
  side: ProjectedView;
  back: ProjectedView;
}

const FALLBACK = 0x1c1f16; // どの絵も透明なところの色（暗がりの影の色）

/** 3枚の絵を投影して貼る素材（フォンシェーディング。ツヤは弱く） */
export function projectedSkin(views: ProjectedViews, textures: Record<'front' | 'side' | 'back', THREE.Texture>): THREE.MeshPhongMaterial {
  const material = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 14, specular: 0x1a1a16 });
  const perUnitV = (views.vTop - views.vFeet) / views.height; // 1マスが絵の縦の何割か
  const uniforms = {
    tFront: { value: textures.front },
    tSide: { value: textures.side },
    tBack: { value: textures.back },
    // x：足元の位置、y：1マスが絵の横の何割か
    uFront: { value: new THREE.Vector2(views.front.footX, perUnitV / views.front.aspect) },
    uSide: { value: new THREE.Vector2(views.side.footX, perUnitV / views.side.aspect) },
    uBack: { value: new THREE.Vector2(views.back.footX, perUnitV / views.back.aspect) },
    uV: { value: new THREE.Vector2(views.vFeet, perUnitV) },
    uFallback: { value: new THREE.Color(FALLBACK) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      'attribute vec3 restPos;\nattribute vec3 restNormal;\nvarying vec3 vRestPos;\nvarying vec3 vRestNormal;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vRestPos = restPos;\n  vRestNormal = restNormal;');
    shader.fragmentShader =
      `uniform sampler2D tFront;
uniform sampler2D tSide;
uniform sampler2D tBack;
uniform vec2 uFront;
uniform vec2 uSide;
uniform vec2 uBack;
uniform vec2 uV;
uniform vec3 uFallback;
varying vec3 vRestPos;
varying vec3 vRestNormal;
` +
      shader.fragmentShader.replace(
        '#include <map_fragment>',
        `{
  vec3 n = normalize(vRestNormal);
  float v = uV.x + vRestPos.y * uV.y;
  vec4 cf = texture2D(tFront, vec2(uFront.x + vRestPos.x * uFront.y, v));
  vec4 cb = texture2D(tBack, vec2(uBack.x - vRestPos.x * uBack.y, v));
  vec4 cs = texture2D(tSide, vec2(uSide.x - vRestPos.z * uSide.y, v));
  // 面の向きで混ぜる（真上を向いた面は、3枚を少しずつ）
  float wf = pow(max(n.z, 0.0), 2.0) + 0.04;
  float wb = pow(max(-n.z, 0.0), 2.0) + 0.04;
  float ws = pow(abs(n.x), 2.0) + 0.04;
  // 絵の輪郭の半透明なところは背景の白がにじむので使わない
  wf *= smoothstep(0.6, 0.95, cf.a); wb *= smoothstep(0.6, 0.95, cb.a); ws *= smoothstep(0.6, 0.95, cs.a);
  float total = wf + wb + ws;
  vec3 painted = total > 0.002 ? (cf.rgb * wf + cb.rgb * wb + cs.rgb * ws) / total : uFallback;
  diffuseColor.rgb *= painted;
}`,
      );
  };
  material.customProgramCacheKey = () => 'projected-skin';
  return material;
}

/**
 * 作ったときの姿勢を覚えさせる：material を使うすべての部品の頂点に、root から見た位置（restPos）と向き（restNormal）を書き込む。
 * 部品を動かす入れ物へ移したり、動かしたりする前に呼ぶ
 */
export function bakeRestPose(root: THREE.Object3D, material: THREE.Material) {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  const p = new THREE.Vector3();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.material !== material) return;
    m.multiplyMatrices(toRoot, o.matrixWorld);
    nm.getNormalMatrix(m);
    const geo = o.geometry as THREE.BufferGeometry;
    const pos = geo.getAttribute('position');
    const nor = geo.getAttribute('normal');
    const rp = new Float32Array(pos.count * 3);
    const rn = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(m);
      rp.set([p.x, p.y, p.z], i * 3);
      p.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      rn.set([p.x, p.y, p.z], i * 3);
    }
    geo.setAttribute('restPos', new THREE.BufferAttribute(rp, 3));
    geo.setAttribute('restNormal', new THREE.BufferAttribute(rn, 3));
  });
}
