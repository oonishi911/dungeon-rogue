// 探索画面の3D表示（Three.js）。斜め上から見下ろすカメラで、主人公を滑らかに追う。
// 2D表示（exploreRender.ts）と同じ Frame を受け取って描くので、操作やゲームのルールは共通。
//
// - 床と壁は、同じ形をまとめて描く InstancedMesh で描く。主人公の周りの画面に映る範囲だけを描くので、
//   マップがどれだけ広くても描く量は変わらない
// - 床と壁には、ダンジョン特性ごとのテクスチャ（public/textures/{特性}.png）を貼る。読み込むまでは色で描く
// - 霧：まだ見ていないマスは描かない。一度見たマスは暗く、今見えているマスは明るく描く
// - 主人公は立体の模型（hero3d.ts）。敵と宝箱は、今のドット絵を常にカメラを向く板（スプライト）として立てる

import * as THREE from 'three';
import { enemyDef } from '../game/enemies';
import { dirBetween, EXPLORE_CONFIG, upStairs, type Dir, type ExploreState } from '../game/explore';
import type { Pos } from '../game/map';
import type { TraitId } from '../game/types';
import { drawSprite } from '../sprites/canvas';
import type { SpriteId } from '../sprites/data';
import { cloakOf, ENEMY_LOOKS } from '../sprites/looks';
import { floorVariant } from './autotile';
import { ENEMY_MARK, lerp, type Frame } from './exploreRender';
import { Hero3D } from './hero3d';

// マスの大きさを1とした壁の高さ。高くすると通路が深く見える。
// 今のカメラの角度（約63度）では、高さ1までなら、すぐ手前の壁は隣のマスに立つキャラクターの足元に届く程度で、体は隠れない
const WALL_HEIGHT = 1;
const CAMERA = { height: 15, back: 7.5 }; // 主人公の真上15・手前7.5から見下ろす（約63度）
// 画面の大きさによらず、主人公のいるあたりの1マスが画面上でこの大きさ（CSSピクセル）に映るよう、視野の広さを決める。
// スマホの縦画面（幅約390px）で横に約8マス、PCの探索画面（幅約670px）で横に約14マス映る
const TILE_PX = 48;
const FOV_LIMIT = { min: 10, max: 75 }; // 極端に大きい・小さい画面でもゆがみすぎないように
// 攻撃したとき・攻撃されたときの画面効果：カメラを少し寄せて戻す（拡大縮小）。zoom は 1 からのずれの最大、ms は長さ
const HIT_PULSE = {
  attack: { zoom: 0.05, ms: 180 }, // 自分の攻撃：ぐっと寄って戻る
  hurt: { zoom: 0.08, ms: 260 }, // 敵の攻撃：寄ったあと少し引いて戻る
} as const;
export type HitPulse = keyof typeof HIT_PULSE;
// ダメージの数字：受けた側の頭の上に小さく出て、なめらかに大きくなりながら少し浮かび、透けて消える
const DAMAGE_POP = {
  ms: 550, // 出てから消えるまで
  from: 0.6, // 出たときの大きさ（マス）
  to: 1.3, // 消えるときの大きさ（マス）
  height: 1.05, // 出る高さ（マス）
  rise: 0.35, // 消えるまでに浮かぶ高さ（マス）
  colors: { dealt: '#ece5d3', taken: '#e5624f' }, // 与えた：明るい生成り / 受けた：赤
} as const;
const REMEMBERED = 0.3; // 一度見たが今は見えていないマスの明るさ
// 見える範囲の明るさ。主人公のそばは1で、視界の端へ向かってなめらかに edge まで暗くする。
// マスの明るさは、見え始め・見えなくなるときに fade の速さ（1秒あたり）で少しずつ変える
const SIGHT_LIGHT = { edge: 0.5, fade: 9 };
const FADED_WALL_OPACITY = 0.35; // 敵・宝箱・階段のすぐ手前にあって、それを隠してしまう壁の濃さ
// 壁の根元の影：壁に接する床の辺に敷く帯。幅（マスの何倍か）と、壁際でのいちばん濃いところ、薄くなり方
const WALL_SHADOW = { depth: 0.4, darkness: 0.8, falloff: 1.5 }; // falloff：大きいほど壁際で急に薄くなる
// 影の帯を敷く向き。dx・dz は壁のある方向、angle は帯の暗い側をその方向へ向ける回転
const SHADOW_SIDES = [
  { dx: 0, dz: -1, angle: 0 },
  { dx: 1, dz: 0, angle: -Math.PI / 2 },
  { dx: 0, dz: 1, angle: Math.PI },
  { dx: -1, dz: 0, angle: Math.PI / 2 },
] as const;
const BACKGROUND = 0x0b1413;
// 床と壁を描く範囲（主人公からのマス数）。画面に映る範囲（1マス48pxで、PCなら横14×縦11、スマホの縦画面なら横8×縦16マスほど）より、
// 動いている途中の分と、大きな画面の分だけ広くとる
const DRAW_RANGE = { x: 13, z: 17 };
const DRAW_CAPACITY = (DRAW_RANGE.x * 2 + 1) * (DRAW_RANGE.z * 2 + 1);
const PATH_CAPACITY = 256; // 歩く道筋の点を、いくつまで描くか

