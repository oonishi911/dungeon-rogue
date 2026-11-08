// 探索画面の3D表示（Three.js）。斜め上から見下ろすカメラで、主人公を滑らかに追う。
// 2D表示（exploreRender.ts）と同じ Frame を受け取って描くので、操作やゲームのルールは共通。
//
// - 床と壁は、同じ形をまとめて描く InstancedMesh で描く。主人公の周りの画面に映る範囲だけを描くので、
//   マップがどれだけ広くても描く量は変わらない
// - 床と壁には、ダンジョン特性ごとのテクスチャ（public/textures/{特性}.png）を貼る。読み込むまでは色で描く
// - 霧：まだ見ていないマスは描かない。一度見たマスは暗く、今見えているマスは明るく描く
// - 主人公は立体の模型（hero3d.ts）。敵と宝箱は、今のドット絵を常にカメラを向く板（スプライト）として立てる

import * as THREE from 'three';
import { ITEMS } from '../game/data';
import { enemyDef, isAdjacent } from '../game/enemies';
import { dirBetween, EXPLORE_CONFIG, upStairs, type Dir, type ExploreState } from '../game/explore';
import type { Pos } from '../game/map';
import type { EnemyId, ItemId, TraitId, WeaponType } from '../game/types';
import { drawSprite } from '../sprites/canvas';
import type { SpriteId } from '../sprites/data';
import { cloakOf, lookOf } from '../sprites/looks';
import { floorVariant } from './autotile';
import { ENEMY_MARK, lerp, type Frame } from './exploreRender';
import { Hero3D } from './hero3d';
import { Stairs3D } from './stairs3d';

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
// 戦闘中は、主人公を中心に画面を寄せる。戦闘中とは、追ってきた敵が主人公の隣（上下左右）にいるか、攻撃が起きてから
// holdMs 以内のこと（敵を倒した直後や、敵が1歩離れてまた来たときに、寄ったり引いたりをくり返さないように）。
// zoom は寄せたときの倍率。inSec・outSec は寄せる・戻すときのなめらかさで、その3倍ほどの時間でほぼ着く（寄せるのは約0.4秒、戻すのは約0.75秒）
const COMBAT_ZOOM = { zoom: 1.35, inSec: 0.12, outSec: 0.25, holdMs: 900 } as const;
// ダメージの数字：受けた側の頭の上に小さく出て、なめらかに大きくなりながら少し浮かび、透けて消える
const DAMAGE_POP = {
  ms: 250, // 出てから消えるまで
  from: 0.6, // 出たときの大きさ（マス）
  to: 1.3, // 消えるときの大きさ（マス）
  height: 1.05, // 出る高さ（マス）
  rise: 0.35, // 消えるまでに浮かぶ高さ（マス）
  colors: { dealt: '#ece5d3', taken: '#e5624f' }, // 与えた：明るい生成り / 受けた：赤
} as const;
const REMEMBERED = 0.3; // 一度見たが今は見えていないマスの明るさ
// 見える範囲の明るさ。主人公のそばは1で、視界の端へ向かってなめらかに edge まで暗くする。
// マスの明るさは、見え始め・見えなくなるときに fade の速さ（1秒あたり）で少しずつ変える。
// 明るさはピクセルごとに決める（霧の地図 → FogState と applyFog）ので、マスの形の段は出ない
const SIGHT_LIGHT = { edge: 0.5, fade: 9 };
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
 * テクスチャの画像（public/textures/{特性}/ の中）。なめらかな質感の絵。詳しくは docs/textures.md。
 * 床も壁も、1枚の絵を何マスにもまたがって貼る（床と壁の上面は TEXTURE_SPAN×TEXTURE_SPAN マス、壁の側面は横 TEXTURE_SPAN マス×高さ1）。
 * マスごとに絵のどこを使うかはダンジョンの中の位置で決めるので、隣り合うマスの模様がつながり、マスの境目が見えない
 */
