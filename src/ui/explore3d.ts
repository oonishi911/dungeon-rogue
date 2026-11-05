// 探索画面の3D表示（Three.js）。斜め上から見下ろすカメラで、主人公を滑らかに追う。
// 2D表示（exploreRender.ts）と同じ Frame を受け取って描くので、操作やゲームのルールは共通。
//
// - 床と壁は、同じ形をまとめて描く InstancedMesh で描く。主人公の周りの画面に映る範囲だけを描くので、
//   マップがどれだけ広くても描く量は変わらない
// - 床と壁には、ダンジョン特性ごとのテクスチャ（public/textures/{特性}.png）を貼る。読み込むまでは色で描く
// - 霧：まだ見ていないマスは描かない。一度見たマスは暗く、今見えているマスは明るく描く
// - 主人公と敵は、今のドット絵を常にカメラを向く板（スプライト）として立てる

import * as THREE from 'three';
import { enemyDef } from '../game/enemies';
import type { ExploreState } from '../game/explore';
import type { Pos } from '../game/map';
import type { TraitId } from '../game/types';
import { drawSprite } from '../sprites/canvas';
import { CLOAKS, type SpriteId } from '../sprites/data';
import { cloakOf, ENEMY_LOOKS } from '../sprites/looks';
import { floorVariant } from './autotile';
import { ENEMY_MARK, lerp, type Frame } from './exploreRender';

