// 探索画面の3D表示（Three.js）。斜め上から見下ろすカメラで、主人公を滑らかに追う。
// 探索画面（ExploreScreen.tsx）から、1コマの情報（exploreRender.ts の Frame）を受け取って描く。
//
// - 床と壁は、同じ形をまとめて描く InstancedMesh で描く。主人公の周りの画面に映る範囲だけを描くので、
//   マップがどれだけ広くても描く量は変わらない
// - 床と壁には、ダンジョン特性ごとのテクスチャ（public/textures/{特性}/*.jpg）を貼る。読み込むまでは色で描く
// - 霧：まだ見ていないマスは描かない。一度見たマスは暗く、今見えているマスは明るく描く
// - 主人公は立体の模型（hero3d.ts）。敵も、形も色もプログラムで組んだ立体の模型（creatures.ts）。
//   模型のない敵（新しく足した敵など）と宝箱は、絵を常にカメラを向く板（スプライト）として立てる

import * as THREE from 'three';
import { enemyBase, ITEMS } from '../game/data';
import { gearOf } from '../game/itemMaster';
import { behaviorsOf, ENEMY_CONFIG, enemyDef, isAdjacent, type MapEnemy } from '../game/enemies';
import { deathKindOf, type DeathKind } from '../game/deathKind';
import { upStairs } from '../game/explore';
import { DIR_DELTA, type CastEvent, type Dir, type ExploreState, type FoeEvent } from '../game/exploreTypes';
import { dirBetween } from '../game/exploreSight';
import type { FloorMap, Pos } from '../game/map';
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
import { AFTERGLOW_FX, AMBIENT, BACKGROUND, CAMERA, CHEST, COMBAT_ZOOM, DAMAGE_POP, DEATH_FX, DEBRIS, GLOW_FX, INTRO_FX, DRAW_CAPACITY, DRAW_RANGE, DYING_EXTRA_MS, DAMAGE_STYLE, FOE_FX, FOE_STATUS_FX, HIT_STOP, SPLASH_EXTRA_MS, ENEMY_MOTION, FLOOR_LOOK, FLOOR_KINDS, FOV_LIMIT, HIT_PULSE, MAX_ANISOTROPY, NO_GLOSS, OPENED_CHEST, PATH_CAPACITY, QUALITY, SHADOW_SIDES, SPELL_KNOCK, SUN, SURFACE_BUMP, TEXTURE_FILES, TEXTURE_SPAN, TILE_PX, GROUND_MIST, TORCH, TORCH_FLICKER, TRAIT_COLORS, TRAIT_GLOSS, WALL_HEIGHT, WALL_ROUND, WALL_SHADOW, WALL_SHAPES, WET_STONE, type HitPulse } from './explore3dConfig';
import { applyFog, createFog, createGroundMist, litBillboard, worldMapped } from './explore3dKit';
import { asMetal } from './materialLook';
import { PostFx } from './postFx';
import { feelSettings } from './feelSettings';
import { normalMapFrom } from './surfaceNormals';
import { Particles } from './particles';
import { Sconces } from './sconces';