export const TEXTURE_FILES = {
  floor: 'floor.png',
  wallTop: 'wall-top.png',
  wallSide: 'wall-side.png',
} as const;
// たいまつの光と影。環境光と上からの光を弱くして、たいまつの光が見える範囲を決めるようにする。
// 影の地図（シャドウマップ）は6方向から描くので重い。たいまつが動いたときと、壁が入れ替わったときだけ描き直す
const TORCH = {
  color: 0xffd9a0, // 暖かいオレンジ色の炎
  // 特性ごとに光の色を変えるときの色。暖かい光は氷の青を打ち消して黄色っぽい灰色に見せてしまうので、氷は青白い光にする
  colorByTrait: { ice: 0xd6ecff } as Partial<Record<TraitId, number>>,
  intensity: 10,
  distance: 9, // 光が届く距離（マス）。視界の半径6より少し遠くまで
  decay: 1,
  height: 0.85, // 手に持った高さ（壁の上面1より低い）
  forward: 0.3, // 主人公より少し手前（カメラ側）に掲げる。主人公の体の中に光があると、体が照らされず暗くなるため
  shadowMapSize: 512,
};
const AMBIENT = 0.3; // 全体を均等に照らす弱い光。光の届かない場所や、一度見ただけのマスがかろうじて見える明るさ
const SUN = 0.25; // 上からの弱い光。壁の側面に陰をつける
const MAX_ANISOTROPY = 8; // 斜めから見た床がぼけないようにする強さの上限（スマホで重くなりすぎないように）
// 宝箱の大きさ（マス）。ふたは奥行きを直径とするかまぼこ形で、本体の上に載る（いちばん上は高さ + 奥行き/2）
const CHEST = { width: 0.56, height: 0.3, depth: 0.38 };
// 開けた宝箱：ふたを奥の縁（蝶番）を軸に後ろへ倒す角度（ラジアン）と、箱の口に見える中の暗さ
const OPENED_CHEST = { lidAngle: 1.75, inside: 0x1c130c, lidInside: 0x3e2a1a };
/**
 * 写真から作った敵の絵（public/textures/enemies/、scripts/build-enemy-textures.py で作る）。ない敵はドット絵で描く。
 * height は画面での高さ（マス）、aspect は絵の横:縦、footX は足元（マスの中心に置く位置）が絵の左から何割のところか
 */
const ENEMY_PHOTOS: Partial<Record<EnemyId, { file: string; height: number; aspect: number; footX: number }>> = {
  // 無属性のダンジョン。ボスは少し大きく、ネズミは低く描く
  goblin: { file: 'goblin.png', height: 1.0, aspect: 1.445, footX: 0.61 }, // 棍棒を左に構えている
  giant_rat: { file: 'giant_rat.png', height: 0.8, aspect: 1.081, footX: 0.45 },
  stone_golem: { file: 'stone_golem.png', height: 1.15, aspect: 0.977, footX: 0.47 },
  ogre_chief: { file: 'ogre_chief.png', height: 1.3, aspect: 1.396, footX: 0.65 }, // 金棒を左に構えている
};
const TEXTURE_SPAN = 4; // 床と壁の絵1枚が何マス分にまたがるか（scripts/build-textures.ts・build-photo-textures.py と合わせる）
const FLOOR_KINDS = 4; // テクスチャがないとき、床を何通りの明るさで描き分けるか

interface Atlas {
  floor: THREE.Texture;
  top: THREE.Texture;
  side: THREE.Texture;
}