/**
 * テクスチャの中の配置（128×64px、1マス32px）。詳しくは docs/textures.md。
 * 1段目に床4種類、2段目に壁の上面と側面。壁の側面は、マスの下から壁の高さの分が使われる（高さ1なら全体）
 */
export const TEXTURE_ATLAS = {
  columns: 4,
  rows: 2,
  floors: [0, 1, 2, 3], // 1段目の何列目か
  wallTop: { col: 0, row: 1 },
  wallSide: { col: 1, row: 1 },
} as const;

interface Atlas {
  floors: THREE.Texture[];
  top: THREE.Texture;
  side: THREE.Texture;
}

/** テクスチャを読み込む前（または読み込めなかったとき）の、ダンジョン特性ごとの床と壁の色 */
const TRAIT_COLORS: Record<TraitId, { floor: number; wall: number }> = {
  fire: { floor: 0x4a2a22, wall: 0x8a3a26 },
  ice: { floor: 0x253a48, wall: 0x6a9cbc },
  neutral: { floor: 0x2e3a36, wall: 0x66766f },
  light: { floor: 0x4a4430, wall: 0xc9bb8a },
  dark: { floor: 0x241d32, wall: 0x52466e },
};

export class DungeonView3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly torch = new THREE.PointLight(0xffd9a0, 6, 8, 1.2);
  private readonly raycaster = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private shownState: ExploreState | null = null;
  private readonly floors: THREE.InstancedMesh[]; // 床の模様ごとに1つ
  private readonly walls: THREE.InstancedMesh;
  private readonly fadedWalls: THREE.InstancedMesh; // 半透明にした壁
  private readonly wallShadows: THREE.InstancedMesh; // 壁の根元の影
  private readonly wallMaterials: { top: THREE.MeshLambertMaterial; side: THREE.MeshLambertMaterial }[]; // 0：普通、1：半透明
  private readonly atlases = new Map<TraitId, Atlas | null>(); // null は読み込み中か、読み込めなかった
  private appliedAtlas: Atlas | null = null;
  private readonly props = new THREE.Group(); // 階段・宝箱・目印
  private readonly hero = new Hero3D(); // 主人公は立体の模型（敵や宝箱はドット絵の板のまま）
  private heroDir: Dir = 'down'; // 最後に歩いた向き。模型をこの向きへ回す
  private lastFrameAt = performance.now();
  private readonly reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private pulse: { kind: HitPulse; start: number } | null = null;
  private readonly damagePops: { sprite: THREE.Sprite; start: number }[] = [];
  // 霧：描いている床と壁の1つ1つ（どの入れ物の何番目か・どのマスか・元の色）と、マスごとの今の明るさ
  private fogTiles: { mesh: THREE.InstancedMesh; slot: number; tile: number; x: number; z: number; base: THREE.Color }[] = [];
  private readonly brightness = new Map<number, number>();
  private brightnessMap: unknown = null; // brightness がどの階のものか
  private fogVisible: Set<number> = new Set();
  private readonly enemies = new Map<number, { body: THREE.Sprite; mark: THREE.Sprite; hp: THREE.Sprite; ring: THREE.Mesh | null }>();
  private readonly textures = new Map<string, THREE.Texture>();
  private readonly materials = new Map<string, THREE.SpriteMaterial>();
  // 階段・宝箱・目印は形も素材も決まっているので、最初に1回だけ作って使い回す
  private readonly shared = {
    hole: new THREE.PlaneGeometry(0.8, 0.8).rotateX(-Math.PI / 2),
    bars: [0, 1, 2].map((step) => new THREE.PlaneGeometry(0.7 - step * 0.15, 0.08).rotateX(-Math.PI / 2)),
    chest: new THREE.BoxGeometry(0.5, 0.32, 0.38),
    // 上り階段：奥（上の画面側）へ向かって高くなる3段の石段
    upSteps: [0, 1, 2].map((step) => new THREE.BoxGeometry(0.7, 0.07 * (step + 1), 0.24).translate(0, 0.035 * (step + 1), 0)),
    ring: new THREE.RingGeometry(0.4, 0.48, 24).rotateX(-Math.PI / 2),
    targetRing: new THREE.RingGeometry(0.32, 0.42, 24).rotateX(-Math.PI / 2),
    holeMat: new THREE.MeshBasicMaterial({ color: 0x05080a }),
    barMat: [1, REMEMBERED].map((k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(0xece5d3).multiplyScalar(k) })),
    chestMat: [1, REMEMBERED].map((k) => new THREE.MeshLambertMaterial({ color: new THREE.Color(0xe2c178).multiplyScalar(k) })),
    stepMat: [1, REMEMBERED].map((k) => new THREE.MeshLambertMaterial({ color: new THREE.Color(0xc9c3b3).multiplyScalar(k) })),
    eliteMat: new THREE.MeshBasicMaterial({ color: 0xd9653b }),
    bossMat: new THREE.MeshBasicMaterial({ color: 0xb48d35 }),
    targetMat: new THREE.MeshBasicMaterial({ color: 0x9cc46a }),
  };
  private readonly target: THREE.Mesh;
  private readonly pathDots: THREE.InstancedMesh; // 歩く道筋の点
  private shownPath: Pos[] | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.width, canvas.height, false);
    this.scene.background = new THREE.Color(BACKGROUND);

    this.camera = new THREE.PerspectiveCamera(40, canvas.width / canvas.height, 0.1, 100); // 視野は resize で決め直す
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2); // 壁の側面に陰をつける
    sun.position.set(-3, 10, 4);
    this.scene.add(sun, this.torch, this.props);

    // 床と壁は、描く範囲のマス数ぶんの入れ物を最初に用意しておき、1歩ごとに中身を入れ替える。
    // 床は模様ごとにテクスチャが違うので、模様の数だけ入れ物を分ける
    const floorGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.floors = TEXTURE_ATLAS.floors.map(() => new THREE.InstancedMesh(floorGeo, new THREE.MeshLambertMaterial(), DRAW_CAPACITY));
    // 壁は面ごとに素材を分ける。箱の面の順番は +x, -x, +y（上）, -y（下）, +z, -z。
    // 敵などを隠してしまう手前の壁は、半透明の素材で別に描く
    this.wallMaterials = [{}, { transparent: true, opacity: FADED_WALL_OPACITY, depthWrite: false }].map((extra) => ({
      top: new THREE.MeshLambertMaterial({ vertexColors: true, ...extra }),
      side: new THREE.MeshLambertMaterial({ vertexColors: true, ...extra }),
    }));
    const wallGeo = shadedBox(WALL_HEIGHT);
    const [solid, faded] = this.wallMaterials.map(({ top, side }) => [side, side, top, side, side, side]);
    this.walls = new THREE.InstancedMesh(wallGeo, solid!, DRAW_CAPACITY);
    this.fadedWalls = new THREE.InstancedMesh(wallGeo, faded!, DRAW_CAPACITY);
    // 壁の根元の影。帯の上側（北）が暗く、下側へ向かって消えていく。向きはインスタンスごとに回す
    const shadowGeo = new THREE.PlaneGeometry(1, WALL_SHADOW.depth).rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      alphaMap: this.texture('wall-shadow', 1, 32, (ctx) => {
        // alphaMap は明るさを濃さとして使う。壁際（上）ほど明るく、なめらかに暗くする
        for (let y = 0; y < 32; y++) {
          const k = Math.round(255 * WALL_SHADOW.darkness * (1 - y / 31) ** WALL_SHADOW.falloff);
          ctx.fillStyle = `rgb(${k},${k},${k})`;
          ctx.fillRect(0, y, 1, 1);
        }
      }),
      transparent: true,
      depthWrite: false,
    });
    this.wallShadows = new THREE.InstancedMesh(shadowGeo, shadowMat, DRAW_CAPACITY * SHADOW_SIDES.length);
    for (const mesh of [...this.floors, this.walls, this.fadedWalls, this.wallShadows]) {
      // 中身を毎回入れ替えるので、最初の中身で計算された範囲で画面外と判定されないようにする
      mesh.frustumCulled = false;
      this.scene.add(mesh);
    }

    this.target = new THREE.Mesh(this.shared.targetRing, this.shared.targetMat);
    this.pathDots = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.08, 12).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x9cc46a, transparent: true, opacity: 0.75, depthWrite: false }),
      PATH_CAPACITY,
    );
    this.pathDots.frustumCulled = false;
    this.pathDots.count = 0;
    this.scene.add(this.hero.root, this.target, this.pathDots);
  }

  /**
   * 画面上の大きさ（CSSピクセル）に合わせて、描く解像度とカメラの縦横比を変える。
   * 視野の広さは、画面の大きさによらず1マスが画面上で TILE_PX に映るように決める
   */
  resize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height, false);
    // 主人公までの距離で1マスが TILE_PX に映る視野：画面の高さの半分 ÷（距離 × TILE_PX）= tan(視野の半分)
    const distance = Math.hypot(CAMERA.height, CAMERA.back);
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(height / 2 / (distance * TILE_PX)));
    this.camera.aspect = width / height;
    this.camera.fov = THREE.MathUtils.clamp(fov, FOV_LIMIT.min, FOV_LIMIT.max);
    this.camera.updateProjectionMatrix();
  }

  /** 1フレーム描く。状態が変わったときだけ、霧や敵の作り直しをする */
  render(frame: Frame) {
    const s = frame.state;
    if (s !== this.shownState) {
      this.updateFog(frame);
      this.updateProps(frame);
      this.updateEnemies(frame);
      this.hero.setCloak(cloakOf(s.stats.armor)); // マントは装備した防具の色。準備が当たったかが見た目でわかる
      this.shownState = s;
    }

    // 動きの途中の位置
    const p = lerp(frame.from.player, s.player, frame.progress);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrameAt) / 1000);
    this.lastFrameAt = now;
    const moved = frame.from.player.x !== s.player.x || frame.from.player.y !== s.player.y;
    // 1マスずつ動くので、前の位置から今の位置への向きが歩いた向き（階を移ったときは向きを変えない）
    if (moved && Math.abs(frame.from.player.x - s.player.x) + Math.abs(frame.from.player.y - s.player.y) === 1) {
      this.heroDir = dirBetween(frame.from.player, s.player);
    }
    this.hero.update(p.x, p.y, this.heroDir, moved ? frame.progress : 1, dt, this.reduceMotion);
    this.updateLight(p, dt);
    this.updateDamagePops(now);
    const zoom = this.pulseZoom(now);
    if (zoom !== this.camera.zoom) {
      this.camera.zoom = zoom;
      this.camera.updateProjectionMatrix();
    }
    this.torch.position.set(p.x, 1.6, p.y);
    this.camera.position.set(p.x, CAMERA.height, p.y + CAMERA.back);
    this.camera.lookAt(p.x, 0, p.y);
    for (const e of s.enemies) {
      const view = this.enemies.get(e.uid);
      if (!view) continue;
      const at = lerp(frame.from.enemies.get(e.uid) ?? e.pos, e.pos, frame.progress);
      view.body.position.set(at.x, 0.5, at.y);
      view.mark.position.set(at.x, 1.15, at.y);
      view.hp.position.set(at.x, 0.06, at.y);
      view.ring?.position.set(at.x, 0.02, at.y);
    }
    this.updateWalkTarget(frame.walkTarget);
    this.updateWalkPath(frame.walkPath);
    this.renderer.render(this.scene, this.camera);
  }

  /** 攻撃したとき・攻撃されたときに、画面を少し拡大縮小する。動きを減らす設定では何もしない */
  hitPulse(kind: HitPulse) {
    if (this.reduceMotion) return;
    // 敵の攻撃は、自分の攻撃より目立たせる（同時に起きたら敵の攻撃の効果にする）
    if (this.pulse?.kind === 'hurt' && kind === 'attack' && performance.now() - this.pulse.start < HIT_PULSE.hurt.ms) return;
    this.pulse = { kind, start: performance.now() };
  }

  /**
   * ダメージの数字を出す。at は受けた側のマス、kind は与えた（dealt）か受けた（taken）か。
   * 同じマスに続けて出るときは、少しずつ横にずらして重ならないようにする
   */
  popDamage(at: Pos, amount: number, kind: 'dealt' | 'taken') {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.font = '900 46px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(11, 20, 19, 0.9)';
    ctx.strokeText(String(amount), 64, 34);
    ctx.fillStyle = DAMAGE_POP.colors[kind];
    ctx.fillText(String(amount), 64, 34);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
    sprite.renderOrder = 20; // 壁や敵より手前に出す
    const now = performance.now();
    const crowd = this.damagePops.filter((p) => p.sprite.userData.tile === `${at.x},${at.y}` && now - p.start < DAMAGE_POP.ms / 2).length;
    sprite.userData = { tile: `${at.x},${at.y}`, x: at.x + crowd * 0.45, z: at.y };
    this.scene.add(sprite);
    this.damagePops.push({ sprite, start: now });
    this.updateDamagePops(now);
  }

  /** ダメージの数字を動かし、消え終わったものを片付ける */
  private updateDamagePops(now: number) {
    for (let k = this.damagePops.length - 1; k >= 0; k--) {
      const { sprite, start } = this.damagePops[k]!;
      const t = Math.min(1, (now - start) / DAMAGE_POP.ms);
      if (t >= 1) {
        this.scene.remove(sprite);
        sprite.material.map?.dispose();
        sprite.material.dispose();
        this.damagePops.splice(k, 1);
        continue;
      }
      const grow = 1 - (1 - t) ** 3; // 出だしは速く、だんだんゆっくり大きくなる
      const size = this.reduceMotion ? DAMAGE_POP.to * 0.75 : DAMAGE_POP.from + (DAMAGE_POP.to - DAMAGE_POP.from) * grow;
      sprite.scale.set(size * 2, size, 1); // 字の画像は横長（2:1）
      const { x, z } = sprite.userData as { x: number; z: number };
      sprite.position.set(x, DAMAGE_POP.height + (this.reduceMotion ? 0 : DAMAGE_POP.rise * grow), z);
      // はじめははっきり見せ、後半でなめらかに透けていく
      const fade = t < 0.35 ? 1 : 1 - ((t - 0.35) / 0.65) ** 2;
      sprite.material.opacity = Math.max(0, fade);
    }
  }

  /** 今のカメラの倍率。効果のあいだだけ 1 からずれる */
  private pulseZoom(now: number): number {
    if (!this.pulse) return 1;
    const { zoom, ms } = HIT_PULSE[this.pulse.kind];
    const t = (now - this.pulse.start) / ms;
    if (t >= 1) {
      this.pulse = null;
      return 1;
    }
    // 自分の攻撃は寄って戻るだけ。敵の攻撃は、寄ったあと少し引いてから戻る（揺さぶられる感じ）
    return this.pulse.kind === 'attack'
      ? 1 + zoom * Math.sin(Math.PI * t)
      : 1 + zoom * Math.sin(2 * Math.PI * t) * (1 - t);
  }

  /** 画面上の位置へ向かう視線を、カメラから飛ばす */
  private aimRay(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
  }

  /**
   * 画面上の位置が主人公の絵に当たっているか（主人公をタップするとその場で待つ）。
   * 主人公の絵は足元のマスより上に伸びているので、足元のマスだけでなく絵そのものに当てる
   */
  hitsPlayer(clientX: number, clientY: number): boolean {
    this.aimRay(clientX, clientY);
    return this.raycaster.intersectObject(this.hero.hitBox, false).length > 0;
  }

  /** 画面上の位置から、床のマスを求める（タップ・クリックで歩く先） */
  pickTile(clientX: number, clientY: number): Pos | null {
    this.aimRay(clientX, clientY);
    const hit = this.raycaster.ray.intersectPlane(this.ground, new THREE.Vector3());
    return hit ? { x: Math.round(hit.x), y: Math.round(hit.z) } : null;
  }

  dispose() {
    this.floors[0]!.geometry.dispose(); // 床の形はすべての入れ物で共通
    this.walls.geometry.dispose(); // 半透明の壁と共通
    this.wallShadows.geometry.dispose();
    this.pathDots.geometry.dispose();
    (this.pathDots.material as THREE.Material).dispose();
    this.pathDots.dispose();
    this.hero.dispose();
    for (const { sprite } of this.damagePops) {
      sprite.material.map?.dispose();
      sprite.material.dispose();
    }
    for (const mesh of [...this.floors, this.walls, this.fadedWalls, this.wallShadows]) {
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) mat.dispose();
      mesh.dispose();
    }
    for (const atlas of this.atlases.values()) {
      for (const t of atlas ? [...atlas.floors, atlas.top, atlas.side] : []) t.dispose();
    }
    for (const r of Object.values(this.shared)) for (const d of Array.isArray(r) ? r : [r]) d.dispose();
    for (const m of this.materials.values()) m.dispose();
    for (const t of this.textures.values()) t.dispose();
    this.renderer.dispose();
  }

  // ===== 床・壁・霧 =====

  /**
   * 主人公の周りの床と壁を入れ物に詰め直す。
   * まだ見ていないマスは描かず、一度見たマスは暗く、今見えているマスは明るく描く
   */
  private updateFog(frame: Frame) {
    const { map, seen, player, trait } = frame.state;
    const atlas = this.atlasFor(trait);
    if (atlas !== this.appliedAtlas) this.applyAtlas(atlas);
    // テクスチャがあれば色はテクスチャに任せ、明るさだけを掛ける。なければ特性ごとの色で描く
    const colors = TRAIT_COLORS[trait];
    const floorBase = new THREE.Color(atlas ? 0xffffff : colors.floor);
    const wallBase = new THREE.Color(atlas ? 0xffffff : colors.wall);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const floorCounts = this.floors.map(() => 0);
    let walls = 0;
    let fadedWalls = 0;
    let shadows = 0;
    const faded = this.wallsToFade(frame);
    if (this.brightnessMap !== map) {
      this.brightness.clear(); // 階が変わったら、明るさの記憶をやり直す
      this.brightnessMap = map;
    }
    this.fogTiles = [];
    this.fogVisible = frame.visible;
    const remember = (mesh: THREE.InstancedMesh, slot: number, tile: number, x: number, z: number, base: THREE.Color) =>
      this.fogTiles.push({ mesh, slot, tile, x, z, base: base.clone() });
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const at = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    // 一度見た壁だけに影を付ける（まだ見ていない壁の影から、霧の向こうの形がわからないように）
    const seenWall = (x: number, z: number) =>
      x >= 0 && z >= 0 && x < map.width && z < map.height && map.tiles[z * map.width + x] === 'wall' && seen[z * map.width + x];
    for (let z = player.y - DRAW_RANGE.z; z <= player.y + DRAW_RANGE.z; z++) {
      for (let x = player.x - DRAW_RANGE.x; x <= player.x + DRAW_RANGE.x; x++) {
        if (x < 0 || z < 0 || x >= map.width || z >= map.height) continue;
        const i = z * map.width + x;
        if (!seen[i]) continue;
        // 明るさは毎フレーム updateLight で掛ける。ここでは元の色だけを覚えておく
        if (map.tiles[i] === 'wall') {
          m.makeTranslation(x, WALL_HEIGHT / 2, z);
          if (faded.has(i)) {
            this.fadedWalls.setMatrixAt(fadedWalls, m);
            remember(this.fadedWalls, fadedWalls++, i, x, z, wallBase);
          } else {
            this.walls.setMatrixAt(walls, m);
            remember(this.walls, walls++, i, x, z, wallBase);
          }
        } else {
          // 床の模様はマスの位置で決める（2D表示と同じ決め方）。色だけで描くときは明るさを少し変える
          const k = floorVariant(x, z);
          const variety = atlas ? 1 : 0.9 + k * 0.05;
          this.floors[k]!.setMatrixAt(floorCounts[k]!, m.makeTranslation(x, 0, z));
          remember(this.floors[k]!, floorCounts[k]!++, i, x, z, c.copy(floorBase).multiplyScalar(variety));
          // 壁に接する辺に、影の帯を壁側へ寄せて敷く
          for (const side of SHADOW_SIDES) {
            if (!seenWall(x + side.dx, z + side.dz)) continue;
            const offset = 0.5 - WALL_SHADOW.depth / 2;
            at.set(x + side.dx * offset, 0.01, z + side.dz * offset);
            this.wallShadows.setMatrixAt(shadows++, m.compose(at, q.setFromAxisAngle(up, side.angle), one));
          }
        }
      }
    }
    const counts = [
      ...this.floors.map((mesh, k) => [mesh, floorCounts[k]!] as const),
      [this.walls, walls] as const,
      [this.fadedWalls, fadedWalls] as const,
      [this.wallShadows, shadows] as const,
    ];
    for (const [mesh, count] of counts) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * 床と壁の明るさを毎フレーム決める。見えているマスは、主人公（動いている途中の位置）から離れるほど
   * なめらかに暗く、見えていないマスは REMEMBERED。マスの明るさは、目標の明るさへ少しずつ近づける
   */
  private updateLight(at: Pos, dt: number) {
    const radius = EXPLORE_CONFIG.sightRadius + 0.5;
    const step = this.reduceMotion ? 1 : Math.min(1, dt * SIGHT_LIGHT.fade);
    const c = new THREE.Color();
    const touched = new Set<THREE.InstancedMesh>();
    const done = new Set<number>(); // 同じマスの明るさを1フレームに2回進めない
    for (const t of this.fogTiles) {
      let light = this.brightness.get(t.tile);
      if (!done.has(t.tile)) {
        let target = REMEMBERED;
        if (this.fogVisible.has(t.tile)) {
          const d = Math.min(1, Math.hypot(t.x - at.x, t.z - at.y) / radius);
          const smooth = d * d * (3 - 2 * d); // なめらかに変わる曲線（smoothstep）
          target = 1 - (1 - SIGHT_LIGHT.edge) * smooth;
        }
        // 初めて見えたマスは暗いところから明るくする
        light = light === undefined ? (this.reduceMotion ? target : 0) : light;
        light += (target - light) * step;
        this.brightness.set(t.tile, light);
        done.add(t.tile);
      }
      t.mesh.setColorAt(t.slot, c.copy(t.base).multiplyScalar(light!));
      touched.add(t.mesh);
    }
    for (const mesh of touched) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /**
   * 半透明にする壁（マスの番号）。今見えている敵・宝箱・階段の、すぐ手前（カメラ側）にある壁。
   * 主人公は壁より手前に描くので含めない（歩くたびに壁が透けると、立体感が薄れるため）
   */
  private wallsToFade(frame: Frame): Set<number> {
    const { map, enemies, chests } = frame.state;
    const result = new Set<number>();
    const behind = (p: Pos) => {
      if (!frame.visible.has(p.y * map.width + p.x) || p.y + 1 >= map.height) return;
      const i = (p.y + 1) * map.width + p.x;
      if (map.tiles[i] === 'wall') result.add(i);
    };
    for (const e of enemies) behind(e.pos);
    for (const c of chests) behind(c.pos);
    if (map.stairs) behind(map.stairs);
    const up = upStairs(frame.state);
    if (up) behind(up);
    return result;
  }

  /** ダンジョン特性のテクスチャ。まだ読み込んでいなければ読み込みを始めて null を返す */
  private atlasFor(trait: TraitId): Atlas | null {
    if (!this.atlases.has(trait)) {
      this.atlases.set(trait, null);
      new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/${trait}.png`, (image) => {
        this.atlases.set(trait, {
          floors: TEXTURE_ATLAS.floors.map((col) => cropTexture(image, col, 0)),
          top: cropTexture(image, TEXTURE_ATLAS.wallTop.col, TEXTURE_ATLAS.wallTop.row),
          // 側面は箱の高さに合わせて、マスの下から壁の高さの分だけを使う（ドット絵が縦に縮まないように）
          side: cropTexture(image, TEXTURE_ATLAS.wallSide.col, TEXTURE_ATLAS.wallSide.row, WALL_HEIGHT),
        });
        image.dispose();
        this.shownState = null; // 次のフレームで描き直す
      });
      // 読み込めなかったときは null のままにして、色で描き続ける
    }
    return this.atlases.get(trait) ?? null;
  }

  private applyAtlas(atlas: Atlas | null) {
    this.floors.forEach((mesh, k) => {
      const mat = mesh.material as THREE.MeshLambertMaterial;
      mat.map = atlas?.floors[k] ?? null;
      mat.needsUpdate = true;
    });
    for (const { top, side } of this.wallMaterials) {
      top.map = atlas?.top ?? null;
      side.map = atlas?.side ?? null;
      top.needsUpdate = true;
      side.needsUpdate = true;
    }
    this.appliedAtlas = atlas;
  }

  // ===== 階段・宝箱 =====

  private updateProps(frame: Frame) {
    const { map, seen, chests } = frame.state;
    this.props.clear();
    // 今見えていれば明るい素材（0番）、一度見ただけなら暗い素材（1番）
    const dim = (p: Pos) => (frame.visible.has(p.y * map.width + p.x) ? 0 : 1);

    if (map.stairs && seen[map.stairs.y * map.width + map.stairs.x]) {
      // 下り階段：床に開いた穴と、段の線
      const hole = new THREE.Mesh(this.shared.hole, this.shared.holeMat);
      hole.position.set(map.stairs.x, 0.01, map.stairs.y);
      this.props.add(hole);
      this.shared.bars.forEach((geo, step) => {
        const bar = new THREE.Mesh(geo, this.shared.barMat[dim(map.stairs!)]);
        bar.position.set(map.stairs!.x, 0.02, map.stairs!.y - 0.25 + step * 0.22);
        this.props.add(bar);
      });
    }
    const up = upStairs(frame.state);
    if (up && seen[up.y * map.width + up.x]) {
      // 上り階段：床から奥へ向かって高くなる石段
      this.shared.upSteps.forEach((geo, step) => {
        const block = new THREE.Mesh(geo, this.shared.stepMat[dim(up)]);
        block.position.set(up.x, 0, up.y + 0.25 - step * 0.25);
        this.props.add(block);
      });
    }
    for (const chest of chests) {
      if (!seen[chest.pos.y * map.width + chest.pos.x]) continue;
      const box = new THREE.Mesh(this.shared.chest, this.shared.chestMat[dim(chest.pos)]);
      box.position.set(chest.pos.x, 0.16, chest.pos.y);
      this.props.add(box);
    }
  }

  /** 歩く道筋に点を並べる。行き先は輪で示すので除く */
  private updateWalkPath(path: Pos[]) {
    if (path === this.shownPath) return;
    this.shownPath = path;
    const dots = path.slice(0, -1).slice(0, PATH_CAPACITY);
    const m = new THREE.Matrix4();
    dots.forEach((p, i) => this.pathDots.setMatrixAt(i, m.makeTranslation(p.x, 0.025, p.y)));
    this.pathDots.count = dots.length;
    this.pathDots.instanceMatrix.needsUpdate = true;
  }

  private updateWalkTarget(target: Pos | null) {
    this.target.visible = target !== null;
    if (target) this.target.position.set(target.x, 0.03, target.y);
  }

  // ===== 敵 =====

  /** 今見えているマスにいる敵だけを表示する */
  private updateEnemies(frame: Frame) {
    const { state, visible } = frame;
    const shown = new Set<number>();
    for (const e of state.enemies) {
      if (!visible.has(e.pos.y * state.map.width + e.pos.x)) continue;
      shown.add(e.uid);
      let view = this.enemies.get(e.uid);
      if (!view) {
        const look = ENEMY_LOOKS[e.id];
        const def = enemyDef(e);
        // 強敵は赤い輪、ボスは金の輪を足元に置く
        const ring = e.elite ? new THREE.Mesh(this.shared.ring, def.boss ? this.shared.bossMat : this.shared.eliteMat) : null;
        view = { body: new THREE.Sprite(this.spriteMaterial(look.sprite, look.recolor ?? {})), mark: new THREE.Sprite(), hp: new THREE.Sprite(), ring };
        this.scene.add(view.body, view.mark, view.hp);
        if (ring) this.scene.add(ring);
        this.enemies.set(e.uid, view);
      }
      // 頭上のマーク。気付いた瞬間の「！」だけ大きく強調する
      view.mark.material = this.textMaterial(ENEMY_MARK[e.mode].mark, e.mode === 'wander' ? '#b9b29f' : '#e2c178');
      view.mark.scale.setScalar(e.justNoticed ? 0.7 : 0.45);
      const def = enemyDef(e);
      view.hp.visible = e.hp < def.hp;
      view.hp.material = this.hpMaterial(Math.ceil((e.hp / def.hp) * 10));
      view.hp.scale.set(0.8, 0.1, 1);
    }
    for (const [uid, view] of this.enemies) {
      if (shown.has(uid)) continue;
      this.scene.remove(view.body, view.mark, view.hp);
      if (view.ring) this.scene.remove(view.ring);
      this.enemies.delete(uid);
    }
  }

  // ===== 素材 =====

  /**
   * ドット絵をテクスチャにする。ぼかさずに拡大する。
   * alwaysOnTop にすると、手前の壁に隠れずに描く（主人公を見失わないため）
   */
  private spriteMaterial(id: SpriteId, colors: Record<string, string>, alwaysOnTop = false): THREE.SpriteMaterial {
    const key = `sprite:${id}:${JSON.stringify(colors)}`;
    const map = this.texture(key, 32, 32, (ctx) => drawSprite(ctx, id, 0, 0, 32, colors));
    return this.material(`${key}:${alwaysOnTop}`, { map, alphaTest: 0.5, depthTest: !alwaysOnTop });
  }

  /** 敵の頭上のマーク。壁の向こうでも隠れないよう、奥行きを無視して手前に描く */
  private textMaterial(text: string, color: string): THREE.SpriteMaterial {
    const key = `text:${text}:${color}`;
    const map = this.texture(key, 32, 32, (ctx) => {
      ctx.font = '900 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#0b1413';
      ctx.strokeText(text, 16, 17);
      ctx.fillStyle = color;
      ctx.fillText(text, 16, 17);
    });
    return this.material(key, { map, transparent: true, depthTest: false });
  }

  /** 敵のHPバー。残りを10段階で表す */
  private hpMaterial(tenths: number): THREE.SpriteMaterial {
    const key = `hp:${tenths}`;
    const map = this.texture(key, 20, 2, (ctx) => {
      ctx.fillStyle = '#0b1413';
      ctx.fillRect(0, 0, 20, 2);
      ctx.fillStyle = '#e2c178';
      ctx.fillRect(0, 0, tenths * 2, 2);
    });
    return this.material(key, { map, depthTest: false });
  }

  /** 板の素材も、種類ごとに1回だけ作って使い回す */
  private material(key: string, params: THREE.SpriteMaterialParameters): THREE.SpriteMaterial {
    let mat = this.materials.get(key);
    if (!mat) {
      mat = new THREE.SpriteMaterial(params);
      this.materials.set(key, mat);
    }
    return mat;
  }

  private texture(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.Texture {
    let tex = this.textures.get(key);
    if (!tex) {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      draw(ctx);
      tex = new THREE.CanvasTexture(canvas);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.textures.set(key, tex);
    }
    return tex;
  }
}

/**
 * テクスチャの中の1マス分を切り出す。visibleHeight はマスの下から何割を使うか。
 * 画像は上下が反転して読み込まれるので、上の段ほど v（縦の座標）が大きい
 */
function cropTexture(image: THREE.Texture, col: number, row: number, visibleHeight = 1): THREE.Texture {
  const t = image.clone();
  t.repeat.set(1 / TEXTURE_ATLAS.columns, visibleHeight / TEXTURE_ATLAS.rows);
  t.offset.set(col / TEXTURE_ATLAS.columns, 1 - (row + 1) / TEXTURE_ATLAS.rows);
  // ドット絵なのでぼかさない。縮小用の画像（ミップマップ）を作ると隣のマスの色が混ざるので作らない
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** 上面を明るく、側面を暗くした箱（壁）。色はインスタンスごとの色と掛け合わされる */
function shadedBox(height: number): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(1, height, 1);
  // BoxGeometry の面の順番は +x, -x, +y（上）, -y（下）, +z, -z で、1面につき頂点4つ
  const shade = [0.7, 0.7, 1.15, 0.3, 0.85, 0.6];
  const colors: number[] = [];
  for (const k of shade) for (let v = 0; v < 4; v++) colors.push(k, k, k);
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}
