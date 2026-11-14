// 探索画面の3D表示（Three.js）。斜め上から見下ろすカメラで、主人公を滑らかに追う。
// 探索画面（ExploreScreen.tsx）から、1コマの情報（exploreRender.ts の Frame）を受け取って描く。
//
// - 床と壁は、同じ形をまとめて描く InstancedMesh で描く。主人公の周りの画面に映る範囲だけを描くので、
//   マップがどれだけ広くても描く量は変わらない
// - 床と壁には、ダンジョン特性ごとのテクスチャ（public/textures/{特性}.png）を貼る。読み込むまでは色で描く
// - 霧：まだ見ていないマスは描かない。一度見たマスは暗く、今見えているマスは明るく描く
// - 主人公は立体の模型（hero3d.ts）。敵も、形も色もプログラムで組んだ立体の模型（creatures.ts）。
//   模型のない敵（新しく足した敵など）と宝箱は、絵を常にカメラを向く板（スプライト）として立てる

import * as THREE from 'three';
import { ITEMS } from '../game/data';
import { enemyDef, isAdjacent } from '../game/enemies';
import { upStairs } from '../game/explore';
import { type CastEvent, type Dir, type ExploreState } from '../game/exploreTypes';
import { dirBetween } from '../game/exploreSight';
import type { Pos } from '../game/map';
import type { EnemyId, ItemId, TraitId, WeaponType } from '../game/types';
import { drawSprite } from '../sprites/canvas';
import type { SpriteId } from '../sprites/data';
import { cloakOf, lookOf } from '../sprites/looks';
import { floorVariant } from './floorVariant';
import { ENEMY_MARK, lerp, type Frame } from './exploreRender';
import { Hero3D } from './hero3d';
import { Creature, CREATURE_IDS, type CreatureId } from './creatures';
import { exposureOf, softWallGeometry } from './softWall';
import { SpellEffects } from './spellFx';
import { Stairs3D } from './stairs3d';
import { AMBIENT, BACKGROUND, CAMERA, CHEST, COMBAT_ZOOM, DAMAGE_POP, DRAW_CAPACITY, DRAW_RANGE, DYING_EXTRA_MS, FLOOR_KINDS, FOV_LIMIT, HIT_PULSE, MAX_ANISOTROPY, NO_GLOSS, OPENED_CHEST, PATH_CAPACITY, RESOLUTION, SHADOW_SIDES, SPELL_KNOCK, SUN, TEXTURE_FILES, TILE_PX, TORCH, TRAIT_COLORS, TRAIT_GLOSS, WALL_HEIGHT, WALL_ROUND, WALL_SHADOW, WALL_SHAPES, type HitPulse } from './explore3dConfig';
import { applyFog, createFog, litBillboard, worldMapped } from './explore3dKit';


interface Atlas {
  floor: THREE.Texture;
  top: THREE.Texture;
  side: THREE.Texture;
}

/** from から to を見たときの向き（離れていてもよい。縦と横で、差の大きい方の向き） */
/** 立体の模型で描く敵 */
type EnemyModel = {
  root: THREE.Object3D;
  height: number; // 頭のてっぺんの高さ（マス）
  update(x: number, z: number, dir: Dir, walking: boolean, dt: number): void;
  dispose(): void;
};
/** 形も色もプログラムで組んだ模型（creatures.ts）がある敵か */
const isCreature = (id: EnemyId): id is EnemyId & CreatureId => (CREATURE_IDS as readonly string[]).includes(id);
function facingToward(from: Pos, to: Pos): Dir {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy >= 0 ? 'down' : 'up';
}