// マスの大きさを1とした壁の高さ。高くすると通路が深く見える。
// 今のカメラの角度（約63度）では、高さ1までなら、すぐ手前の壁は隣のマスに立つキャラクターの足元に届く程度で、体は隠れない
const WALL_HEIGHT = 1;
const CAMERA = { fov: 40, height: 15, back: 7.5 }; // 主人公の真上15・手前7.5から見下ろす（約63度。横長の画面で横に17マスほど映る）
// スマホの縦長の画面では、縦の視野を広げて、横にこのマス数は映るようにする（広げすぎると手前がゆがむので上限を設ける）
const PORTRAIT = { minAcross: 11, maxFov: 60 };
const REMEMBERED = 0.3; // 一度見たが今は見えていないマスの明るさ
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
// 床と壁を描く範囲（主人公からのマス数）。画面に映る範囲（横長なら横17×縦12、縦長なら横11×縦30マスほど）より、
// 動いている途中の分だけ広くとる
const DRAW_RANGE = { x: 13, z: 17 };
const DRAW_CAPACITY = (DRAW_RANGE.x * 2 + 1) * (DRAW_RANGE.z * 2 + 1);

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
  private readonly player: THREE.Sprite;
  private readonly enemies = new Map<number, { body: THREE.Sprite; mark: THREE.Sprite; hp: THREE.Sprite; ring: THREE.Mesh | null }>();
  private readonly textures = new Map<string, THREE.Texture>();
  private readonly materials = new Map<string, THREE.SpriteMaterial>();
  // 階段・宝箱・目印は形も素材も決まっているので、最初に1回だけ作って使い回す
  private readonly shared = {
    hole: new THREE.PlaneGeometry(0.8, 0.8).rotateX(-Math.PI / 2),
    bars: [0, 1, 2].map((step) => new THREE.PlaneGeometry(0.7 - step * 0.15, 0.08).rotateX(-Math.PI / 2)),
    chest: new THREE.BoxGeometry(0.5, 0.32, 0.38),
    ring: new THREE.RingGeometry(0.4, 0.48, 24).rotateX(-Math.PI / 2),
    targetRing: new THREE.RingGeometry(0.32, 0.42, 24).rotateX(-Math.PI / 2),
    holeMat: new THREE.MeshBasicMaterial({ color: 0x05080a }),
    barMat: [1, REMEMBERED].map((k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(0xece5d3).multiplyScalar(k) })),
    chestMat: [1, REMEMBERED].map((k) => new THREE.MeshLambertMaterial({ color: new THREE.Color(0xe2c178).multiplyScalar(k) })),
    eliteMat: new THREE.MeshBasicMaterial({ color: 0xd9653b }),
    bossMat: new THREE.MeshBasicMaterial({ color: 0xb48d35 }),
    targetMat: new THREE.MeshBasicMaterial({ color: 0x9cc46a }),
  };
  private readonly target: THREE.Mesh;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.width, canvas.height, false);
    this.scene.background = new THREE.Color(BACKGROUND);

    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, canvas.width / canvas.height, 0.1, 100);
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

    this.player = new THREE.Sprite(this.spriteMaterial('hero', {}, true));
    this.player.renderOrder = 1; // 壁より手前に描く
    this.target = new THREE.Mesh(this.shared.targetRing, this.shared.targetMat);
    this.scene.add(this.player, this.target);
  }

  /**
   * 画面上の大きさ（CSSピクセル）に合わせて、描く解像度とカメラの縦横比を変える。
   * 縦長の画面では縦の視野を広げ、横に映るマスが少なくなりすぎないようにする
   */
  resize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    const distance = Math.hypot(CAMERA.height, CAMERA.back);
    const fovForWidth = THREE.MathUtils.radToDeg(2 * Math.atan(PORTRAIT.minAcross / 2 / distance / aspect));
    this.camera.aspect = aspect;
    this.camera.fov = Math.min(PORTRAIT.maxFov, Math.max(CAMERA.fov, fovForWidth));
    this.camera.updateProjectionMatrix();
  }

  /** 1フレーム描く。状態が変わったときだけ、霧や敵の作り直しをする */
  render(frame: Frame) {
    const s = frame.state;
    if (s !== this.shownState) {
      this.updateFog(frame);
      this.updateProps(frame);
      this.updateEnemies(frame);
      this.player.material = this.spriteMaterial('hero', CLOAKS[cloakOf(s.stats.armor)], true);
      this.shownState = s;
    }

    // 動きの途中の位置
    const p = lerp(frame.from.player, s.player, frame.progress);
    this.player.position.set(p.x, 0.5, p.y);
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
    this.renderer.render(this.scene, this.camera);
  }

  /** 画面上の位置から、床のマスを求める（タップ・クリックで歩く先） */
  pickTile(clientX: number, clientY: number): Pos | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.ground, new THREE.Vector3());
    return hit ? { x: Math.round(hit.x), y: Math.round(hit.z) } : null;
  }

  dispose() {
    this.floors[0]!.geometry.dispose(); // 床の形はすべての入れ物で共通
    this.walls.geometry.dispose(); // 半透明の壁と共通
    this.wallShadows.geometry.dispose();
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
        const light = frame.visible.has(i) ? 1 : REMEMBERED;
        if (map.tiles[i] === 'wall') {
          c.copy(wallBase).multiplyScalar(light);
          m.makeTranslation(x, WALL_HEIGHT / 2, z);
          if (faded.has(i)) {
            this.fadedWalls.setMatrixAt(fadedWalls, m);
            this.fadedWalls.setColorAt(fadedWalls++, c);
          } else {
            this.walls.setMatrixAt(walls, m);
            this.walls.setColorAt(walls++, c);
          }
        } else {
          // 床の模様はマスの位置で決める（2D表示と同じ決め方）。色だけで描くときは明るさを少し変える
          const k = floorVariant(x, z);
          const variety = atlas ? 1 : 0.9 + k * 0.05;
          this.floors[k]!.setMatrixAt(floorCounts[k]!, m.makeTranslation(x, 0, z));
          this.floors[k]!.setColorAt(floorCounts[k]!++, c.copy(floorBase).multiplyScalar(light * variety));
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
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
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
    for (const chest of chests) {
      if (!seen[chest.pos.y * map.width + chest.pos.x]) continue;
      const box = new THREE.Mesh(this.shared.chest, this.shared.chestMat[dim(chest.pos)]);
      box.position.set(chest.pos.x, 0.16, chest.pos.y);
      this.props.add(box);
    }
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