interface Atlas {
  floor: THREE.Texture;
  top: THREE.Texture;
  side: THREE.Texture;
  // 凹凸の絵（法線マップ。surfaceNormals.ts）。作れなかったときは null で、凹凸は付けない
  floorBump: THREE.Texture | null;
  topBump: THREE.Texture | null;
  sideBump: THREE.Texture | null;
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
  private enemyShadowKey = ''; // 影を最後に描いたときの、たいまつの近くの敵の位置と形（変わったら描き直す）
  private shadowDrawnAt = 0; // 影を最後に描き直した時刻
  private readonly shadows = new URLSearchParams(location.search).get('shadow') !== 'off'; // ?shadow=off で影を切って比べられる
  private readonly raycaster = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private shownState: ExploreState | null = null;
  private stopUntil = 0; // ヒットストップで画面を止めておく時刻（performance.now）
  private readonly floors: THREE.InstancedMesh[]; // 床の模様ごとに1つ
  // 壁は、床に面している側面の組み合わせごとに形が違う（面した縁だけ丸める）ので、組み合わせごとに入れ物を分ける
  private readonly walls: THREE.InstancedMesh[];
  private readonly wallShadows: THREE.InstancedMesh; // 壁の根元の影
  private readonly wallMaterials: { top: THREE.MeshPhongMaterial; side: THREE.MeshPhongMaterial }[];
  private glossTrait: TraitId | null = null; // 床と壁のツヤを合わせた特性
  private readonly atlases = new Map<TraitId, Atlas | null>(); // null は読み込み中か、読み込めなかった
  private appliedAtlas: Atlas | null = null;
  private readonly props = new THREE.Group(); // 階段・宝箱・目印
  private readonly fieldGroup = new THREE.Group(); // 床に残る魔法の跡（燃える床・霜の床）
  private fieldMats: Record<'fire' | 'fireLast' | 'frost' | 'frostLast', THREE.MeshBasicMaterial> | null = null;
  private readonly slashes: { sprite: THREE.Sprite; start: number; ms?: number; size?: number; aspect?: number }[] = []; // 剣の斬撃の残光（通常攻撃の残光も）
  private readonly rings: { mesh: THREE.Mesh; start: number }[] = []; // 槌の地響きの輪
  private readonly puffs: { sprite: THREE.Sprite; at: Pos; start: number; drift: number }[] = []; // 立ち上る水蒸気
  private readonly iceShells = new Map<number, THREE.Mesh>(); // 凍った敵を包む氷の殻（敵の uid ごと）
  private readonly stairs: Stairs3D; // 特性ごとの階段の模型
  private readonly sconces: Sconces; // 部屋の壁掛けたいまつ
  private readonly particles: Particles; // 空気の粒と火の粉
  private readonly hero = new Hero3D(); // 主人公は立体の模型（敵や宝箱はドット絵の板のまま）
  private heroDir: Dir = 'down'; // 最後に歩いた向き。模型をこの向きへ回す
  private lastFrameAt = performance.now();
  // 画質の段（QUALITY）。描くのが間に合わなければ下げ、余裕が戻れば上げる。?quality=番号 を付けると、その段に固定する
  private readonly fixedQuality = new URLSearchParams(location.search).get('quality') !== null;
  private level = startLevel();
  private ceiling = 0; // これより上の段へは上げない（上げてすぐ下がった段は、二度と上げない）
  private pixelRatio = levelOf(this.level).ratio;
  private slowFrames = 0; // 描くのが間に合わなかったコマの数（段を下げるかを決める）
  private fastFrames = 0; // 余裕のあるコマが続いた数（段を上げるかを決める）
  private raisedAt = -Infinity; // 段を上げた時刻
  private cssWidth = 0;
  private cssHeight = 0;
  private readonly reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly spellFx = new SpellEffects(this.scene, this.reduceMotion); // 呪文の演出
  private pulse: { kind: HitPulse; start: number } | null = null;
  // 呪文が当たった敵ののけぞり（base は、もう倒れている敵の、その場の位置）
  private knock: { uid: number; start: number; amount: number; dx: number; dz: number; base: THREE.Vector3 | null } | null = null;
  private spellDir: { dx: number; dz: number } = { dx: 0, dz: 1 }; // 最後に唱えた呪文の向き
  private readonly dying = new Map<number, number>(); // 呪文の矢が当たるまで残す、倒れた敵（uid → 消す時刻）
  private readonly lunges = new Map<number, number>(); // 飛びかかっている敵（uid → 飛びかかり始めた時刻）
  private readonly collapses = new Map<number, { start: number; kind: DeathKind; fired: boolean }>(); // 倒れていく敵（uid → 倒れ始めた時刻・倒れ方・破片を出したか）
  // 倒れた敵の破片・霧、攻撃の火花（from：出た場所、vel：速さ、gravity：落ちる強さ（マイナスなら昇る）、spin：回る速さ、base：霧の大きさ（破片は0））
  private readonly bits: { obj: THREE.Mesh | THREE.Sprite; from: THREE.Vector3; vel: THREE.Vector3; gravity: number; spin: number; start: number; ms: number; base: number }[] = [];
  private readonly introduced = new Set<number>(); // 登場演出をした強敵・ボス（uid）
  private intro: { start: number; holdMs: number } | null = null; // 登場演出の最中（カメラが寄っている）
  /** 強敵・ボスが初めて視界に入ったとき、名前を出すために呼ぶ（画面側が受け取る） */
  onIntro: ((info: { name: string; boss: boolean }) => void) | null = null;
  private combatZoom = 1; // 戦闘中に寄せている倍率（なめらかに変わる）
  private lastCombatAt = -Infinity; // 最後に戦闘中だった時刻
  private readonly damagePops: { sprite: THREE.Sprite; start: number }[] = [];
  private readonly roars: { mesh: THREE.Mesh; at: Pos; start: number; reach: number; ms: number }[] = []; // ボスの咆哮の輪・見張りの叫びの輪（reach：広がりきったときの倍率）
  private readonly shots: { mesh: THREE.Mesh; from: Pos; to: Pos; start: number; ms: number }[] = []; // 飛んでいる、遠距離の敵の矢
  // 霧：描いている床と壁の1つ1つ（どの入れ物の何番目か・どのマスか・元の色）と、マスごとの今の明るさ
  // 霧：マスごとの「見えている」「一度見た」を1マス1ドットの小さな画像にして、描くときにピクセルごとになめらかに読む
  private readonly fog = createFog();
  // 地面をはう霧（?mist=off、または処理の弱い端末では出さない）
  private readonly mist: THREE.Mesh | null = rich('mist') ? createGroundMist(this.fog, DRAW_RANGE.x * 2 + 2, DRAW_RANGE.z * 2 + 2) : null;
  private flickerTime = 0; // たいまつのゆらぎの時間（秒）
  // 画面全体の仕上げ（光のにじみ・周辺減光・粒子感・輪郭の強調）。?post=off、処理の弱い端末では使わず、描くのが間に合わなくなったらやめる
  private post: PostFx | null = null; // 段が決める（applyLevel）
  private readonly enemies = new Map<
    number,
    {
      id: EnemyId;
      body: THREE.Object3D; // 絵の板（Mesh）か、立体の模型の入れ物
      model: EnemyModel | null; // 立体の模型で描く敵
      mark: THREE.Sprite;
      hp: THREE.Sprite;
      ring: THREE.Mesh | null;
      shield: THREE.Mesh | null; // 盾持ちの敵の盾（向いている正面に置く）
      glow: THREE.Mesh | null; // 自分で光る敵の、足元に広がる光
      glowSize: number; // 光の直径（マス）
      glowFlicker: number; // 光のちらつきの大きさ（割合）
      top: number;
      facing: Dir;
    }
  >();
  private prebuild: MapEnemy[] = []; // 階に入ったとき、組み立て待ちの敵（近い順）
  private readonly textures = new Map<string, THREE.Texture>();
  private readonly glowMats = new Map<string, THREE.MeshBasicMaterial>(); // 敵の光の材料（体質ごと）
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
    // 宝箱の鉄の帯（本体の前・上・後ろを巻く、少し大きい薄い箱の側面）と、ふたの丸みに沿った帯、錠前、鍵穴
    chestBand: new THREE.BoxGeometry(0.035, CHEST.height + 0.006, CHEST.depth + 0.012).translate(0, CHEST.height / 2, 0),
    chestLidBand: new THREE.CylinderGeometry(CHEST.depth / 2 + 0.006, CHEST.depth / 2 + 0.006, 0.035, 16, 1, false, 0, Math.PI)
      .rotateZ(Math.PI / 2)
      .translate(0, CHEST.height, 0),
    chestLock: new THREE.BoxGeometry(0.075, 0.085, 0.014),
    chestKeyhole: new THREE.BoxGeometry(0.016, 0.034, 0.004),
    chestGrooveFront: new THREE.BoxGeometry(CHEST.width - 0.01, 0.007, 0.004),
    chestGrooveSide: new THREE.BoxGeometry(0.004, 0.007, CHEST.depth - 0.01),
    chestHinge: new THREE.CylinderGeometry(0.014, 0.014, 0.07, 10).rotateZ(Math.PI / 2), // 蝶番の筒（ふたの軸に沿う）
    ring: new THREE.RingGeometry(0.4, 0.48, 24).rotateX(-Math.PI / 2),
    shieldPlate: new THREE.BoxGeometry(FOE_FX.shield.size, FOE_FX.shield.size, FOE_FX.shield.thick),
    shieldMat: new THREE.MeshLambertMaterial({ color: FOE_FX.shield.color }),
    shotBall: new THREE.SphereGeometry(FOE_FX.shot.size, 12, 8),
    slamRing: new THREE.RingGeometry(0.92, 1, 36).rotateX(-Math.PI / 2),
    chip: new THREE.TetrahedronGeometry(0.07), // 破片・火花
    iceShell: new THREE.BoxGeometry(FOE_STATUS_FX.shell.width, FOE_STATUS_FX.shell.height, FOE_STATUS_FX.shell.width), // 凍った敵の氷の殻
    iceShellMat: new THREE.MeshBasicMaterial({ color: FOE_STATUS_FX.shell.color, transparent: true, opacity: FOE_STATUS_FX.shell.opacity, depthWrite: false }),
    glowPlane: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), // 敵の足元の光
    fieldPlate: new THREE.PlaneGeometry(FOE_FX.field.size, FOE_FX.field.size).rotateX(-Math.PI / 2),
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
    // 宝箱の鉄の金具：鋭く光る黒い鉄。鍵穴は真っ暗
    ironMat: asMetal(new THREE.MeshPhongMaterial({ color: 0x2a2826, shininess: 90, specular: 0x8a8578 })),
    keyholeMat: new THREE.MeshBasicMaterial({ color: 0x050403 }),
    grooveMat: new THREE.MeshLambertMaterial({ color: 0x1e130b }), // 板の継ぎ目の暗い溝
    eliteMat: new THREE.MeshLambertMaterial({ color: 0xd9653b }),
    bossMat: new THREE.MeshLambertMaterial({ color: 0xb48d35 }),
    bossMat2: new THREE.MeshLambertMaterial({ color: FOE_FX.phase.colors[1] }), // ボスの輪：第2段階
    bossMat3: new THREE.MeshLambertMaterial({ color: FOE_FX.phase.colors[2] }), // 第3段階
    targetMat: new THREE.MeshBasicMaterial({ color: 0x9cc46a }),
  };
  private readonly target: THREE.Mesh;
  private readonly pathDots: THREE.InstancedMesh; // 歩く道筋の点
  private readonly debris: THREE.InstancedMesh; // 床の小石と、壁の根元の崩れた石
  private readonly puddles: THREE.InstancedMesh; // 水たまり
  private readonly bones: THREE.InstancedMesh; // 床に散らばった骨
  private roomTiles: { map: unknown; tiles: Set<number> } = { map: null, tiles: new Set() }; // 部屋の床のマス（通路と描き分ける）
  private shownPath: Pos[] | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(canvas.width, canvas.height, false);
    this.cssWidth = canvas.width;
    this.cssHeight = canvas.height;
    if (this.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // 影の縁を少しぼかす
      this.renderer.shadowMap.autoUpdate = false; // 描き直すときを自分で決める（render の中）
      this.torch.castShadow = true;
      this.torch.shadow.mapSize.set(levelOf(this.level).shadow, levelOf(this.level).shadow);
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
    this.scene.add(sun, this.torch, this.props, this.fieldGroup);
    if (this.mist) this.scene.add(this.mist);

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
    const { chestFront, chestSide, chestLidMat, chestInsideMat, chestLidInsideMat, eliteMat, bossMat, bossMat2, bossMat3, ironMat, keyholeMat, grooveMat } = this.shared;
    for (const mat of [chestFront, chestSide, chestLidMat, chestInsideMat, chestLidInsideMat, eliteMat, bossMat, bossMat2, bossMat3, ironMat, keyholeMat, grooveMat]) applyFog(mat, this.fog);
    this.stairs = new Stairs3D((mat) => applyFog(mat, this.fog));
    this.sconces = new Sconces((mat) => applyFog(mat, this.fog));
    this.scene.add(this.sconces.root);
    this.particles = new Particles(this.fog);
    this.scene.add(this.particles.root);
    this.loadChestTextures();
    // 床の小石と、壁の根元の崩れた石（角ばった形。霧も床と同じくかける）
    const stoneGeo = new THREE.IcosahedronGeometry(1, 1).scale(1, 0.6, 1);
    // 頂点を少しずつずらして、角の欠けたごつごつした石にする（決まった乱数なので、いつも同じ形）
    const stonePos = stoneGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < stonePos.count; i++) {
      // 同じ位置の頂点（となりの面と共有する角）は同じだけずらし、すき間が開かないようにする
      const k = 0.78 + tileRandom(Math.round(stonePos.getX(i) * 100), Math.round(stonePos.getY(i) * 100), Math.round(stonePos.getZ(i) * 100)) * 0.4;
      stonePos.setXYZ(i, stonePos.getX(i) * k, stonePos.getY(i) * k, stonePos.getZ(i) * k);
    }
    this.debris = new THREE.InstancedMesh(stoneGeo, applyFog(new THREE.MeshPhongMaterial({ flatShading: true, ...NO_GLOSS }), this.fog), DRAW_CAPACITY * DEBRIS.perTile);
    // 水たまり：ふちのぼけた平らなしみ（ふちの濃さは、しみの絵の明るさで決める）
    const blot = this.blotTexture();
    const patchGeo = new THREE.CircleGeometry(0.5, 20).rotateX(-Math.PI / 2);
    const { puddle } = FLOOR_LOOK;
    this.puddles = new THREE.InstancedMesh(
      patchGeo,
      applyFog(new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: puddle.shininess, specular: puddle.specular, alphaMap: blot, transparent: true, opacity: puddle.opacity, depthWrite: false }), this.fog),
      DRAW_CAPACITY,
    );
    // 骨：両端がふくらんだ細い骨を、床に寝かせる
    const boneGeo = new THREE.LatheGeometry(
      [[0, -0.07], [0.017, -0.069], [0.022, -0.06], [0.013, -0.046], [0.009, 0], [0.013, 0.046], [0.022, 0.06], [0.017, 0.069], [0, 0.07]].map(([r, y]) => new THREE.Vector2(r, y)),
      8,
    ).rotateZ(Math.PI / 2);
    this.bones = new THREE.InstancedMesh(boneGeo, applyFog(new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 12, specular: 0x222222 }), this.fog), DRAW_CAPACITY);
    this.puddles.renderOrder = 0.5; // 床のすぐあと（影の帯より前）
    for (const mesh of [...this.floors, ...this.walls, this.wallShadows, this.debris, this.puddles, this.bones]) {
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
    this.applyLevel(); // 今の段の効果（仕上げ・霧・粒・影の細かさ）にする。仕上げの描き方もここで先に作る
    this.compile(this.scene); // 床・壁・主人公など、最初から場面にあるものの描き方を先に作る
  }

  /**
   * 画面上の大きさ（CSSピクセル）に合わせて、描く解像度とカメラの縦横比を変える。
   * 視野の広さは、画面の大きさによらず1マスが画面上で TILE_PX に映るように決める
   */
  resize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height, false);
    this.cssWidth = width;
    this.cssHeight = height;
    this.post?.setSize(width * this.pixelRatio, height * this.pixelRatio);
    // 主人公までの距離で1マスが TILE_PX に映る視野：画面の高さの半分 ÷（距離 × TILE_PX）= tan(視野の半分)
    const distance = Math.hypot(CAMERA.height, CAMERA.back);
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(height / 2 / (distance * TILE_PX)));
    this.camera.aspect = width / height;
    // 縦に長い画面で、描く範囲（DRAW_RANGE.z）の奥より先が映らないように、視野の広さに上限を付ける（上限を超える画面では、1マスが TILE_PX より少し大きく映る）
    const pitch = Math.atan(CAMERA.height / CAMERA.back); // 主人公を見下ろす角度
    const farthest = Math.atan(CAMERA.height / (DRAW_RANGE.z - 1 + CAMERA.back)); // 描く範囲のいちばん奥を見下ろす角度
    const maxFov = Math.min(FOV_LIMIT.max, THREE.MathUtils.radToDeg(2 * (pitch - farthest)));
    this.camera.fov = THREE.MathUtils.clamp(fov, FOV_LIMIT.min, maxFov);
    this.camera.updateProjectionMatrix();
  }

  /** 1フレーム描く。状態が変わったときだけ、霧や敵の作り直しをする */
  render(frame: Frame) {
    const s = frame.state;
    if (s !== this.shownState) {
      if (this.shownState?.map !== s.map) this.queueEnemyModels(s); // 階に入ったとき：その階の敵の模型を先に組み立てる
      this.updateFog(frame);
      this.updateProps(frame);
      this.updateFields(frame);
      this.sconces.update(s, frame.visible);
      this.particles.setTrait(s.trait);
      this.updateEnemies(frame);
      this.hero.setCloak(cloakOf(s.stats.armor), gearTierOf(s.stats.armor)); // マントは装備した防具の色。段階が上がるほど、縁取り・肩当て・留め具が付く
      this.hero.setWeapon(weaponOf(s.stats.weapon), gearTierOf(s.stats.weapon)); // 装備した武器を左手に持つ。段階が上がるほど立派な見た目
      this.shownState = s;
    }

    // 動きの途中の位置
    const p = lerp(frame.from.player, s.player, frame.progress);
    const now = performance.now();
    const elapsed = now - this.lastFrameAt;
    const dt = Math.min(0.1, elapsed / 1000);
    this.lastFrameAt = now;
    this.adaptQuality(elapsed, now);
    this.prebuildEnemy();
    const moved = frame.from.player.x !== s.player.x || frame.from.player.y !== s.player.y;
    // 1マスずつ動くので、前の位置から今の位置への向きが歩いた向き（階を移ったときは向きを変えない）
    if (moved && Math.abs(frame.from.player.x - s.player.x) + Math.abs(frame.from.player.y - s.player.y) === 1) {
      this.heroDir = dirBetween(frame.from.player, s.player);
    }
    this.hero.update(p.x, p.y, this.heroDir, moved ? frame.progress : 1, dt, this.reduceMotion);
    // たいまつのゆらぎ：いくつかの波を重ねて、炎のように不規則にちらつかせる（-1〜1。「動きを減らす」設定では止める）
    if (!this.reduceMotion) this.flickerTime += dt * TORCH_FLICKER.speed;
    const t = this.flickerTime;
    const flicker = this.reduceMotion ? 0 : 0.5 * Math.sin(t * 7.3) + 0.3 * Math.sin(t * 13.1 + 1.7) + 0.2 * Math.sin(t * 23.7 + 4.1);
    this.torch.intensity = TORCH.intensity * (1 + TORCH_FLICKER.light * flicker);
    this.fog.update(p, dt, this.reduceMotion, TORCH_FLICKER.sight * flicker);
    this.mist?.position.set(p.x, GROUND_MIST.height, p.y);
    this.sconces.tick(p, dt, this.reduceMotion);
    if (this.particles.root.visible) this.particles.tick(this.sconces.flames, this.pixelRatio);
    this.updateDamagePops(now);
    this.updateShots(now);
    this.updateFieldLook(now);
    this.updatePuffs(now);
    this.updateRoars(now);
    this.updateSkillFx(now);
    this.spellFx.update(now);
    const zoom = this.updateCombatZoom(s, now, dt) * this.pulseZoom(now) * this.introZoom(now);
    if (Math.abs(zoom - this.camera.zoom) > 1e-4) {
      this.camera.zoom = zoom;
      this.camera.updateProjectionMatrix();
    }
    this.torch.position.set(p.x, TORCH.height, p.y + TORCH.forward);
    // 影は、たいまつが動いたとき（壁が入れ替わったときは updateFog で描き直しを頼む）と、たいまつの近くの敵が
    // 動いた・倒れた・消えたときに描き直す（敵も影を落とすので）。敵のための描き直しは、間隔を空けて重さを抑える
    if (this.shadows) {
      if (!this.torch.position.equals(this.torchAt)) {
        this.torchAt.copy(this.torch.position);
        this.renderer.shadowMap.needsUpdate = true;
        this.shadowDrawnAt = now;
      } else if (now - this.shadowDrawnAt >= TORCH.shadowRefreshMs) {
        const key = this.enemyShadowState();
        if (key !== this.enemyShadowKey) {
          this.enemyShadowKey = key;
          this.renderer.shadowMap.needsUpdate = true;
          this.shadowDrawnAt = now;
        }
      }
    }
    // 呪文の揺れ（spellFx.shake）は、カメラの位置と見る先の両方に足す
    const shake = feelSettings().shake ? this.spellFx.shake : { x: 0, z: 0 }; // 「画面の揺れ」を切っているときは揺らさない
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
      // 飛びかかり：主人公の方へ、少し身を引いてから飛び出して戻る
      const lunge = this.lungeOffset(e.uid, now);
      if (lunge !== 0) {
        const dx = s.player.x - e.pos.x;
        const dz = s.player.y - e.pos.y;
        const len = Math.hypot(dx, dz) || 1;
        view.body.position.x += (dx / len) * lunge;
        view.body.position.z += (dz / len) * lunge;
      }
      view.mark.position.set(at.x, view.top + 0.15, at.y);
      view.hp.position.set(at.x, 0.06, at.y);
      view.ring?.position.set(at.x, 0.02, at.y);
      if (view.glow) {
        const wobble = this.reduceMotion ? 0 : view.glowFlicker * Math.sin(now * 0.007 + e.uid * 1.7) * Math.sin(now * 0.0031 + e.uid);
        view.glow.position.set(at.x, GLOW_FX.y, at.y);
        view.glow.scale.setScalar(view.glowSize * (1 + wobble));
      }
      if (view.shield) {
        const d = DIR_DELTA[view.facing];
        view.shield.position.set(at.x + d.x * FOE_FX.shield.reach, FOE_FX.shield.y, at.y + d.y * FOE_FX.shield.reach);
        view.shield.rotation.y = d.x !== 0 ? Math.PI / 2 : 0;
      }
      this.updateFoeStatus(e, at, dt);
    }
    this.pruneIceShells(s.enemies);
    this.updateKnock(now);
    this.updateDying(now);
    this.updateCollapses(now);
    this.updateBits(now);
    this.updateWalkTarget(frame.walkTarget);
    this.updateWalkPath(frame.walkPath);
    if (this.post) this.post.render(this.renderer, this.scene, this.camera, this.reduceMotion ? 0 : dt);
    else this.renderer.render(this.scene, this.camera);
  }

  /**
   * 画質の段を、コマの長さを見て変える（QUALITY）。遅いコマがたまったら1段下げ、余裕のあるコマが続いたら1段上げてみる。
   * 上げてすぐ（QUALITY.retryMs 以内に）また遅くなったら、その段へは二度と上げない（上げ下げを繰り返さない）。
   * elapsed は前のコマからの時間（ms）。長く止まっていたとき（別の画面を見ていたなど）は数えない
   */
  private adaptQuality(elapsed: number, now: number) {
    if (this.fixedQuality || elapsed > 250) return;
    if (elapsed > QUALITY.slowMs) {
      this.slowFrames = Math.min(QUALITY.slowFrames * 2, this.slowFrames + (elapsed > 50 ? 3 : 1));
      this.fastFrames = 0;
    } else {
      this.slowFrames = Math.max(0, this.slowFrames - 1);
      this.fastFrames = elapsed < QUALITY.fastMs ? this.fastFrames + 1 : 0;
    }
    if (this.slowFrames >= QUALITY.slowFrames) {
      const lower = this.neighborLevel(1);
      if (lower === this.level) return;
      if (now - this.raisedAt < QUALITY.retryMs) this.ceiling = lower;
      this.setLevel(lower);
    } else if (this.fastFrames >= QUALITY.fastFrames) {
      const upper = this.neighborLevel(-1);
      if (upper === this.level || upper < this.ceiling) return;
      this.raisedAt = now;
      this.setLevel(upper);
    }
  }

  /** 今の段から dir（1：下げる、-1：上げる）の向きで、効果が今と変わる最初の段。なければ今の段 */
  private neighborLevel(dir: 1 | -1): number {
    const key = (l: number) => JSON.stringify(levelOf(l));
    for (let l = this.level + dir; l >= 0 && l < QUALITY.levels.length; l += dir) if (key(l) !== key(this.level)) return l;
    return this.level;
  }

  private setLevel(level: number) {
    this.level = level;
    this.slowFrames = 0;
    this.fastFrames = 0;
    this.applyLevel();
  }

  /** 今の段の効果にする：描く解像度、画面の仕上げ、地面の霧、空気の粒、影の地図の大きさ */
  private applyLevel() {
    const cfg = levelOf(this.level);
    this.pixelRatio = cfg.ratio;
    this.renderer.setPixelRatio(cfg.ratio); // 描く大きさも、この解像度でやり直される
    if (cfg.post && !this.post) {
      this.post = new PostFx();
      this.post.compile(this.renderer);
    } else if (!cfg.post && this.post) {
      this.post.dispose();
      this.post = null;
    }
    this.post?.setSize(this.cssWidth * cfg.ratio, this.cssHeight * cfg.ratio);
    if (this.mist) this.mist.visible = cfg.mist;
    this.particles.root.visible = cfg.particles;
    const shadow = this.torch.shadow;
    if (this.shadows && shadow.mapSize.x !== cfg.shadow) {
      shadow.mapSize.set(cfg.shadow, cfg.shadow);
      shadow.map?.dispose(); // 影の地図を、新しい大きさで作り直す
      shadow.map = null;
      this.renderer.shadowMap.needsUpdate = true;
    }
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
    // 連矢：まわりの敵も、当たるまで残す（連矢は少し遅れて当たる）
    if (impactMs > 0) {
      for (const p of cast.splash) {
        const near = this.shownState?.enemies.find((e) => e.pos.x === p.x && e.pos.y === p.y);
        if (near) this.dying.set(near.uid, performance.now() + impactMs + SPLASH_EXTRA_MS + DYING_EXTRA_MS);
      }
    }
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

  /**
   * たいまつの光が届く範囲にいる、見えている敵の位置と形を並べた文字（影の描き直しが要るかを比べる）。
   * 位置・向き・大きさ（崩れ落ちる途中など）を、1/100 マスの細かさで並べる。いなくなった敵は並ばないので、倒れて消えても変わる
   */
  private enemyShadowState(): string {
    const parts: string[] = [];
    const t = this.torch.position;
    for (const [uid, view] of this.enemies) {
      const b = view.body;
      if (!b.visible || Math.hypot(b.position.x - t.x, b.position.z - t.z) > TORCH.distance) continue;
      const r = (v: number) => Math.round(v * 100);
      parts.push(`${uid}:${r(b.position.x)},${r(b.position.y)},${r(b.position.z)},${r(b.rotation.y)},${r(b.rotation.z)},${r(b.scale.y)}`);
    }
    return parts.join('|');
  }

  /** 矢が当たるまで残していた、倒れた敵を崩れ落ちさせる */
  private updateDying(now: number) {
    for (const [uid, until] of this.dying) {
      if (now < until) continue;
      this.dying.delete(uid);
      if (!this.shownState?.enemies.some((e) => e.uid === uid)) this.collapseEnemy(uid);
    }
  }

  /** 敵が主人公を攻撃したとき：その種類の、主人公の隣にいる敵を飛びかからせる（同じ種類が何体もいれば、まだ飛びかかっていない敵から） */
  enemyAttack(by: EnemyId) {
    const s = this.shownState;
    if (!s || this.reduceMotion) return;
    const now = performance.now();
    const next = s.enemies.find(
      (e) => e.id === by && Math.abs(e.pos.x - s.player.x) + Math.abs(e.pos.y - s.player.y) === 1 && now - (this.lunges.get(e.uid) ?? -1e9) > ENEMY_MOTION.lunge.ms,
    );
    if (next) this.lunges.set(next.uid, now);
  }

  /** 飛びかかりの、主人公の方へずらす長さ（マス。マイナスは身を引く） */
  private lungeOffset(uid: number, now: number): number {
    const start = this.lunges.get(uid);
    if (start === undefined) return 0;
    const { windUp, reach, ms } = ENEMY_MOTION.lunge;
    const u = (now - start) / ms;
    if (u >= 1) {
      this.lunges.delete(uid);
      return 0;
    }
    if (u < 0.3) return -windUp * (u / 0.3);
    if (u < 0.5) return -windUp + (reach + windUp) * ((u - 0.3) / 0.2) ** 2;
    return reach * (1 - (u - 0.5) / 0.5) ** 2;
  }

  /** 倒れた敵を、倒れ方（deathKind.ts）に合わせて消す。動きを減らす設定では、すぐ消す */
  private collapseEnemy(uid: number) {
    const view = this.enemies.get(uid);
    if (!view || !view.body.visible || this.reduceMotion) {
      this.removeEnemyView(uid);
      return;
    }
    view.mark.visible = view.hp.visible = false;
    if (view.ring) view.ring.visible = false;
    if (view.shield) view.shield.visible = false;
    if (view.glow) view.glow.visible = false;
    const kind = deathKindOf(view.id, enemyBase(view.id));
    const fired = kind === 'crumble' || kind === 'vanish'; // 体が残る倒れ方は、最初から破片・霧を出す
    this.collapses.set(uid, { start: performance.now(), kind, fired });
    if (fired) this.emitDeathBits(view, kind);
  }

  /** 体の大きさを変える（立体の模型は横を同じに、ドット絵の板は足元をそろえる） */
  private squash(view: { model: EnemyModel | null; body: THREE.Object3D }, sx: number, sy: number) {
    if (view.model) view.body.scale.set(sx, sy, sx);
    else {
      view.body.scale.set(sx, sy, 1);
      view.body.position.y = 0.5 * sy;
    }
  }

  /** 倒れた敵の破片（氷・スライム・岩）か霧（霊体）を、体のあった場所から出す */
  private emitDeathBits(view: { body: THREE.Object3D }, kind: Exclude<DeathKind, 'collapse'>) {
    const fx = DEATH_FX[kind];
    const at = new THREE.Vector3(view.body.position.x, kind === 'vanish' ? 0.35 : 0.4, view.body.position.z);
    this.emitBits(at, { pieces: fx.pieces, speed: fx.speed, up: fx.up, gravity: fx.gravity, size: fx.size, color: fx.color, ms: fx.ms, mist: kind === 'vanish' });
  }

  /** 破片か霧をまとめて出す。mist なら、広がりながら薄れる霧の玉。そうでなければ、飛び散って落ちる破片 */
  private emitBits(at: THREE.Vector3, o: { pieces: number; speed: number; up: number; gravity: number; size: number; color: number; ms: number; mist?: boolean; additive?: boolean; delay?: number }) {
    const now = performance.now();
    for (let i = 0; i < o.pieces; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = o.speed * (0.5 + Math.random() * 0.8);
      const vel = new THREE.Vector3(Math.cos(angle) * speed, o.up * (0.6 + Math.random() * 0.8), Math.sin(angle) * speed);
      let obj: THREE.Mesh | THREE.Sprite;
      let base = 0;
      if (o.mist) {
        const map = this.softTexture('wisp', 32, (ctx) => {
          const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
          g.addColorStop(0, 'rgba(255,255,255,0.9)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, 32, 32);
        });
        obj = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: o.color, transparent: true, depthTest: false, opacity: 0.4 }));
        base = 0.3 * o.size * (0.7 + Math.random() * 0.6);
        obj.scale.setScalar(base);
        obj.renderOrder = 14;
      } else {
        obj = new THREE.Mesh(this.shared.chip, new THREE.MeshBasicMaterial({ color: o.color, transparent: true, depthWrite: false, ...(o.additive ? { blending: THREE.AdditiveBlending } : {}) }));
        obj.scale.setScalar(o.size * (0.6 + Math.random() * 0.9));
        obj.renderOrder = 14;
      }
      obj.position.copy(at);
      obj.visible = false;
      this.scene.add(obj);
      this.bits.push({ obj, from: at.clone(), vel, gravity: o.gravity, spin: (Math.random() - 0.5) * 14, start: now + (o.delay ?? 0) + (o.mist ? i * 70 : 0), ms: o.ms, base });
    }
  }

  /** 破片・霧を動かし、消え終わったものを片付ける */
  private updateBits(now: number) {
    for (let k = this.bits.length - 1; k >= 0; k--) {
      const b = this.bits[k]!;
      const t = (now - b.start) / b.ms;
      if (t < 0) continue;
      if (t >= 1) {
        this.scene.remove(b.obj);
        (b.obj.material as THREE.Material).dispose();
        this.bits.splice(k, 1);
        continue;
      }
      const sec = (now - b.start) / 1000;
      b.obj.visible = true;
      b.obj.position.set(b.from.x + b.vel.x * sec, Math.max(0.03, b.from.y + b.vel.y * sec - 0.5 * b.gravity * sec * sec), b.from.z + b.vel.z * sec);
      (b.obj.material as THREE.Material & { opacity: number }).opacity = (b.base > 0 ? 0.4 : 1) * (1 - t * t);
      if (b.base > 0) b.obj.scale.setScalar(b.base * (1 + 1.6 * t));
      else {
        b.obj.rotation.x += b.spin * 0.016;
        b.obj.rotation.z += b.spin * 0.012;
      }
    }
  }

  /** 倒れていく動き。倒れ方ごとに違う：氷は砕け、スライムは弾け、硬い敵は崩れ、霊体は霧になって昇り、ほかはつぶれて倒れる */
  private updateCollapses(now: number) {
    for (const [uid, c] of this.collapses) {
      const view = this.enemies.get(uid);
      const fx = c.kind === 'collapse' ? ENEMY_MOTION.collapse : DEATH_FX[c.kind];
      const ms = now - c.start;
      const u = ms / fx.ms;
      if (!view || u >= 1) {
        this.collapses.delete(uid);
        this.removeEnemyView(uid);
        continue;
      }
      const e = u * u * (3 - 2 * u);
      if (c.kind === 'shatter' || c.kind === 'burst') {
        const hideMs = DEATH_FX[c.kind].hideMs;
        if (ms < hideMs) {
          // 砕ける前にふくらむ（スライムは大きくふくらむ）
          const k = ms / hideMs;
          if (c.kind === 'burst') this.squash(view, 1 + 0.55 * k, 1 - 0.15 * k);
          else this.squash(view, 1 + 0.08 * k, 1 + 0.08 * k);
        } else {
          view.body.visible = false;
          if (!c.fired) {
            c.fired = true;
            this.emitDeathBits(view, c.kind);
          }
        }
      } else if (c.kind === 'vanish') {
        // 細く伸びながら昇って消える
        this.squash(view, Math.max(0.05, 1 - 0.7 * e), 1 + 0.45 * e);
        if (view.model) view.body.position.y = 0.35 * e;
        if (u > 0.85) view.body.visible = false;
      } else if (view.model) {
        view.body.scale.set(1 + 0.3 * e, Math.max(0.05, 1 - 0.9 * e), 1 + 0.3 * e);
        view.body.rotation.z = 0.35 * e * (uid % 2 === 0 ? 1 : -1);
        view.body.position.y = -0.05 * e;
      } else {
        view.body.scale.set(1, Math.max(0.05, 1 - 0.9 * e), 1);
        view.body.position.y = 0.5 * Math.max(0.05, 1 - 0.9 * e);
      }
    }
  }

  /** 縁をなめらかにした、丸い光の絵（size は一辺のピクセル数。draw は 0〜size の座標で描く） */
  private softTexture(key: string, size: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.Texture {
    const tex = this.texture(key, size, size, draw);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  /** 主人公が at のマスの敵を攻撃したとき：敵の方を向いて、武器を振る */
  heroAttack(at: Pos, glow?: { weapon: WeaponType | null; tier: number }) {
    const me = this.shownState?.player;
    if (me && Math.abs(me.x - at.x) + Math.abs(me.y - at.y) === 1) this.heroDir = dirBetween(me, at);
    this.hero.swing();
    if (glow) this.afterglow(at, glow.weapon, glow.tier);
  }

  /**
   * 通常攻撃の残光。武器の段階が上がるほど派手になる：
   * 1〜3段は細い白青の斬撃1本、4〜7段は金色の2本、8〜10段は橙の3本と火花。剣は斬撃、槌と杖は衝撃の光と火花
   */
  private afterglow(at: Pos, weapon: WeaponType | null, tier: number) {
    if (this.reduceMotion) return;
    const idx = Math.max(0, AFTERGLOW_FX.tiers.findIndex((t) => tier <= t.upTo));
    const fx = AFTERGLOW_FX.tiers[idx]!;
    const now = performance.now();
    if (weapon === 'hammer' || weapon === 'staff') {
      const map = this.softTexture('flash', 48, (ctx) => {
        const g = ctx.createRadialGradient(24, 24, 1, 24, 24, 23);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.4, 'rgba(255,255,255,0.45)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 48, 48);
      });
      const color = weapon === 'staff' ? [0xc8a8ff, 0xe0c8ff, 0xffffff][idx]! : [0xd8d0c0, 0xffe27a, 0xffa860][idx]!;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, depthTest: false, opacity: 0, blending: THREE.AdditiveBlending }));
      sprite.renderOrder = 16;
      sprite.position.set(at.x, AFTERGLOW_FX.y, at.y);
      this.scene.add(sprite);
      this.slashes.push({ sprite, start: now, ms: fx.ms, size: fx.size * 1.4, aspect: 1 });
      this.emitBits(new THREE.Vector3(at.x, AFTERGLOW_FX.y, at.y), { pieces: 2 + idx * 3, speed: 1.4, up: 1.2, gravity: 5, size: 0.8, color, ms: fx.ms + 150, additive: true });
      return;
    }
    const map = this.texture(`afterglow${idx}`, 64, 32, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 64, 0);
      g.addColorStop(0, `${fx.color}0)`);
      g.addColorStop(0.5, `${fx.color}1)`);
      g.addColorStop(1, `${fx.color}0)`);
      ctx.strokeStyle = g;
      ctx.lineWidth = 3 + idx * 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(2, 24);
      ctx.quadraticCurveTo(32, 4, 62, 24);
      ctx.stroke();
    });
    for (let i = 0; i < fx.count; i++) {
      const spread = fx.count === 1 ? 0 : (i / (fx.count - 1) - 0.5) * 1.6;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false, opacity: 0, rotation: 0.55 + spread, blending: THREE.AdditiveBlending }));
      sprite.renderOrder = 16;
      sprite.position.set(at.x, AFTERGLOW_FX.y, at.y);
      this.scene.add(sprite);
      this.slashes.push({ sprite, start: now + i * AFTERGLOW_FX.stagger, ms: fx.ms, size: fx.size, aspect: 0.5 });
    }
    if (idx >= 2) this.emitBits(new THREE.Vector3(at.x, AFTERGLOW_FX.y, at.y), { pieces: AFTERGLOW_FX.sparks, speed: 1.6, up: 1.3, gravity: 5, size: 0.8, color: 0xffb060, ms: fx.ms + 200, additive: true });
  }

  /** 攻撃したとき・攻撃されたときに、画面を少し拡大縮小する。動きを減らす設定では何もしない */
  hitPulse(kind: HitPulse) {
    this.lastCombatAt = performance.now();
    if (this.reduceMotion || !feelSettings().shake) return;
    // 敵の攻撃は、自分の攻撃より目立たせる（同時に起きたら敵の攻撃の効果にする）
    if (this.pulse?.kind === 'hurt' && kind === 'attack' && performance.now() - this.pulse.start < HIT_PULSE.hurt.ms) return;
    this.pulse = { kind, start: performance.now() };
  }

  /**
   * ヒットストップ：当てた一瞬、画面を止める（ms ミリ秒。重なったら長いほう。最長は HIT_STOP.max）。
   * 「動きを減らす」設定・手応えの設定でヒットストップを切っているときは止めない
   */
  hitStop(ms: number) {
    if (this.reduceMotion || !feelSettings().hitStop) return;
    const until = performance.now() + Math.min(HIT_STOP.max, ms);
    if (until > this.stopUntil) this.stopUntil = until;
  }

  /** 画面を止めているあいだ true（呼び出し側は、描かずに動きの時計を止める） */
  holdFrame(now: number): boolean {
    return now < this.stopUntil;
  }

  /**
   * ダメージの数字を出す。at は受けた側のマス、kind は与えた（dealt）か受けた（taken）か。
   * 同じマスに続けて出るときは、少しずつ横にずらして重ならないようにする
   */
  popDamage(at: Pos, amount: number, kind: 'dealt' | 'taken', style: { blocked?: boolean; affinity?: 'weak' | 'resist'; combo?: 'smash' | 'sear' | 'arcane'; killed?: boolean } = {}) {
    // 見た目：コンボ ＞ 相性（弱点は大きく黄色、効きにくいのは小さく灰色）。倒した一撃は、もう少し大きく
    const base = style.combo ? DAMAGE_STYLE[style.combo] : style.affinity ? DAMAGE_STYLE[style.affinity] : null;
    const color = style.blocked ? FOE_FX.marks.blocked : (base?.color ?? DAMAGE_POP.colors[kind]);
    const scale = (base?.scale ?? 1) * (style.killed && kind === 'dealt' ? DAMAGE_STYLE.kill.scale : 1);
    this.popText(at, style.combo || style.affinity === 'weak' ? `${amount}!` : String(amount), color, scale);
  }

  /** 連続で倒したときの「n連」を、倒した場所に出す */
  popChain(at: Pos, count: number, color: string) {
    this.popText({ x: at.x, y: at.y - 0.4 }, `${count}連`, color, 1.2);
  }

  /** at のマスの上に、色つきの短い文字を浮かべる（ダメージの数字や、突進・召喚の知らせ） */
  private popText(at: Pos, text: string, color: string, scale = 1) {
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
    ctx.strokeText(text, 64, 34);
    ctx.fillStyle = color;
    ctx.fillText(text, 64, 34);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
    sprite.renderOrder = 20; // 壁や敵より手前に出す
    const now = performance.now();
    const crowd = this.damagePops.filter((p) => p.sprite.userData.tile === `${at.x},${at.y}` && now - p.start < DAMAGE_POP.ms / 2).length;
    sprite.userData = { tile: `${at.x},${at.y}`, x: at.x + crowd * 0.45, z: at.y, scale };
    this.scene.add(sprite);
    this.damagePops.push({ sprite, start: now });
    this.updateDamagePops(now);
  }

  /**
   * 敵の行動の個性の演出を始める（遠距離の矢・壁にぶつかった・召喚）。突進の構えは頭上のマーク、走る動きは敵の位置の移り変わりで見せる。
   * 返す値は、矢が当たるまでのミリ秒（矢がなければ 0）。そのあいだ、矢に当たった側のダメージの数字を待たせる
   */
  playFoes(foes: readonly FoeEvent[]): number {
    let shotMs = 0;
    for (const f of foes) {
      if (f.kind === 'shot' && !this.reduceMotion) {
        const mesh = new THREE.Mesh(this.shared.shotBall, new THREE.MeshBasicMaterial({ color: FOE_FX.shotColors[enemyBase(f.by).element], transparent: true, depthTest: false }));
        mesh.renderOrder = 15;
        mesh.position.set(f.from.x, FOE_FX.shot.height, f.from.y);
        this.scene.add(mesh);
        this.shots.push({ mesh, from: f.from, to: f.to, start: performance.now(), ms: FOE_FX.shot.ms });
        shotMs = FOE_FX.shot.ms;
      } else if (f.kind === 'skill') shotMs = Math.max(shotMs, this.playSkill(f));
      else if (f.kind === 'steam') this.puff(f.at);
      else if (f.kind === 'foe_status') this.foeBurst(f.at, f.status);
      else if (f.kind === 'combo') this.foeBurst(f.at, f.combo);
      else if (f.kind === 'bump') this.popText(f.at, '★', FOE_FX.marks.bump);
      else if (f.kind === 'summon') this.popText(f.at, '呼', FOE_FX.marks.summon);
      else if (f.kind === 'roar') this.roar(f.at, f.phase);
      else if (f.kind === 'sow') this.sow(f);
      else if (f.kind === 'alarm') this.alarm(f.at);
    }
    return shotMs;
  }

  /** 見張りの叫び：頭上に「叫」が浮かび、足元から、声の届く広さ（alarmRange）まで輪が広がる（揺れはない） */
  private alarm(at: Pos) {
    this.popText(at, '叫', FOE_FX.marks.alarm);
    if (this.reduceMotion) return;
    const mesh = new THREE.Mesh(this.shared.ring, new THREE.MeshBasicMaterial({ color: FOE_FX.alarm.color, transparent: true, depthTest: false, side: THREE.DoubleSide }));
    mesh.renderOrder = 14;
    mesh.position.set(at.x, 0.05, at.y);
    this.scene.add(mesh);
    this.roars.push({ mesh, at, start: performance.now(), reach: ENEMY_CONFIG.alarmRange / FOE_FX.alarm.ringRadius - 1, ms: FOE_FX.alarm.ms });
  }

  /** ボスの咆哮：足元から輪が広がり、画面が揺れる。段階が高いほど大きく、強く揺れる */
  private roar(at: Pos, phase: number) {
    const color = FOE_FX.phase.colors[Math.min(2, Math.max(0, phase - 1))]!;
    this.popText(at, '咆', `#${color.toString(16).padStart(6, '0')}`);
    if (this.reduceMotion) return;
    const mesh = new THREE.Mesh(this.shared.ring, new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false, side: THREE.DoubleSide }));
    mesh.renderOrder = 14;
    mesh.position.set(at.x, 0.05, at.y);
    this.scene.add(mesh);
    this.roars.push({ mesh, at, start: performance.now(), reach: FOE_FX.phase.roarReach + phase, ms: FOE_FX.phase.roarMs });
    this.spellFx.shakeScreen(FOE_FX.phase.shake * (phase - 1));
  }

  /** 咆哮の輪を広げながら薄くし、終わったものを片付ける */
  private updateRoars(now: number) {
    for (let k = this.roars.length - 1; k >= 0; k--) {
      const { mesh, at, start, reach, ms } = this.roars[k]!;
      const t = (now - start) / ms;
      if (t >= 1) {
        this.scene.remove(mesh);
        (mesh.material as THREE.Material).dispose();
        this.roars.splice(k, 1);
        continue;
      }
      mesh.position.set(at.x, 0.05, at.y);
      mesh.scale.setScalar(1 + reach * t);
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - t);
    }
  }

  /** ボスの床まき：ボスから、床の落ちるマスへ、炎の玉・氷の玉を投げる（床そのものは状態から描く） */
  private sow(f: Extract<FoeEvent, { kind: 'sow' }>) {
    if (this.reduceMotion) return;
    const color = f.field === 'fire' ? FOE_FX.shotColors.fire : FOE_FX.shotColors.ice;
    for (const to of f.to) {
      const mesh = new THREE.Mesh(this.shared.shotBall, new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false }));
      mesh.renderOrder = 15;
      mesh.position.set(f.at.x, FOE_FX.shot.height, f.at.y);
      this.scene.add(mesh);
      this.shots.push({ mesh, from: f.at, to, start: performance.now(), ms: FOE_FX.shot.ms });
    }
  }

  /**
   * 武器の固有技の演出：剣は斬撃の残光が2回、槌は足元から広がる輪、杖は魔力の玉が飛ぶ。
   * 返す値は、当たるまでのミリ秒（玉が飛ぶ杖だけ。ほかは0）
   */
  private playSkill(f: Extract<FoeEvent, { kind: 'skill' }>): number {
    const fx = FOE_FX.skill;
    const now = performance.now();
    if (f.weapon === 'staff') {
      if (this.reduceMotion) return 0;
      const to = f.path[f.path.length - 1] ?? f.from;
      const mesh = new THREE.Mesh(this.shared.shotBall, new THREE.MeshBasicMaterial({ color: fx.bolt.color, transparent: true, depthTest: false }));
      mesh.scale.setScalar(fx.bolt.scale);
      mesh.renderOrder = 15;
      mesh.position.set(f.from.x, FOE_FX.shot.height, f.from.y);
      this.scene.add(mesh);
      this.shots.push({ mesh, from: f.from, to: to, start: now, ms: FOE_FX.shot.ms });
      return FOE_FX.shot.ms;
    }
    if (f.weapon === 'hammer') {
      const mesh = new THREE.Mesh(this.shared.slamRing, new THREE.MeshBasicMaterial({ color: fx.slam.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      mesh.position.set(f.from.x, fx.slam.y, f.from.y);
      mesh.scale.setScalar(fx.slam.from);
      this.scene.add(mesh);
      this.rings.push({ mesh, start: now });
      return 0;
    }
    // 剣：当たったマスに、斜めの斬撃を2本（時間をずらして）
    const at = f.path[0] ?? f.from;
    const map = this.texture('slash', 64, 32, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 64, 0);
      g.addColorStop(0, 'rgba(160,230,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(160,230,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(2, 22);
      ctx.quadraticCurveTo(32, 6, 62, 22);
      ctx.stroke();
    });
    for (let i = 0; i < 2; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false, opacity: 0, rotation: i === 0 ? 0.55 : -0.55 }));
      sprite.renderOrder = 16;
      sprite.scale.set(fx.slash.size, fx.slash.size / 2, 1);
      sprite.position.set(at.x, fx.slash.y, at.y);
      this.scene.add(sprite);
      this.slashes.push({ sprite, start: now + i * fx.slash.stagger });
    }
    return 0;
  }

  /** 斬撃の残光と、地響きの輪を動かし、終わったものを片付ける */
  private updateSkillFx(now: number) {
    const fx = FOE_FX.skill;
    for (let k = this.slashes.length - 1; k >= 0; k--) {
      const { sprite, start, ms, size, aspect } = this.slashes[k]!;
      const t = (now - start) / (ms ?? fx.slash.ms);
      if (t < 0) continue;
      if (t >= 1) {
        this.scene.remove(sprite);
        sprite.material.dispose();
        this.slashes.splice(k, 1);
        continue;
      }
      sprite.material.opacity = 1 - t;
      const w = (size ?? fx.slash.size) * (0.8 + 0.4 * t);
      sprite.scale.set(w, w * (aspect ?? 0.5), 1);
    }
    for (let k = this.rings.length - 1; k >= 0; k--) {
      const { mesh, start } = this.rings[k]!;
      const t = (now - start) / fx.slam.ms;
      if (t >= 1) {
        this.scene.remove(mesh);
        (mesh.material as THREE.Material).dispose();
        this.rings.splice(k, 1);
        continue;
      }
      mesh.scale.setScalar(fx.slam.from + (fx.slam.to - fx.slam.from) * t);
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t);
    }
  }

  /** 水蒸気を立ち上らせる（燃える床と霜の床がぶつかったとき） */
  private puff(at: Pos) {
    if (this.reduceMotion) return;
    const map = this.texture('steam', 32, 32, (ctx) => {
      const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 32, 32);
    });
    for (let i = 0; i < FOE_FX.steam.count; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false, opacity: 0.7 }));
      sprite.renderOrder = 14;
      sprite.scale.setScalar(FOE_FX.steam.size);
      sprite.position.set(at.x, 0.3, at.y);
      this.scene.add(sprite);
      this.puffs.push({ sprite, at, start: performance.now() + i * 90, drift: (i - (FOE_FX.steam.count - 1) / 2) * 0.18 });
    }
  }

  /** 水蒸気の粒を動かし、消えたものを片付ける */
  private updatePuffs(now: number) {
    for (let k = this.puffs.length - 1; k >= 0; k--) {
      const { sprite, at, start, drift } = this.puffs[k]!;
      const t = (now - start) / FOE_FX.steam.ms;
      if (t < 0) continue;
      if (t >= 1) {
        this.scene.remove(sprite);
        sprite.material.dispose();
        this.puffs.splice(k, 1);
        continue;
      }
      sprite.position.set(at.x + drift * t, 0.3 + FOE_FX.steam.rise * t, at.y);
      sprite.material.opacity = 0.7 * (1 - t);
      sprite.scale.setScalar(FOE_FX.steam.size * (0.6 + 0.8 * t));
    }
  }

  /** 床の跡の板：燃える床はオレンジの炎、霜の床は青白い氷。最後の1ターンは薄くする */
  private fieldMaterials() {
    if (this.fieldMats) return this.fieldMats;
    const make = (key: string, draw: (ctx: CanvasRenderingContext2D) => void, additive: boolean, opacity: number) => {
      const mat = new THREE.MeshBasicMaterial({ map: this.texture(key, 64, 64, draw), transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      if (additive) mat.blending = THREE.AdditiveBlending;
      return mat;
    };
    const fire = (ctx: CanvasRenderingContext2D) => {
      const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 31);
      g.addColorStop(0, 'rgba(255,224,120,0.95)');
      g.addColorStop(0.55, 'rgba(255,110,30,0.75)');
      g.addColorStop(1, 'rgba(160,30,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      // 小さな炎の舌（決まった並び）
      ctx.fillStyle = 'rgba(255,240,170,0.8)';
      for (let i = 0; i < 14; i++) {
        const a = i * 2.4;
        const r = 6 + ((i * 7) % 18);
        ctx.fillRect(32 + Math.cos(a) * r - 1, 32 + Math.sin(a) * r - 2, 3, 5);
      }
    };
    const frost = (ctx: CanvasRenderingContext2D) => {
      const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 31);
      g.addColorStop(0, 'rgba(235,250,255,0.9)');
      g.addColorStop(0.6, 'rgba(150,210,245,0.75)');
      g.addColorStop(1, 'rgba(110,170,230,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      // 氷の筋（雪の結晶のような6本）
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 + 0.3;
        ctx.beginPath();
        ctx.moveTo(32, 32);
        ctx.lineTo(32 + Math.cos(a) * 24, 32 + Math.sin(a) * 24);
        ctx.stroke();
      }
    };
    const f = FOE_FX.field;
    this.fieldMats = {
      fire: make('field:fire', fire, true, f.fireOpacity),
      fireLast: make('field:fire', fire, true, f.fireOpacity * f.lastTurn),
      frost: make('field:frost', frost, false, f.frostOpacity),
      frostLast: make('field:frost', frost, false, f.frostOpacity * f.lastTurn),
    };
    return this.fieldMats;
  }

  /** 状態が変わったとき、見えているマスの床の跡を板で並べ直す */
  private updateFields(frame: Frame) {
    this.fieldGroup.clear();
    const { fields, map } = frame.state;
    if (fields.length === 0) return;
    const mats = this.fieldMaterials();
    for (const f of fields) {
      if (!frame.visible.has(f.pos.y * map.width + f.pos.x)) continue;
      const mesh = new THREE.Mesh(this.shared.fieldPlate, mats[`${f.kind}${f.turns <= 1 ? 'Last' : ''}` as keyof typeof mats]);
      mesh.position.set(f.pos.x, FOE_FX.field.y, f.pos.y);
      mesh.renderOrder = 2;
      this.fieldGroup.add(mesh);
    }
  }

  /** 燃える床は、炎のようにちらつかせる（「動きを減らす」設定では止める） */
  private updateFieldLook(now: number) {
    const mats = this.fieldMats;
    if (!mats || this.fieldGroup.children.length === 0 || this.reduceMotion) return;
    const f = FOE_FX.field;
    const wave = Math.sin(now / 110) * 0.6 + Math.sin(now / 47 + 1.3) * 0.4;
    mats.fire.opacity = f.fireOpacity * (1 + f.flicker * wave);
    mats.fireLast.opacity = f.fireOpacity * f.lastTurn * (1 + f.flicker * wave);
  }

  /** 飛んでいる矢を動かし、当たったものを片付ける */
  private updateShots(now: number) {
    for (let k = this.shots.length - 1; k >= 0; k--) {
      const { mesh, from, to, start, ms } = this.shots[k]!;
      const t = (now - start) / ms;
      if (t >= 1) {
        this.scene.remove(mesh);
        (mesh.material as THREE.Material).dispose();
        this.shots.splice(k, 1);
        continue;
      }
      mesh.position.set(from.x + (to.x - from.x) * t, FOE_FX.shot.height, from.y + (to.y - from.y) * t);
    }
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
      const { x, z, scale = 1 } = sprite.userData as { x: number; z: number; scale?: number };
      const size = (this.reduceMotion ? DAMAGE_POP.to * 0.75 : DAMAGE_POP.from + (DAMAGE_POP.to - DAMAGE_POP.from) * grow) * scale;
      sprite.scale.set(size * 2, size, 1); // 字の画像は横長（2:1）
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

  /** 登場演出を始める：カメラが寄り、画面側が名前を出す */
  private startIntro(name: string, boss: boolean) {
    this.intro = { start: performance.now(), holdMs: boss ? INTRO_FX.bossHoldMs : INTRO_FX.holdMs };
    this.onIntro?.({ name, boss });
  }

  /** 登場演出のあいだ、少し寄って戻る倍率（動きを減らす設定では寄らない） */
  private introZoom(now: number): number {
    if (!this.intro || this.reduceMotion) return 1;
    const { start, holdMs } = this.intro;
    const t = now - start;
    if (t >= INTRO_FX.inMs + holdMs + INTRO_FX.outMs) {
      this.intro = null;
      return 1;
    }
    const ease = (x: number) => x * x * (3 - 2 * x);
    const k = t < INTRO_FX.inMs ? ease(t / INTRO_FX.inMs) : t < INTRO_FX.inMs + holdMs ? 1 : 1 - ease((t - INTRO_FX.inMs - holdMs) / INTRO_FX.outMs);
    return 1 + (INTRO_FX.zoom - 1) * k;
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
    for (const b of this.bits) (b.obj.material as THREE.Material).dispose();
    for (const m of this.glowMats.values()) m.dispose();
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
      for (const t of atlas ? [atlas.floor, atlas.top, atlas.side, atlas.floorBump, atlas.topBump, atlas.sideBump] : []) t?.dispose();
    }
    for (const m of [this.shared.chestFront, this.shared.chestSide, this.shared.chestLidMat]) m.map?.dispose();
    for (const r of Object.values(this.shared)) for (const d of Array.isArray(r) ? r : [r]) d.dispose();
    for (const m of this.materials.values()) m.dispose();
    for (const m of this.litMaterials.values()) m.dispose();
    this.billboard.dispose();
    this.fog.dispose();
    this.sconces.dispose();
    this.particles.dispose();
    this.post?.dispose();
    if (this.mist) {
      this.mist.geometry.dispose();
      (this.mist.material as THREE.Material).dispose();
    }
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
    let stones = 0;
    let puddles = 0;
    let bones = 0;
    const boneColor = new THREE.Color(DEBRIS.boneColor);
    const roomTiles = this.roomTilesOf(map);
    const puddleColor = new THREE.Color(FLOOR_LOOK.puddle.color);
    const stoneColor = new THREE.Color(colors.wall).multiplyScalar(DEBRIS.darken);
    const e = new THREE.Euler();
    const size = new THREE.Vector3();
    const size3 = new THREE.Vector3();
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
          // 通路の床は、部屋の床より少し暗く
          this.floors[k]!.setColorAt(floorCounts[k]!++, c.copy(floorBase).multiplyScalar(variety * (roomTiles.has(i) ? 1 : FLOOR_LOOK.corridor)));
          // 小石と崩れた石：マスの位置で決まる乱数で置く（歩いても変わらない）
          const walls = SHADOW_SIDES.filter((side) => seenWall(x + side.dx, z + side.dz));
          const r = (n: number) => tileRandom(x, z, n);
          const pieces = walls.length > 0 ? (r(0) < DEBRIS.rubbleChance ? 1 + Math.floor(r(1) * 3) : 0) : r(0) < DEBRIS.pebbleChance ? 1 : 0;
          for (let n = 0; n < pieces && stones < DRAW_CAPACITY * DEBRIS.perTile; n++) {
            const wall = walls.length > 0 ? walls[Math.floor(r(10 + n) * walls.length)]! : null;
            const [lo, hi] = wall ? DEBRIS.rubbleSize : DEBRIS.pebbleSize;
            const s = lo + (hi - lo) * r(20 + n);
            const along = (r(30 + n) - 0.5) * 0.85;
            // 崩れた石は壁際へ寄せ、小石はマスの中のどこかに置く
            const px = wall ? x + wall.dx * (0.44 - s * 0.5) + (wall.dx === 0 ? along : 0) : x + (r(40 + n) - 0.5) * 0.8;
            const pz = wall ? z + wall.dz * (0.44 - s * 0.5) + (wall.dz === 0 ? along : 0) : z + (r(50 + n) - 0.5) * 0.8;
            at.set(px, s * 0.25, pz);
            q.setFromEuler(e.set(r(60 + n) * 0.6, r(70 + n) * Math.PI * 2, r(80 + n) * 0.6));
            this.debris.setMatrixAt(stones, m.compose(at, q, size.set(s * (0.8 + r(90 + n) * 0.5), s, s * (0.8 + r(95 + n) * 0.5))));
            this.debris.setColorAt(stones++, c.copy(stoneColor).multiplyScalar(0.8 + r(99 + n) * 0.4));
          }
          // 骨：壁際に多く、ときどき2本重なる
          if (r(400) < (walls.length > 0 ? DEBRIS.boneChance * 2 : DEBRIS.boneChance)) {
            const count = r(401) < 0.35 ? 2 : 1;
            for (let n = 0; n < count && bones < DRAW_CAPACITY; n++) {
              const len = DEBRIS.boneSize[0] + (DEBRIS.boneSize[1] - DEBRIS.boneSize[0]) * r(410 + n);
              at.set(x + (r(420 + n) - 0.5) * 0.6, 0.012, z + (r(430 + n) - 0.5) * 0.6);
              q.setFromAxisAngle(up, r(440 + n) * Math.PI);
              this.bones.setMatrixAt(bones, m.compose(at, q, size3.set(len / 0.14, len / 0.14, len / 0.14)));
              this.bones.setColorAt(bones++, c.copy(boneColor).multiplyScalar(0.8 + r(450 + n) * 0.3));
            }
          }
          // 水たまり（炎のダンジョンには置かない）
          if (trait !== 'fire' && r(200) < FLOOR_LOOK.puddle.chance) {
            const [lo, hi] = FLOOR_LOOK.puddle.size;
            const size = (lo + (hi - lo) * r(201)) * 2;
            at.set(x + (r(202) - 0.5) * 0.4, 0.006, z + (r(203) - 0.5) * 0.4);
            q.setFromAxisAngle(up, r(204) * Math.PI);
            this.puddles.setMatrixAt(puddles, m.compose(at, q, size3.set(size, 1, size * (0.55 + r(205) * 0.4))));
            this.puddles.setColorAt(puddles++, puddleColor);
          }
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
      [this.debris, stones] as const,
      [this.puddles, puddles] as const,
      [this.bones, bones] as const,
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
    const { shininess, specular } = TRAIT_GLOSS[trait] ?? WET_STONE;
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
        .then(async ([floor, top, side]) => {
          // 凹凸の絵は、1枚ずつコマを分けて作る（1度にやると、そのコマが止まる）
          const bump = async (t: THREE.Texture, span: { u: number; v: number }, strength: number) => {
            await new Promise((done) => requestAnimationFrame(done));
            try {
              return normalMapFrom(t.image as HTMLImageElement, span, strength);
            } catch {
              return null; // 作れなければ凹凸は付けない（色だけで描く）
            }
          };
          const floorBump = await bump(floor, { u: TEXTURE_SPAN, v: TEXTURE_SPAN }, SURFACE_BUMP.floor);
          const topBump = await bump(top, { u: TEXTURE_SPAN, v: TEXTURE_SPAN }, SURFACE_BUMP.top);
          const sideBump = await bump(side, { u: TEXTURE_SPAN, v: WALL_HEIGHT }, SURFACE_BUMP.side);
          for (const n of [floorBump, topBump, sideBump]) if (n) n.anisotropy = floor.anisotropy;
          this.atlases.set(trait, { floor, top, side, floorBump, topBump, sideBump });
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
      // テクスチャの明るさを高さとみなして、石の継ぎ目やひびに陰を付ける（事前に作った凹凸の絵を読む）
      mat.normalMap = atlas?.floorBump ?? null;
      mat.specularMap = mat.map; // 石の面は照り返し、継ぎ目やひびは照り返さない
      mat.needsUpdate = true;
    });
    for (const { top, side } of this.wallMaterials) {
      top.map = atlas?.top ?? null;
      side.map = atlas?.side ?? null;
      top.normalMap = atlas?.topBump ?? null;
      side.normalMap = atlas?.sideBump ?? null;
      top.specularMap = top.map;
      side.specularMap = side.map;
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
      // 鉄の帯と錠前：本体の前・上・後ろを巻く2本の帯と、正面の錠前と鍵穴。ふたの帯はふたと一緒に動く
      const { chestBand, chestLidBand, chestLock, chestKeyhole, ironMat, keyholeMat } = this.shared;
      for (const bx of [-CHEST.width * 0.3, CHEST.width * 0.3]) {
        const band = new THREE.Mesh(chestBand, ironMat);
        band.position.set(bx, 0, 0);
        body.add(band);
        const lidBand = new THREE.Mesh(chestLidBand, ironMat);
        lidBand.position.set(bx, 0, 0);
        lid.add(lidBand);
      }
      const lock = new THREE.Mesh(chestLock, ironMat);
      lock.position.set(0, CHEST.height * 0.82, CHEST.depth / 2 + 0.006);
      const keyhole = new THREE.Mesh(chestKeyhole, keyholeMat);
      keyhole.position.set(0, CHEST.height * 0.8, CHEST.depth / 2 + 0.013);
      body.add(lock, keyhole);
      // 木の板の継ぎ目（前・後ろ・左右に横の溝を2本）と、奥の縁の蝶番
      const { chestGrooveFront, chestGrooveSide, chestHinge, grooveMat } = this.shared;
      for (const y of [CHEST.height / 3, (CHEST.height * 2) / 3]) {
        for (const z of [CHEST.depth / 2 + 0.002, -CHEST.depth / 2 - 0.002]) {
          const groove = new THREE.Mesh(chestGrooveFront, grooveMat);
          groove.position.set(0, y, z);
          body.add(groove);
        }
        for (const x of [CHEST.width / 2 + 0.002, -CHEST.width / 2 - 0.002]) {
          const groove = new THREE.Mesh(chestGrooveSide, grooveMat);
          groove.position.set(x, y, 0);
          body.add(groove);
        }
      }
      for (const bx of [-CHEST.width * 0.3, CHEST.width * 0.3]) {
        const hinge = new THREE.Mesh(chestHinge, ironMat);
        hinge.position.set(bx, CHEST.height, -CHEST.depth / 2 - 0.004);
        body.add(hinge);
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
      const view = this.enemies.get(e.uid) ?? this.createEnemyView(e);
      view.body.visible = view.mark.visible = true;
      if (view.ring) view.ring.visible = true;
      const def = enemyDef(e);
      // ボスの段階：段階が上がると、体が少し大きくなり、足元の輪の色が変わって大きくなる。盾は、持つ段階になってから作る
      if (def.boss) {
        const phase = e.phase ?? 1;
        view.body.scale.setScalar(1 + FOE_FX.phase.grow * (phase - 1));
        if (view.ring) {
          view.ring.material = [this.shared.bossMat, this.shared.bossMat2, this.shared.bossMat3][Math.min(2, phase - 1)]!;
          view.ring.scale.setScalar(1 + FOE_FX.phase.ringGrow * (phase - 1));
        }
        if (!view.shield && behaviorsOf(def).includes('shield')) {
          view.shield = new THREE.Mesh(this.shared.shieldPlate, this.shared.shieldMat);
          this.scene.add(view.shield);
        }
      }
      if (view.shield) view.shield.visible = true;
      if (view.glow) view.glow.visible = true;
      // 強敵とボスは、初めて視界に入ったときに、カメラを寄せて名前を出す
      if ((e.elite || def.boss) && !this.introduced.has(e.uid)) {
        this.introduced.add(e.uid);
        this.startIntro(def.name, def.boss === true);
      }
      // 向き：歩いたらその向き、止まっていても主人公を追っていれば主人公の方を向く
      const from = frame.from.enemies.get(e.uid);
      if (from && (from.x !== e.pos.x || from.y !== e.pos.y)) view.facing = facingToward(from, e.pos);
      else if (e.mode !== 'wander') view.facing = facingToward(e.pos, state.player);
      if (view.shield) view.facing = e.facing ?? 'down'; // 盾持ちは、盾を向けている向き（最後に歩いた向き）を向く
      // 頭上のマーク。気付いた瞬間の「！」だけ大きく強調する
      // 動けない敵（強衝撃）は黄色い星、出血している敵（烈なぎ払い）は赤い丸
      if (e.frozen) view.mark.material = this.textMaterial('氷', FOE_STATUS_FX.marks.freeze);
      else if ((e.stun ?? 0) > 0) view.mark.material = this.textMaterial('★', '#ffe27a');
      else if (e.charge) view.mark.material = this.textMaterial('‼', FOE_FX.marks.charge); // 突進の構え
      else if (e.burn) view.mark.material = this.textMaterial('炎', FOE_STATUS_FX.marks.burn);
      else if (e.bleed) view.mark.material = this.textMaterial('●', '#e0384a');
      else view.mark.material = this.textMaterial(ENEMY_MARK[e.mode].mark, e.mode === 'wander' ? '#b9b29f' : '#e2c178');
      view.mark.scale.setScalar(e.justNoticed || e.charge ? 0.7 : 0.45);
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
        // 同じ階で倒した敵は崩れ落ちさせる（階を移ったときは、前の階の敵をすぐ消す）
        else if (this.shownState?.map !== state.map) this.removeEnemyView(uid);
        else if (!this.collapses.has(uid)) this.collapseEnemy(uid);
      }
      else {
        view.body.visible = view.mark.visible = view.hp.visible = false;
        if (view.ring) view.ring.visible = false;
        if (view.shield) view.shield.visible = false;
        if (view.glow) view.glow.visible = false;
      }
    }
  }

  /** 自分で光る体質の敵の、足元の光の板（体質ごとに材料を1つ使い回す）。光らない敵は null */
  private makeGlow(element: string): THREE.Mesh | null {
    if (!(element in GLOW_FX.colors)) return null;
    let mat = this.glowMats.get(element);
    if (!mat) {
      const map = this.softTexture('glow', 64, (ctx) => {
        const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 64, 64);
      });
      mat = new THREE.MeshBasicMaterial({
        map,
        color: GLOW_FX.colors[element as keyof typeof GLOW_FX.colors],
        transparent: true,
        opacity: GLOW_FX.opacity[element as keyof typeof GLOW_FX.opacity],
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
      });
      this.glowMats.set(element, mat);
    }
    return new THREE.Mesh(this.shared.glowPlane, mat);
  }

  /** 光の直径（マス）。半径の2倍。強敵・ボスは大きい */
  private glowSizeOf(element: string, elite: boolean): number {
    return GLOW_FX.radius[element as keyof typeof GLOW_FX.radius] * 2 * (elite ? GLOW_FX.eliteRate : 1);
  }

  /** 敵1体の見た目（模型か絵の板、頭上のマーク、体力の棒、強敵の輪）を作って、隠したまま場面に置く */
  private createEnemyView(e: MapEnemy) {
    const look = lookOf(e.id);
    const def = enemyDef(e);
    // 強敵は赤い輪、ボスは金の輪を足元に置く
    const ring = e.elite ? new THREE.Mesh(this.shared.ring, def.boss ? this.shared.bossMat : this.shared.eliteMat) : null;
    const model = this.makeEnemyModel(e.id, e.elite && !def.boss);
    let body: THREE.Object3D;
    if (model) body = model.root;
    else {
      const mesh = new THREE.Mesh(this.billboard, this.litSpriteMaterial(look.sprite, look.recolor ?? {}));
      mesh.receiveShadow = true; // 壁の影に入れば暗くなる
      body = mesh;
    }
    if (ring) ring.receiveShadow = true;
    const top = model?.height ?? 1;
    // 盾持ちの敵は、向いている正面に盾の板を持つ
    const shield = behaviorsOf(def).includes('shield') ? new THREE.Mesh(this.shared.shieldPlate, this.shared.shieldMat) : null;
    // 炎・光・闇・氷の敵は、自分で光る（足元に光が広がる。強敵・ボスは大きい）
    const glow = this.makeGlow(def.element);
    const view = { id: e.id, body, model, mark: new THREE.Sprite(), hp: new THREE.Sprite(), ring, shield, glow, glowSize: glow ? this.glowSizeOf(def.element, e.elite || def.boss === true) : 0, glowFlicker: glow ? GLOW_FX.flicker[def.element as keyof typeof GLOW_FX.flicker] : 0, top, facing: 'down' as Dir };
    view.body.visible = view.mark.visible = view.hp.visible = false;
    if (view.ring) view.ring.visible = false;
    if (view.shield) view.shield.visible = false;
    if (view.glow) {
      view.glow.visible = false;
      this.scene.add(view.glow);
    }
    this.scene.add(view.body, view.mark, view.hp);
    if (ring) this.scene.add(ring);
    if (shield) this.scene.add(shield);
    this.enemies.set(e.uid, view);
    // 描き方（シェーダー）の準備を、見えるようになる前に済ませる（初めて画面に出たとき、一瞬止まらないように）
    this.compile(view.body);
    return view;
  }

  /**
   * 階に入ったとき、その階の敵の模型を、見えるようになる前に組み立てておく（近い敵から）。
   * 1体の組み立てに数ミリ秒〜数十ミリ秒かかるので、1コマに1体ずつ（prebuildEnemy）
   */
  private queueEnemyModels(state: ExploreState) {
    const p = state.player;
    this.prebuild = state.enemies
      .filter((e) => !this.enemies.has(e.uid))
      .sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.y - p.y) - Math.hypot(b.pos.x - p.x, b.pos.y - p.y));
  }

  /** 組み立て待ちの敵を、1コマに1体だけ組み立てる（その間に倒された・階を移った敵は飛ばす） */
  private prebuildEnemy() {
    const state = this.shownState;
    if (!state) return;
    while (this.prebuild.length > 0) {
      const e = this.prebuild.shift()!;
      if (this.enemies.has(e.uid) || !state.enemies.some((x) => x.uid === e.uid)) continue;
      this.createEnemyView(e);
      return;
    }
  }

  /**
   * 描き方（シェーダー）を、見えるようになる前に作っておく（初めて画面に出たとき、一瞬止まらないように）。
   * 仕上げを使うときは、仕上げ用の画面に描くので、その向きで作る（描き方は、描く先の色の扱いで変わる）。
   * 待たずに進める環境では作り終わるのを待たない。失敗しても、初めて描くときに作られるだけ
   */
  private compile(object: THREE.Object3D) {
    const previous = this.renderer.getRenderTarget();
    try {
      if (this.post) this.renderer.setRenderTarget(this.post.target);
      void this.renderer.compileAsync(object, this.camera, this.scene).catch(() => undefined);
    } catch {
      // 準備に失敗しても遊べる
    } finally {
      this.renderer.setRenderTarget(previous);
    }
  }

  /** 凍った敵に氷の殻をかぶせ、燃えている敵から火の粉を出す */
  private updateFoeStatus(e: ExploreState['enemies'][number], at: { x: number; y: number }, dt: number) {
    let shell = this.iceShells.get(e.uid);
    if (e.frozen) {
      if (!shell) {
        shell = new THREE.Mesh(this.shared.iceShell, this.shared.iceShellMat);
        shell.renderOrder = 13;
        this.scene.add(shell);
        this.iceShells.set(e.uid, shell);
      }
      shell.position.set(at.x, FOE_STATUS_FX.shell.y, at.y);
    } else if (shell) {
      this.scene.remove(shell);
      this.iceShells.delete(e.uid);
    }
    if (e.burn && !this.reduceMotion && Math.random() < dt * FOE_STATUS_FX.flame.perSecond) {
      const f = FOE_STATUS_FX.flame;
      this.emitBits(new THREE.Vector3(at.x, f.y, at.y), { pieces: 1, speed: f.speed, up: f.up, gravity: f.gravity, size: f.size, color: f.color[Math.floor(Math.random() * f.color.length)]!, ms: f.ms, additive: true });
    }
  }

  /** 見えなくなった・倒れた・解けた敵の氷の殻を外す */
  private pruneIceShells(enemies: ExploreState['enemies']) {
    for (const [uid, shell] of [...this.iceShells]) {
      if (enemies.some((x) => x.uid === uid && x.frozen && this.enemies.get(uid)?.body.visible)) continue;
      this.scene.remove(shell);
      this.iceShells.delete(uid);
    }
  }

  /** 状態異常・コンボが決まった瞬間の、破片と火花 */
  private foeBurst(at: Pos, kind: 'burn' | 'freeze' | 'smash' | 'sear' | 'arcane') {
    if (this.reduceMotion) return;
    this.emitBits(new THREE.Vector3(at.x, 0.5, at.y), { ...FOE_STATUS_FX.burst[kind], additive: kind === 'burn' || kind === 'sear' || kind === 'arcane' });
  }

  private removeEnemyView(uid: number) {
    const view = this.enemies.get(uid);
    if (!view) return;
    this.scene.remove(view.body, view.mark, view.hp);
    if (view.ring) this.scene.remove(view.ring);
    if (view.shield) this.scene.remove(view.shield);
    if (view.glow) this.scene.remove(view.glow);
    view.model?.dispose();
    this.enemies.delete(uid);
    const shell = this.iceShells.get(uid);
    if (shell) this.scene.remove(shell);
    this.iceShells.delete(uid);
  }

  /** 立体の模型で描く敵なら、模型を作る（模型のない敵は null で、ドット絵の板で描く） */
  private makeEnemyModel(id: EnemyId, elite: boolean): EnemyModel | null {
    if (!isCreature(id)) return null;
    return new Creature(id, (m, name) => applyFog(m, this.fog, 'darken', name), elite);
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

  /** 部屋の床のマス（マップごとに1度だけ数える） */
  private roomTilesOf(map: FloorMap): Set<number> {
    if (this.roomTiles.map !== map) {
      const tiles = new Set<number>();
      for (const room of map.rooms) {
        for (let y = room.y; y < room.y + room.height; y++) for (let x = room.x; x < room.x + room.width; x++) tiles.add(y * map.width + x);
      }
      this.roomTiles = { map, tiles };
    }
    return this.roomTiles.tiles;
  }

  /** ふちのぼけた、少しいびつなしみの絵（水たまり・こけの濃さに使う。白いところほど濃い） */
  private blotTexture(): THREE.Texture {
    const tex = this.texture('blot', 64, 64, (ctx) => {
      // 黒の上に白いぼかしを重ねる（濃さは明るさで読むので、透明ではなく黒にしておく）
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 64, 64);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const cx = 32 + Math.cos(a) * 9 * tileRandom(i, 1, 2);
        const cy = 32 + Math.sin(a) * 9 * tileRandom(i, 3, 4);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 20);
        g.addColorStop(0, 'rgba(110,110,110,1)');
        g.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 64, 64);
      }
    });
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    return tex;
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