export class DungeonView3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  // たいまつ：主人公の手元の高さの光。壁の上面より低いので、壁にさえぎられて影ができる（曲がり角の先や、
  // 入口から部屋の奥は暗いまま）。見える範囲の明るさは、ほぼこの光で決まる
  private readonly torch = new THREE.PointLight(TORCH.color, TORCH.intensity, TORCH.distance, TORCH.decay);
  private torchAt = new THREE.Vector3(Number.NaN, 0, 0); // 影を最後に描いたときの、たいまつの位置
  private readonly shadows = new URLSearchParams(location.search).get('shadow') !== 'off'; // ?shadow=off で影を切って比べられる
  private readonly raycaster = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private shownState: ExploreState | null = null;
  private readonly floors: THREE.InstancedMesh[]; // 床の模様ごとに1つ
  // 壁は、床に面している側面の組み合わせごとに形が違う（面した縁だけ丸める）ので、組み合わせごとに入れ物を分ける
  private readonly walls: THREE.InstancedMesh[];
  private readonly wallShadows: THREE.InstancedMesh; // 壁の根元の影
  private readonly wallMaterials: { top: THREE.MeshPhongMaterial; side: THREE.MeshPhongMaterial }[];
  private glossTrait: TraitId | null = null; // 床と壁のツヤを合わせた特性
  private readonly atlases = new Map<TraitId, Atlas | null>(); // null は読み込み中か、読み込めなかった
  private appliedAtlas: Atlas | null = null;
  private readonly props = new THREE.Group(); // 階段・宝箱・目印
  private readonly stairs: Stairs3D; // 特性ごとの階段の模型
  private readonly hero = new Hero3D(); // 主人公は立体の模型（敵や宝箱はドット絵の板のまま）
  private heroDir: Dir = 'down'; // 最後に歩いた向き。模型をこの向きへ回す
  private lastFrameAt = performance.now();
  private pixelRatio = Math.min(window.devicePixelRatio, RESOLUTION.max);
  private slowFrames = 0; // 描くのが間に合わなかったコマの数（解像度を下げるかを決める）
  private readonly reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly spellFx = new SpellEffects(this.scene, this.reduceMotion); // 呪文の演出
  private pulse: { kind: HitPulse; start: number } | null = null;
  // 呪文が当たった敵ののけぞり（base は、もう倒れている敵の、その場の位置）
  private knock: { uid: number; start: number; amount: number; dx: number; dz: number; base: THREE.Vector3 | null } | null = null;
  private spellDir: { dx: number; dz: number } = { dx: 0, dz: 1 }; // 最後に唱えた呪文の向き
  private readonly dying = new Map<number, number>(); // 呪文の矢が当たるまで残す、倒れた敵（uid → 消す時刻）
  private combatZoom = 1; // 戦闘中に寄せている倍率（なめらかに変わる）
  private lastCombatAt = -Infinity; // 最後に戦闘中だった時刻
  private readonly damagePops: { sprite: THREE.Sprite; start: number }[] = [];
  // 霧：描いている床と壁の1つ1つ（どの入れ物の何番目か・どのマスか・元の色）と、マスごとの今の明るさ
  // 霧：マスごとの「見えている」「一度見た」を1マス1ドットの小さな画像にして、描くときにピクセルごとになめらかに読む
  private readonly fog = createFog();
  private readonly enemies = new Map<
    number,
    {
      id: EnemyId;
      body: THREE.Object3D; // 絵の板（Mesh）か、立体の模型の入れ物
      model: EnemyModel | null; // 立体の模型で描く敵
      mark: THREE.Sprite;
      hp: THREE.Sprite;
      ring: THREE.Mesh | null;
      top: number;
      facing: Dir;
    }
  >();
  private readonly textures = new Map<string, THREE.Texture>();
  private readonly materials = new Map<string, THREE.SpriteMaterial>();
  private readonly litMaterials = new Map<string, THREE.MeshLambertMaterial>(); // たいまつで照らされるドット絵（敵）
  // 敵のドット絵を立てる板。いつもカメラの方を向けるが、光の当たり方は足元の床と同じになるよう、面の向き（法線）を真上にしてある
  private readonly billboard = litBillboard();
  // 宝箱・目印は形も素材も決まっているので、最初に1回だけ作って使い回す（階段は stairs3d.ts）
  private readonly shared = {
    // 宝箱：箱の本体と、かまぼこ形のふた（写真の宝箱の形）。正面は +z（画面の手前）
    chestBody: new THREE.BoxGeometry(CHEST.width, CHEST.height, CHEST.depth).translate(0, CHEST.height / 2, 0),
    chestLid: new THREE.CylinderGeometry(CHEST.depth / 2, CHEST.depth / 2, CHEST.width, 16, 1, false, 0, Math.PI)
      .rotateZ(Math.PI / 2) // 円柱の軸を左右（x）に向け、半分の丸みが上に来るようにする
      .translate(0, CHEST.height, 0),
    ring: new THREE.RingGeometry(0.4, 0.48, 24).rotateX(-Math.PI / 2),
    targetRing: new THREE.RingGeometry(0.32, 0.42, 24).rotateX(-Math.PI / 2),
    // 宝箱の素材。テクスチャ（public/textures/chest/）を読み込むまでは金色で描く
    chestFront: new THREE.MeshLambertMaterial({ color: 0xe2c178 }),
    chestSide: new THREE.MeshLambertMaterial({ color: 0xe2c178 }),
    chestLidMat: new THREE.MeshLambertMaterial({ color: 0xe2c178 }),
    // 開けた宝箱の口（中の暗がり）。箱の上の面より少し内側に敷く
    chestInside: new THREE.PlaneGeometry(CHEST.width - 0.05, CHEST.depth - 0.05).rotateX(-Math.PI / 2),
    chestInsideMat: new THREE.MeshLambertMaterial({ color: OPENED_CHEST.inside }),
    // 開けたふたの裏（ふたはかまぼこ形で裏に面がないので、平たい板を張る）
    chestLidInside: new THREE.PlaneGeometry(CHEST.width, CHEST.depth).rotateX(Math.PI / 2).translate(0, CHEST.height, 0),
    chestLidInsideMat: new THREE.MeshLambertMaterial({ color: OPENED_CHEST.lidInside, side: THREE.DoubleSide }),
    eliteMat: new THREE.MeshLambertMaterial({ color: 0xd9653b }),
    bossMat: new THREE.MeshLambertMaterial({ color: 0xb48d35 }),
    targetMat: new THREE.MeshBasicMaterial({ color: 0x9cc46a }),
  };
  private readonly target: THREE.Mesh;
  private readonly pathDots: THREE.InstancedMesh; // 歩く道筋の点
  private shownPath: Pos[] | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(canvas.width, canvas.height, false);
    if (this.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // 影の縁を少しぼかす
      this.renderer.shadowMap.autoUpdate = false; // 描き直すときを自分で決める（render の中）
      this.torch.castShadow = true;
      this.torch.shadow.mapSize.set(TORCH.shadowMapSize, TORCH.shadowMapSize);
      this.torch.shadow.camera.near = 0.1;
      this.torch.shadow.camera.far = TORCH.distance;
      this.torch.shadow.bias = -0.002;
      this.torch.shadow.normalBias = 0.02;
    }
    this.scene.background = new THREE.Color(BACKGROUND);

    this.camera = new THREE.PerspectiveCamera(40, canvas.width / canvas.height, 0.1, 100); // 視野は resize で決め直す
    this.scene.add(new THREE.AmbientLight(0xffffff, AMBIENT));
    const sun = new THREE.DirectionalLight(0xffffff, SUN); // 壁の側面に陰をつける
    sun.position.set(-3, 10, 4);
    this.scene.add(sun, this.torch, this.props);

    // 床と壁は、描く範囲のマス数ぶんの入れ物を最初に用意しておき、1歩ごとに中身を入れ替える。
    // 床はテクスチャがないときに明るさを少し変えて描き分けるので、FLOOR_KINDS 種類の入れ物に分ける（テクスチャは共通）
    const floorGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.floors = Array.from(
      { length: FLOOR_KINDS },
      () => new THREE.InstancedMesh(floorGeo, worldMapped(new THREE.MeshPhongMaterial({ ...NO_GLOSS }), 'floor', this.fog), DRAW_CAPACITY),
    );
    // 壁は上面と側面で素材を分ける（softWall.ts：0 が側面、1 が上面）。
    // 敵・宝箱・階段の手前に壁があっても、壁は透かさずにそのまま描く
    this.wallMaterials = [
      {
        top: worldMapped(new THREE.MeshPhongMaterial({ vertexColors: true, ...NO_GLOSS }), 'top', this.fog, true),
        side: worldMapped(new THREE.MeshPhongMaterial({ vertexColors: true, ...NO_GLOSS }), 'side', this.fog, true),
      },
    ];
    const { top: wallTop, side: wallSide } = this.wallMaterials[0]!;
    this.walls = Array.from({ length: WALL_SHAPES }, (_, k) => {
      const mesh = new THREE.InstancedMesh(softWallGeometry(exposureOf(k), WALL_HEIGHT, WALL_ROUND), [wallSide, wallTop], DRAW_CAPACITY);
      // 壁は光をさえぎって影を落とし、床と壁は影を受ける
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    });
    for (const floor of this.floors) floor.receiveShadow = true;
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
    // 影の帯は黒の半透明なので、霧の外では濃さを消す（まだ見ていない場所との境目で、背景より黒くならないように）
    this.wallShadows = new THREE.InstancedMesh(shadowGeo, applyFog(shadowMat, this.fog, 'fade-alpha'), DRAW_CAPACITY * SHADOW_SIDES.length);
    // 階段・宝箱・強敵の足元の輪も、床や壁と同じ霧をかける
    const { chestFront, chestSide, chestLidMat, chestInsideMat, chestLidInsideMat, eliteMat, bossMat } = this.shared;
    for (const mat of [chestFront, chestSide, chestLidMat, chestInsideMat, chestLidInsideMat, eliteMat, bossMat]) applyFog(mat, this.fog);
    this.stairs = new Stairs3D((mat) => applyFog(mat, this.fog));
    this.loadChestTextures();
    for (const mesh of [...this.floors, ...this.walls, this.wallShadows]) {
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
    // 呪文が敵に当たったら、その敵をのけぞらせる
    this.spellFx.onImpact = (at, strength) => this.knockEnemy(at, strength);
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
      this.hero.setWeapon(weaponOf(s.stats.weapon)); // 装備した武器を左手に持つ
      this.shownState = s;
    }

    // 動きの途中の位置
    const p = lerp(frame.from.player, s.player, frame.progress);
    const now = performance.now();
    const elapsed = now - this.lastFrameAt;
    const dt = Math.min(0.1, elapsed / 1000);
    this.lastFrameAt = now;
    this.adaptResolution(elapsed);
    const moved = frame.from.player.x !== s.player.x || frame.from.player.y !== s.player.y;
    // 1マスずつ動くので、前の位置から今の位置への向きが歩いた向き（階を移ったときは向きを変えない）
    if (moved && Math.abs(frame.from.player.x - s.player.x) + Math.abs(frame.from.player.y - s.player.y) === 1) {
      this.heroDir = dirBetween(frame.from.player, s.player);
    }
    this.hero.update(p.x, p.y, this.heroDir, moved ? frame.progress : 1, dt, this.reduceMotion);
    this.fog.update(p, dt, this.reduceMotion);
    this.updateDamagePops(now);
    this.spellFx.update(now);
    const zoom = this.updateCombatZoom(s, now, dt) * this.pulseZoom(now);
    if (Math.abs(zoom - this.camera.zoom) > 1e-4) {
      this.camera.zoom = zoom;
      this.camera.updateProjectionMatrix();
    }
    this.torch.position.set(p.x, TORCH.height, p.y + TORCH.forward);
    // たいまつが動いたときだけ影を描き直す（壁が入れ替わったときは updateFog で描き直しを頼む）
    if (this.shadows && !this.torch.position.equals(this.torchAt)) {
      this.torchAt.copy(this.torch.position);
      this.renderer.shadowMap.needsUpdate = true;
    }
    // 呪文の揺れ（spellFx.shake）は、カメラの位置と見る先の両方に足す
    const shake = this.spellFx.shake;
    this.camera.position.set(p.x + shake.x, CAMERA.height, p.y + CAMERA.back + shake.z);
    this.camera.lookAt(p.x + shake.x, 0, p.y + shake.z);
    for (const e of s.enemies) {
      const view = this.enemies.get(e.uid);
      if (!view || !view.body.visible) continue; // 見えていない敵は動かさない
      const from = frame.from.enemies.get(e.uid) ?? e.pos;
      const at = lerp(from, e.pos, frame.progress);
      if (view.model) {
        // 立体の模型は、歩いた向きへ体を回し、歩いているあいだは腕を振る
        const walking = (from.x !== e.pos.x || from.y !== e.pos.y) && frame.progress < 1 && !this.reduceMotion;
        view.model.update(at.x, at.y, view.facing, walking, dt);
      } else {
        view.body.position.set(at.x, 0.5, at.y);
        view.body.quaternion.copy(this.camera.quaternion); // カメラの方を向ける
      }
      view.mark.position.set(at.x, view.top + 0.15, at.y);
      view.hp.position.set(at.x, 0.06, at.y);
      view.ring?.position.set(at.x, 0.02, at.y);
    }
    this.updateKnock(now);
    this.updateDying(now);
    this.updateWalkTarget(frame.walkTarget);
    this.updateWalkPath(frame.walkPath);
    this.renderer.render(this.scene, this.camera);
  }

  /** 描くのが間に合わないコマが続いたら、描く解像度を下げる（RESOLUTION）。elapsed は前のコマからの時間（ms） */
  private adaptResolution(elapsed: number) {
    if (this.pixelRatio <= RESOLUTION.low || elapsed > 250) return; // 長く止まっていたとき（別の画面を見ていたなど）は数えない
    this.slowFrames = elapsed > RESOLUTION.slowMs ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 1);
    if (this.slowFrames < RESOLUTION.frames) return;
    this.pixelRatio = RESOLUTION.low;
    this.renderer.setPixelRatio(this.pixelRatio);
  }

  /** 主人公をその向きに向ける（壁にぶつかって歩けなかったときも向く。向きのある呪文は、この向きに唱える） */
  face(dir: Dir) {
    this.heroDir = dir;
  }

  /**
   * 呪文を唱えたとき：向きを選ぶ呪文ならその向きを向き、呪文の演出を出す。from は唱えたマス。
   * 返す値は、唱えてから矢が当たるまでのミリ秒（当たったときにダメージの数字を出すため）。
   * 矢で敵を倒しても、矢が当たるまでは敵を消さずに残す
   */
  castSpell(cast: CastEvent, from: Pos): number {
    if (cast.dir) this.heroDir = cast.dir;
    const impactMs = this.spellFx.start(cast, from);
    const last = cast.path.at(-1);
    if (last) {
      const len = Math.hypot(last.x - from.x, last.y - from.y) || 1;
      this.spellDir = { dx: (last.x - from.x) / len, dz: (last.y - from.y) / len };
    }
    const target = last && this.shownState?.enemies.find((e) => e.pos.x === last.x && e.pos.y === last.y);
    if (target && impactMs > 0) this.dying.set(target.uid, performance.now() + impactMs + DYING_EXTRA_MS);
    return impactMs;
  }

  /** 呪文が当たった敵（at のマス）を、当たった向きへのけぞらせる */
  private knockEnemy(at: Pos, strength: number) {
    if (this.reduceMotion) return;
    const uid =
      [...this.dying.keys()].find((id) => {
        const v = this.enemies.get(id);
        return v && Math.round(v.body.position.x) === at.x && Math.round(v.body.position.z) === at.y;
      }) ?? this.shownState?.enemies.find((e) => e.pos.x === at.x && e.pos.y === at.y)?.uid;
    if (uid === undefined) return;
    const view = this.enemies.get(uid);
    const alive = this.shownState?.enemies.some((e) => e.uid === uid) ?? false;
    this.knock = {
      uid,
      start: performance.now(),
      amount: SPELL_KNOCK.amount * strength,
      ...this.spellDir,
      base: !alive && view ? view.body.position.clone() : null,
    };
  }

  /** のけぞりの動き（押されて、なめらかに戻る） */
  private updateKnock(now: number) {
    const k = this.knock;
    if (!k) return;
    const t = (now - k.start) / SPELL_KNOCK.ms;
    const view = this.enemies.get(k.uid);
    if (t >= 1 || !view) {
      if (view && k.base) view.body.position.copy(k.base);
      this.knock = null;
      return;
    }
    const off = k.amount * (t < 0.2 ? t / 0.2 : (1 - (t - 0.2) / 0.8) ** 2);
    if (k.base) view.body.position.set(k.base.x + k.dx * off, k.base.y, k.base.z + k.dz * off);
    else view.body.position.set(view.body.position.x + k.dx * off, view.body.position.y, view.body.position.z + k.dz * off);
  }

  /** 矢が当たるまで残していた、倒れた敵を消す */
  private updateDying(now: number) {
    for (const [uid, until] of this.dying) {
      if (now < until) continue;
      this.dying.delete(uid);
      if (!this.shownState?.enemies.some((e) => e.uid === uid)) this.removeEnemyView(uid);
    }
  }

  /** 主人公が at のマスの敵を攻撃したとき：敵の方を向いて、武器を振る */
  heroAttack(at: Pos) {
    const me = this.shownState?.player;
    if (me && Math.abs(me.x - at.x) + Math.abs(me.y - at.y) === 1) this.heroDir = dirBetween(me, at);
    this.hero.swing();
  }

  /** 攻撃したとき・攻撃されたときに、画面を少し拡大縮小する。動きを減らす設定では何もしない */
  hitPulse(kind: HitPulse) {
    this.lastCombatAt = performance.now();
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

  /** 戦闘中に寄せる倍率を、目標へなめらかに近づける。動きを減らす設定では、すぐに切り替える */
  private updateCombatZoom(s: ExploreState, now: number, dt: number): number {
    if (s.enemies.some((e) => e.mode !== 'wander' && isAdjacent(e.pos, s.player))) this.lastCombatAt = now;
    const target = now - this.lastCombatAt < COMBAT_ZOOM.holdMs ? COMBAT_ZOOM.zoom : 1;
    if (this.reduceMotion) {
      this.combatZoom = target;
    } else {
      const tau = target > this.combatZoom ? COMBAT_ZOOM.inSec : COMBAT_ZOOM.outSec;
      this.combatZoom += (target - this.combatZoom) * (1 - Math.exp(-dt / tau));
      if (Math.abs(target - this.combatZoom) < 1e-3) this.combatZoom = target;
    }
    return this.combatZoom;
  }

  /** 攻撃したとき・攻撃されたときの効果の倍率。効果のあいだだけ 1 からずれる */
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
    this.spellFx.dispose();
    this.floors[0]!.geometry.dispose(); // 床の形はすべての入れ物で共通
    for (const mesh of this.walls) mesh.geometry.dispose();
    this.wallShadows.geometry.dispose();
    this.pathDots.geometry.dispose();
    (this.pathDots.material as THREE.Material).dispose();
    this.pathDots.dispose();
    this.hero.dispose();
    for (const view of this.enemies.values()) view.model?.dispose();
    this.stairs.dispose();
    for (const { sprite } of this.damagePops) {
      sprite.material.map?.dispose();
      sprite.material.dispose();
    }
    for (const mesh of [...this.floors, ...this.walls, this.wallShadows]) {
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) mat.dispose();
      mesh.dispose();
    }
    for (const atlas of this.atlases.values()) {
      for (const t of atlas ? [atlas.floor, atlas.top, atlas.side] : []) t.dispose();
    }
    for (const m of [this.shared.chestFront, this.shared.chestSide, this.shared.chestLidMat]) m.map?.dispose();
    for (const r of Object.values(this.shared)) for (const d of Array.isArray(r) ? r : [r]) d.dispose();
    for (const m of this.materials.values()) m.dispose();
    for (const m of this.litMaterials.values()) m.dispose();
    this.billboard.dispose();
    this.fog.dispose();
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
    this.torch.color.setHex(TORCH.colorByTrait[trait] ?? TORCH.color);
    if (trait !== this.glossTrait) this.applyGloss(trait);
    // テクスチャがあれば色はテクスチャに任せ、明るさだけを掛ける。なければ特性ごとの色で描く
    const colors = TRAIT_COLORS[trait];
    const floorBase = new THREE.Color(atlas ? 0xffffff : colors.floor);
    const wallBase = new THREE.Color(atlas ? 0xffffff : colors.wall);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const floorCounts = this.floors.map(() => 0);
    const wallCounts = this.walls.map(() => 0);
    let shadows = 0;
    this.fog.setTargets(frame.state, frame.visible);
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
        // 明るさは霧（applyFog）がピクセルごとに付けるので、ここでは元の色だけを入れる
        if (map.tiles[i] === 'wall') {
          // となりが一度見た壁なら、その面は描かずにつなげる。床・まだ見ていない壁・ダンジョンの外に面した側は丸める
          const k = (seenWall(x + 1, z) ? 0 : 1) | (seenWall(x - 1, z) ? 0 : 2) | (seenWall(x, z + 1) ? 0 : 4) | (seenWall(x, z - 1) ? 0 : 8);
          const mesh = this.walls[k]!;
          mesh.setMatrixAt(wallCounts[k]!, m.makeTranslation(x, 0, z));
          mesh.setColorAt(wallCounts[k]!++, wallBase);
        } else if (map.stairs && map.stairs.x === x && map.stairs.y === z) {
          // 下り階段のマスは床に穴が開いているので、床を敷かない（穴と段は updateProps で描く）
        } else {
          // テクスチャがないときは、マスの位置で明るさを少し変えて描き分ける
          const k = floorVariant(x, z) % FLOOR_KINDS;
          const variety = atlas ? 1 : 0.9 + k * 0.05;
          this.floors[k]!.setMatrixAt(floorCounts[k]!, m.makeTranslation(x, 0, z));
          this.floors[k]!.setColorAt(floorCounts[k]!++, c.copy(floorBase).multiplyScalar(variety));
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
      ...this.walls.map((mesh, k) => [mesh, wallCounts[k]!] as const),
      [this.wallShadows, shadows] as const,
    ];
    for (const [mesh, count] of counts) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    if (this.shadows) this.renderer.shadowMap.needsUpdate = true; // 壁の並びが変わったので影も描き直す
  }

  /** 宝箱のテクスチャ（どのダンジョンでも共通）。読み込めたら金色をやめてテクスチャで描く。読み込めなければ金色のまま */
  private loadChestTextures() {
    const loader = new THREE.TextureLoader();
    const dir = `${import.meta.env.BASE_URL}textures/chest/`;
    const { chestFront, chestSide, chestLidMat } = this.shared;
    const parts: [string, THREE.MeshLambertMaterial][] = [
      ['front.png', chestFront],
      ['side.png', chestSide],
      ['lid.png', chestLidMat],
    ];
    Promise.all(parts.map(([file]) => loader.loadAsync(dir + file)))
      .then((textures) => {
        textures.forEach((t, k) => {
          const mat = parts[k]![1];
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = Math.min(MAX_ANISOTROPY, this.renderer.capabilities.getMaxAnisotropy());
          mat.map = t;
          mat.color.set(0xffffff);
          mat.needsUpdate = true;
        });
        this.shownState = null; // 次のフレームで描き直す
      })
      .catch(() => undefined);
  }

  /** ダンジョン特性のテクスチャ。まだ読み込んでいなければ読み込みを始めて null を返す */
  /** 床と壁のツヤを、ダンジョンの特性に合わせる */
  private applyGloss(trait: TraitId) {
    this.glossTrait = trait;
    const { shininess, specular } = TRAIT_GLOSS[trait] ?? NO_GLOSS;
    const mats = [...this.floors.map((f) => f.material as THREE.MeshPhongMaterial), ...this.wallMaterials.flatMap(({ top, side }) => [top, side])];
    for (const m of mats) {
      m.shininess = shininess;
      m.specular.setHex(specular);
    }
  }

  private atlasFor(trait: TraitId): Atlas | null {
    if (!this.atlases.has(trait)) {
      this.atlases.set(trait, null);
      const loader = new THREE.TextureLoader();
      const dir = `${import.meta.env.BASE_URL}textures/${trait}/`;
      const load = (file: string) => loader.loadAsync(dir + file).then((t) => this.smoothTexture(t));
      Promise.all([load(TEXTURE_FILES.floor), load(TEXTURE_FILES.wallTop), load(TEXTURE_FILES.wallSide)])
        .then(([floor, top, side]) => {
          this.atlases.set(trait, { floor, top, side });
          this.shownState = null; // 次のフレームで描き直す
        })
        // 1枚でも読み込めなかったときは null のままにして、色で描き続ける
        .catch(() => undefined);
    }
    return this.atlases.get(trait) ?? null;
  }

  /**
   * なめらかな質感のテクスチャとして使う設定。拡大・縮小ともになめらかに補間し、縮小用の画像（ミップマップ）を作って、
   * 歩いて画面が動いたときに模様がちらつかないようにする。斜めから見る床がぼけないよう、異方性フィルタリングもかける
   */
  private smoothTexture(t: THREE.Texture): THREE.Texture {
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = Math.min(MAX_ANISOTROPY, this.renderer.capabilities.getMaxAnisotropy());
    t.needsUpdate = true;
    return t;
  }

  private applyAtlas(atlas: Atlas | null) {
    this.floors.forEach((mesh) => {
      const mat = mesh.material as THREE.MeshPhongMaterial;
      mat.map = atlas?.floor ?? null;
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
    // 一度見ただけの場所にあるときの暗さは、霧（applyFog）が床や壁と同じようにピクセルごとに付ける

    if (map.stairs && seen[map.stairs.y * map.width + map.stairs.x]) {
      // 下り階段：床に開いた穴の中へ、奥へ下りていく石段（特性ごとの石と飾り）
      const down = this.stairs.get('down', frame.state.trait);
      down.position.set(map.stairs.x, 0, map.stairs.y);
      this.props.add(down);
    }
    const up = upStairs(frame.state);
    if (up && seen[up.y * map.width + up.x]) {
      // 上り階段：両脇に壁のある、奥へ上っていく石段
      const steps = this.stairs.get('up', frame.state.trait);
      steps.position.set(up.x, 0, up.y);
      this.props.add(steps);
    }
    for (const chest of chests) {
      if (!seen[chest.pos.y * map.width + chest.pos.x]) continue;
      const { chestBody, chestLid, chestFront, chestSide } = this.shared;
      // 本体の面の順番は +x, -x, +y（上）, -y（下）, +z（正面）, -z（背面）。ふたは曲面・両端の順
      const body = new THREE.Mesh(chestBody, [chestSide, chestSide, chestSide, chestSide, chestFront, chestFront]);
      const lid = new THREE.Mesh(chestLid, [this.shared.chestLidMat, chestSide, chestSide]);
      body.position.set(chest.pos.x, 0, chest.pos.y);
      const parts: THREE.Object3D[] = [body];
      if (chest.opened) {
        // 開けた宝箱：ふたを奥の縁（蝶番）を軸に後ろへ倒し、箱の口に中の暗がりを見せる。空になっても、その場に残す
        const hinge = new THREE.Group();
        hinge.position.set(chest.pos.x, CHEST.height, chest.pos.y - CHEST.depth / 2);
        hinge.rotation.x = -OPENED_CHEST.lidAngle;
        lid.position.set(0, -CHEST.height, CHEST.depth / 2);
        const lidInside = new THREE.Mesh(this.shared.chestLidInside, this.shared.chestLidInsideMat);
        lidInside.position.copy(lid.position);
        lidInside.receiveShadow = true;
        hinge.add(lid, lidInside);
        const inside = new THREE.Mesh(this.shared.chestInside, this.shared.chestInsideMat);
        inside.position.set(chest.pos.x, CHEST.height + 0.003, chest.pos.y);
        inside.receiveShadow = true;
        parts.push(hinge, inside);
      } else {
        lid.position.set(chest.pos.x, 0, chest.pos.y);
        parts.push(lid);
      }
      for (const part of [body, lid]) {
        part.castShadow = true;
        part.receiveShadow = true;
      }
      for (const part of parts) this.props.add(part);
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

  /**
   * 今見えているマスにいる敵だけを表示する。
   * 見えなくなった敵の模型は、隠すだけで片付けない（また見えたときに組み立て直すと、その瞬間に動きが引っかかるため）。
   * 倒されたり、階を移ったりして、いなくなった敵の模型だけを片付ける
   */
  private updateEnemies(frame: Frame) {
    const { state, visible } = frame;
    const shown = new Set<number>();
    for (const e of state.enemies) {
      if (!visible.has(e.pos.y * state.map.width + e.pos.x)) continue;
      shown.add(e.uid);
      let view = this.enemies.get(e.uid);
      if (!view) {
        const look = lookOf(e.id);
        const def = enemyDef(e);
        // 強敵は赤い輪、ボスは金の輪を足元に置く
        const ring = e.elite ? new THREE.Mesh(this.shared.ring, def.boss ? this.shared.bossMat : this.shared.eliteMat) : null;
        const model = this.makeEnemyModel(e.id);
        let body: THREE.Object3D;
        if (model) body = model.root;
        else {
          const mesh = new THREE.Mesh(this.billboard, this.litSpriteMaterial(look.sprite, look.recolor ?? {}));
          mesh.receiveShadow = true; // 壁の影に入れば暗くなる
          body = mesh;
        }
        if (ring) ring.receiveShadow = true;
        const top = model?.height ?? 1;
        view = { id: e.id, body, model, mark: new THREE.Sprite(), hp: new THREE.Sprite(), ring, top, facing: 'down' };
        this.scene.add(view.body, view.mark, view.hp);
        if (ring) this.scene.add(ring);
        this.enemies.set(e.uid, view);
      }
      view.body.visible = view.mark.visible = true;
      if (view.ring) view.ring.visible = true;
      // 向き：歩いたらその向き、止まっていても主人公を追っていれば主人公の方を向く
      const from = frame.from.enemies.get(e.uid);
      if (from && (from.x !== e.pos.x || from.y !== e.pos.y)) view.facing = facingToward(from, e.pos);
      else if (e.mode !== 'wander') view.facing = facingToward(e.pos, state.player);
      // 頭上のマーク。気付いた瞬間の「！」だけ大きく強調する
      view.mark.material = this.textMaterial(ENEMY_MARK[e.mode].mark, e.mode === 'wander' ? '#b9b29f' : '#e2c178');
      view.mark.scale.setScalar(e.justNoticed ? 0.7 : 0.45);
      const def = enemyDef(e);
      view.hp.visible = e.hp < def.hp;
      view.hp.material = this.hpMaterial(Math.ceil((e.hp / def.hp) * 10));
      view.hp.scale.set(0.8, 0.1, 1);
    }
    const alive = new Set(state.enemies.map((e) => e.uid));
    for (const [uid, view] of [...this.enemies]) {
      if (shown.has(uid)) continue;
      if (!alive.has(uid)) {
        // 呪文の矢で倒した敵は、矢が当たるまで残す（頭上のマークと体力の棒は消す）
        if ((this.dying.get(uid) ?? 0) > performance.now()) view.mark.visible = view.hp.visible = false;
        else this.removeEnemyView(uid);
      }
      else {
        view.body.visible = view.mark.visible = view.hp.visible = false;
        if (view.ring) view.ring.visible = false;
      }
    }
  }

  private removeEnemyView(uid: number) {
    const view = this.enemies.get(uid);
    if (!view) return;
    this.scene.remove(view.body, view.mark, view.hp);
    if (view.ring) this.scene.remove(view.ring);
    view.model?.dispose();
    this.enemies.delete(uid);
  }

  /** 立体の模型で描く敵なら、模型を作る（模型のない敵は null で、ドット絵の板で描く） */
  private makeEnemyModel(id: EnemyId): EnemyModel | null {
    if (!isCreature(id)) return null;
    return new Creature(id, (m, name) => applyFog(m, this.fog, 'darken', name));
  }

  // ===== 素材 =====

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

  /** たいまつで照らされる敵のドット絵の素材。種類ごとに1回だけ作って使い回す */
  private litSpriteMaterial(id: SpriteId, colors: Record<string, string>): THREE.MeshLambertMaterial {
    const key = `sprite:${id}:${JSON.stringify(colors)}`;
    let mat = this.litMaterials.get(key);
    if (!mat) {
      const map = this.texture(key, 32, 32, (ctx) => drawSprite(ctx, id, 0, 0, 32, colors));
      mat = applyFog(new THREE.MeshLambertMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide }), this.fog);
      this.litMaterials.set(key, mat);
    }
    return mat;
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

/** 装備している武器の種類（武器でなければ null） */
export function weaponOf(item: ItemId | null): WeaponType | null {
  if (!item) return null;
  const effect = ITEMS[item].effect;
  return effect.kind === 'weapon' ? effect.weapon : null;
}

/** WebGL2 が使えるか。Three.js の3D表示に必要 */
export function webglAvailable(): boolean {
  try {
    return document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    return false;
  }
}