/** テクスチャを読み込む前（または読み込めなかったとき）の、ダンジョン特性ごとの床と壁の色 */
// 床と壁のツヤ（フォンシェーディングの照り返し）。たいまつの光が、主人公のすぐ手前の床に映り込む。
// 氷は強く（凍った床が濡れたように光る）、光は中くらい（磨いた石）、炎は弱く（照った黒い岩）。ほかの特性はツヤなし
const TRAIT_GLOSS: Partial<Record<TraitId, { shininess: number; specular: number }>> = {
  ice: { shininess: 90, specular: 0x5f7180 },
  light: { shininess: 45, specular: 0x403c34 },
  fire: { shininess: 22, specular: 0x2e2220 },
};
const NO_GLOSS = { shininess: 30, specular: 0x000000 } as const;

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
  // たいまつ：主人公の手元の高さの光。壁の上面より低いので、壁にさえぎられて影ができる（曲がり角の先や、
  // 入口から部屋の奥は暗いまま）。見える範囲の明るさは、ほぼこの光で決まる
  private readonly torch = new THREE.PointLight(TORCH.color, TORCH.intensity, TORCH.distance, TORCH.decay);
  private torchAt = new THREE.Vector3(Number.NaN, 0, 0); // 影を最後に描いたときの、たいまつの位置
  private readonly shadows = new URLSearchParams(location.search).get('shadow') !== 'off'; // ?shadow=off で影を切って比べられる
  private readonly raycaster = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private shownState: ExploreState | null = null;
  private readonly floors: THREE.InstancedMesh[]; // 床の模様ごとに1つ
  private readonly walls: THREE.InstancedMesh;
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
  private readonly reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private pulse: { kind: HitPulse; start: number } | null = null;
  private combatZoom = 1; // 戦闘中に寄せている倍率（なめらかに変わる）
  private lastCombatAt = -Infinity; // 最後に戦闘中だった時刻
  private readonly damagePops: { sprite: THREE.Sprite; start: number }[] = [];
  // 霧：描いている床と壁の1つ1つ（どの入れ物の何番目か・どのマスか・元の色）と、マスごとの今の明るさ
  // 霧：マスごとの「見えている」「一度見た」を1マス1ドットの小さな画像にして、描くときにピクセルごとになめらかに読む
  private readonly fog = createFog();
  private readonly enemies = new Map<number, { id: EnemyId; body: THREE.Mesh; mark: THREE.Sprite; hp: THREE.Sprite; ring: THREE.Mesh | null; top: number }>();
  // 写真から作った敵の絵（読み込めたものだけ）。板の形と素材をまとめて持つ
  private readonly photos = new Map<EnemyId, { geometry: THREE.PlaneGeometry; material: THREE.MeshLambertMaterial; top: number }>();
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    // 壁は面ごとに素材を分ける。箱の面の順番は +x, -x, +y（上）, -y（下）, +z, -z。
    // 敵・宝箱・階段の手前に壁があっても、壁は透かさずにそのまま描く
    this.wallMaterials = [
      {
        top: worldMapped(new THREE.MeshPhongMaterial({ vertexColors: true, ...NO_GLOSS }), 'top', this.fog),
        side: worldMapped(new THREE.MeshPhongMaterial({ vertexColors: true, ...NO_GLOSS }), 'side', this.fog),
      },
    ];
    const wallGeo = shadedBox(WALL_HEIGHT);
    const { top: wallTop, side: wallSide } = this.wallMaterials[0]!;
    this.walls = new THREE.InstancedMesh(wallGeo, [wallSide, wallSide, wallTop, wallSide, wallSide, wallSide], DRAW_CAPACITY);
    // 壁は光をさえぎって影を落とし、床と壁は影を受ける
    this.walls.castShadow = true;
    this.walls.receiveShadow = true;
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
    this.loadEnemyPhotos();
    for (const mesh of [...this.floors, this.walls, this.wallShadows]) {
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
      this.hero.setWeapon(weaponOf(s.stats.weapon)); // 装備した武器を左手に持つ
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
    this.fog.update(p, dt, this.reduceMotion);
    this.updateDamagePops(now);
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
    this.camera.position.set(p.x, CAMERA.height, p.y + CAMERA.back);
    this.camera.lookAt(p.x, 0, p.y);
    for (const e of s.enemies) {
      const view = this.enemies.get(e.uid);
      if (!view) continue;
      const at = lerp(frame.from.enemies.get(e.uid) ?? e.pos, e.pos, frame.progress);
      view.body.position.set(at.x, 0.5, at.y);
      view.body.quaternion.copy(this.camera.quaternion); // カメラの方を向ける
      view.mark.position.set(at.x, view.top + 0.15, at.y);
      view.hp.position.set(at.x, 0.06, at.y);
      view.ring?.position.set(at.x, 0.02, at.y);
    }
    this.updateWalkTarget(frame.walkTarget);
    this.updateWalkPath(frame.walkPath);
    this.renderer.render(this.scene, this.camera);
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
    this.floors[0]!.geometry.dispose(); // 床の形はすべての入れ物で共通
    this.walls.geometry.dispose();
    this.wallShadows.geometry.dispose();
    this.pathDots.geometry.dispose();
    (this.pathDots.material as THREE.Material).dispose();
    this.pathDots.dispose();
    this.hero.dispose();
    this.stairs.dispose();
    for (const { sprite } of this.damagePops) {
      sprite.material.map?.dispose();
      sprite.material.dispose();
    }
    for (const mesh of [...this.floors, this.walls, this.wallShadows]) {
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
    for (const { geometry, material } of this.photos.values()) {
      geometry.dispose();
      material.map?.dispose();
      material.dispose();
    }
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
    let walls = 0;
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
          m.makeTranslation(x, WALL_HEIGHT / 2, z);
          this.walls.setMatrixAt(walls, m);
          this.walls.setColorAt(walls++, wallBase);
        } else if (map.stairs && map.stairs.x === x && map.stairs.y === z) {
          // 下り階段のマスは床に穴が開いているので、床を敷かない（穴と段は updateProps で描く）
        } else {
          // テクスチャがないときは、マスの位置で明るさを少し変えて描き分ける（2D表示と同じ決め方）
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
      [this.walls, walls] as const,
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

  /**
   * 写真から作った敵の絵を読み込む。読み込めた敵は、次に描くときからドット絵の代わりに使う
   * （読み込む前に出ていた敵も作り直す）。読み込めなかった敵はドット絵のまま
   */
  private loadEnemyPhotos() {
    const loader = new THREE.TextureLoader();
    const dir = `${import.meta.env.BASE_URL}textures/enemies/`;
    for (const [id, photo] of Object.entries(ENEMY_PHOTOS) as [EnemyId, NonNullable<(typeof ENEMY_PHOTOS)[EnemyId]>][]) {
      loader
        .loadAsync(dir + photo.file)
        .then((map) => {
          map.colorSpace = THREE.SRGBColorSpace;
          map.anisotropy = Math.min(MAX_ANISOTROPY, this.renderer.capabilities.getMaxAnisotropy());
          // 写真の縁と、足元へ向けて透明になっていくところを、なめらかに重ねて描く
          const material = applyFog(
            new THREE.MeshLambertMaterial({ map, transparent: true, alphaTest: 0.04, side: THREE.DoubleSide }),
            this.fog,
          );
          const width = photo.height * photo.aspect;
          // 足元（絵の下の端の footX のところ）が、ドット絵の板と同じくマスの中心の床の高さに来るようにずらす
          const geometry = litBillboard(width, photo.height).translate((0.5 - photo.footX) * width, photo.height / 2 - 0.5, 0);
          this.photos.set(id, { geometry, material, top: photo.height });
          for (const [uid, view] of this.enemies) {
            if (view.id !== id) continue;
            this.scene.remove(view.body, view.mark, view.hp);
            if (view.ring) this.scene.remove(view.ring);
            this.enemies.delete(uid);
          }
          this.shownState = null; // 次のフレームで描き直す
        })
        .catch(() => undefined);
    }
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

  /** 今見えているマスにいる敵だけを表示する */
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
        const photo = this.photos.get(e.id);
        const body = photo
          ? new THREE.Mesh(photo.geometry, photo.material)
          : new THREE.Mesh(this.billboard, this.litSpriteMaterial(look.sprite, look.recolor ?? {}));
        body.receiveShadow = true; // 壁の影に入れば暗くなる
        if (ring) ring.receiveShadow = true;
        view = { id: e.id, body, mark: new THREE.Sprite(), hp: new THREE.Sprite(), ring, top: photo?.top ?? 1 };
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

/**
 * 敵の絵を立てる板（ふつうは1×1、中心が原点）。板はカメラの方へ向けて使うが、そのままだと面の向きがカメラを向くので、
 * 主人公とカメラのあいだにいる敵は、たいまつの光を背中から受けて真っ暗になる。
 * そこで面の向き（法線）を、カメラの方へ向けたときにちょうど真上になるようにしておき、足元の床と同じ当たり方にする
 */
function litBillboard(width = 1, height = 1): THREE.PlaneGeometry {
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
function worldMapped<T extends THREE.MeshLambertMaterial | THREE.MeshPhongMaterial>(material: T, face: 'floor' | 'top' | 'side', fog: Fog): T {
  const defines: Record<string, string> = { TEXTURE_SPAN: TEXTURE_SPAN.toFixed(1), WALL_HEIGHT_F: WALL_HEIGHT.toFixed(1) };
  defines[`MAPPED_${face.toUpperCase()}`] = '';
  material.defines = { ...material.defines, ...defines };
  return applyFog<T>(material, fog, 'darken', `world-mapped-${face}`);
}

// ===== 霧（ピクセル単位） =====

/**
 * 霧の地図と、描くときに使う値。地図は1マス1ドットで、R が「今見えている」、G が「一度見た」の度合い（0〜255）。
 * 描くときはこの地図をなめらかに引き伸ばして読むので、見えている・一度見た・まだ見ていない場所の境目が、
 * マスの形ではなく1マスほどのなだらかなグラデーションになる
 */
interface Fog {
  readonly uniforms: {
    fogMap: { value: THREE.DataTexture };
    fogSize: { value: THREE.Vector2 };
    fogPlayer: { value: THREE.Vector2 };
  };
  /** 状態が変わったときに、目標の見え方を入れる（階が変わったら地図を作り直し、今の見え方にすぐ合わせる） */
  setTargets(state: ExploreState, visible: Set<number>): void;
  /** 毎フレーム：主人公の位置（動いている途中）を伝え、見え方を目標へ少しずつ近づける */
  update(player: Pos, dt: number, reduceMotion: boolean): void;
  dispose(): void;
}

function createFog(): Fog {
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
  };
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
    update(player, dt, reduceMotion) {
      uniforms.fogPlayer.value.set(player.x, player.y);
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

const FOG_BACKGROUND = new THREE.Color(BACKGROUND); // 画面の色空間（sRGB）のまま、シェーダで背景と混ぜる

/**
 * 素材に霧をかける。ピクセルごとに、霧の地図から「今見えている」「一度見た」の度合いを読み、
 * - 見えている場所は、主人公から離れるほどなめらかに暗く（端で SIGHT_LIGHT.edge）
 * - 一度見ただけの場所は REMEMBERED の明るさ
 * - まだ見ていない場所へ向かっては、背景の色に溶け込ませる（mode が 'fade-alpha' なら、色ではなく濃さを消す）
 * worldMapped の素材では、テクスチャの貼り方の変更（MAPPED_* の定義）も一緒に行う
 */
function applyFog<T extends THREE.Material>(material: T, fog: Fog, mode: 'darken' | 'fade-alpha' = 'darken', key = ''): T {
  const bg = FOG_BACKGROUND.clone().convertLinearToSRGB();
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, fog.uniforms);
    shader.vertexShader =
      'varying vec3 vFogWorld;\n' +
      shader.vertexShader.replace(
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
          #endif
        }`,
      );
    shader.fragmentShader =
      `varying vec3 vFogWorld;
      uniform sampler2D fogMap;
      uniform vec2 fogSize;
      uniform vec2 fogPlayer;
      ` +
      shader.fragmentShader
        .replace(
          '#include <opaque_fragment>',
          `// マスの中心が整数の座標なので、半マスずらして霧の地図のドットの中心に合わせる
          vec2 fogTexel = texture2D( fogMap, ( vFogWorld.xz + 0.5 ) / fogSize ).rg;
          float fogD = clamp( length( vFogWorld.xz - fogPlayer ) / ${(EXPLORE_CONFIG.sightRadius + 0.5).toFixed(2)}, 0.0, 1.0 );
          float fogNear = 1.0 - ${(1 - SIGHT_LIGHT.edge).toFixed(2)} * fogD * fogD * ( 3.0 - 2.0 * fogD );
          float fogSeen = smoothstep( 0.5, 1.0, fogTexel.g ); // マスの境目（0.5）で、ちょうど背景に溶け込む
          ${mode === 'darken' ? `outgoingLight *= mix( ${REMEMBERED.toFixed(2)}, fogNear, smoothstep( 0.0, 1.0, fogTexel.r ) );` : ''}
          #include <opaque_fragment>`,
        )
        .replace(
          '#include <colorspace_fragment>',
          `#include <colorspace_fragment>
          ${
            mode === 'darken'
              ? `gl_FragColor.rgb = mix( vec3( ${bg.r.toFixed(4)}, ${bg.g.toFixed(4)}, ${bg.b.toFixed(4)} ), gl_FragColor.rgb, fogSeen );`
              : 'gl_FragColor.a *= fogSeen;'
          }`,
        );
  };
  material.customProgramCacheKey = () => `fog-${mode}-${key}`;
  return material;
}

/** 装備している武器の種類（武器でなければ null） */
function weaponOf(item: ItemId | null): WeaponType | null {
  if (!item) return null;
  const effect = ITEMS[item].effect;
  return effect.kind === 'weapon' ? effect.weapon : null;
}