/** 武器・防具の段階（1〜10。武器・防具でなければ1）。見た目の豪華さが段階で変わる */
export function gearTierOf(item: ItemId | null): number {
  return (item && gearOf(item)?.tier) || 1;
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

/** マスの位置と番号 n で決まる、0〜1 の乱数（小石の置き方。同じマスなら、いつも同じ） */
function tileRandom(x: number, z: number, n: number): number {
  let h = Math.imul(x * 374761393 + z * 668265263 + n * 2246822519, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * 重い見た目（地面をはう霧・画面の仕上げなど）を使うか。?<名前>=off で切り、?<名前>=on で必ず使う。
 * どちらもなければ、処理の弱い端末（コアが4つ未満）では使わない
 */
function startLevel(): number {
  const q = Number(new URLSearchParams(location.search).get('quality'));
  if (new URLSearchParams(location.search).get('quality') !== null && Number.isInteger(q)) return Math.min(Math.max(q, 0), QUALITY.levels.length - 1);
  return (navigator.hardwareConcurrency ?? 4) >= QUALITY.fastStartCores ? 0 : 1;
}

/** ある段の効果。端末の細かさ・弱い端末で使わない効果（rich）を反映する */
function levelOf(level: number) {
  const l = QUALITY.levels[level]!;
  return { ratio: Math.min(window.devicePixelRatio, l.ratio), mist: l.mist && rich('mist'), particles: l.particles, post: l.post && rich('post'), shadow: l.shadow };
}

function rich(name: string): boolean {
  const v = new URLSearchParams(location.search).get(name);
  if (v === 'off') return false;
  if (v === 'on') return true;
  return (navigator.hardwareConcurrency ?? 4) >= 4;
}
