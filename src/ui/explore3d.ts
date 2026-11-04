// 探索画面の3D描画（three.js）。
// 2D版（exploreRender.ts の drawView）と同じ Frame を受け取り、同じ状態を見下ろし視点の3Dで描く。
// ルールや視界の計算には触れず、描き方だけを差し替えている。
//
// - 床と壁は InstancedMesh で1階層ぶんをまとめて描く。床は特性ごとのタイル素材の4種類の模様を使い分ける
// - 主人公・敵・宝箱は、32×32のドット絵を常にカメラを向く板（ビルボード）として立てる
// - 霧：まだ見ていないマスは描かず、一度見たが今は見えていないマスは暗くする（2D版と同じ規則）

import * as THREE from 'three';
import { enemyDef, type MapEnemy } from '../game/enemies';
import type { ExploreState } from '../game/explore';
import type { Pos } from '../game/map';
import type { TraitId } from '../game/types';
import { drawSprite } from '../sprites/canvas';
import { CLOAKS, type SpriteId } from '../sprites/data';
import { cloakOf, ENEMY_LOOKS } from '../sprites/looks';
import { floorVariant, TILESET } from './autotile';
import { CELL, ENEMY_MARK, type Colors, type Frame } from './exploreRender';

const WALL_HEIGHT = 1.1;
const SEEN_DIM = 0.4; // 一度見たが今は見えていないマスの明るさ
// カメラは主人公の斜め上から見下ろす。この位置関係で、横におよそ13マスが映る
const CAMERA_OFFSET = new THREE.Vector3(0, 11, 7.5);
// ダンジョン特性ごとの松明の光の色
const TORCH_COLORS: Record<TraitId, number> = {
  fire: 0xffa060,
  ice: 0xa8dcf4,
  neutral: 0xf0e2c0,
  light: 0xfff0b0,
  dark: 0xb89ae0,
};

const lerp = (a: Pos, b: Pos, t: number): Pos => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** 画面上の地面の点から、マスの座標を求める。マスの中心が整数の座標にある */
export function worldToTile(x: number, z: number): Pos {
  return { x: Math.round(x), y: Math.round(z) };
}

/** 32×32のドット絵を描いた Canvas のテクスチャ。拡大してもぼけないようにする */
function pixelTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

/** タイル素材の一部を切り出したテクスチャ */
function cropTexture(img: HTMLImageElement, x: number, y: number): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(CELL, CELL);
  ctx.drawImage(img, x, y, CELL, CELL, 0, 0, CELL, CELL);
  return pixelTexture(c);
}

interface EnemyView {
  group: THREE.Group;
  body: THREE.Sprite;
  label: THREE.Sprite;
  labelCanvas: HTMLCanvasElement;
  labelKey: string;
}

export class ExploreRenderer3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 21 / 15, 0.1, 100);
  private readonly torch = new THREE.PointLight(0xffffff, 4, 11, 1.2);
  private readonly ambient = new THREE.AmbientLight(0xffffff, 0.5);
  private readonly raycaster = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly colors: Colors;

  // 階層ごとに作り直すもの
  private level = new THREE.Group();
  private levelKey: { map: unknown; textured: boolean } | null = null;
  private floorMeshes: { mesh: THREE.InstancedMesh; tiles: number[] }[] = [];
  private wallMesh: { mesh: THREE.InstancedMesh; tiles: number[] } | null = null;
  private stairs: THREE.Mesh | null = null;
  private fogKey: { state: ExploreState; visible: Set<number> } | null = null;

  // 状態に合わせて増減するもの
  private readonly hero: THREE.Sprite;
  private heroCloak = '';
  private readonly enemies = new Map<number, EnemyView>();
  private readonly chests = new Map<string, THREE.Sprite>();
  private readonly target: THREE.Mesh;
  private readonly spriteCache = new Map<string, THREE.CanvasTexture>();
  private readonly shadowGeo = new THREE.CircleGeometry(0.32, 20);
  private readonly shadowMat: THREE.MeshBasicMaterial;
  private chestTexture: THREE.Texture | null = null;
  private size = { w: 0, h: 0 };

  constructor(private readonly canvas: HTMLCanvasElement, colors: Colors) {
    this.colors = colors;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const fog = new THREE.Color(colors.fog);
    this.scene.background = fog;
    this.scene.fog = new THREE.Fog(fog, 15, 26);
    this.scene.add(this.ambient, this.torch, this.level);
    const sun = new THREE.DirectionalLight(0xffffff, 0.6);
    sun.position.set(-3, 10, 4);
    this.scene.add(sun);

    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });

    this.hero = this.makeBillboard();
    this.scene.add(this.hero.parent!);

    this.target = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.42, 4, 1, Math.PI / 4),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(colors.target), side: THREE.DoubleSide }),
    );
    this.target.rotation.x = -Math.PI / 2;
    this.target.position.y = 0.02;
    this.scene.add(this.target);
  }

  /** ドット絵を立てる板と、足元の影をひとまとめにして作る */
  private makeBillboard(): THREE.Sprite {
    const group = new THREE.Group();
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.5 }));
    sprite.center.set(0.5, 0); // 足元を基準にする
    sprite.position.y = 0.02;
    sprite.scale.set(1, 1, 1);
    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.015;
    group.add(shadow, sprite);
    return sprite;
  }

  private spriteTexture(id: SpriteId, recolor?: Record<string, string>): THREE.CanvasTexture {
    const key = `${id}:${JSON.stringify(recolor ?? {})}`;
    let tex = this.spriteCache.get(key);
    if (!tex) {
      const [c, ctx] = makeCanvas(CELL, CELL);
      drawSprite(ctx, id, 0, 0, CELL, recolor);
      tex = pixelTexture(c);
      this.spriteCache.set(key, tex);
    }
    return tex;
  }

  /** 階層が変わった（またはタイル素材が読み込まれた）ときに、床・壁・階段を作り直す */
  private buildLevel(state: ExploreState, tileset: HTMLImageElement | null) {
    this.scene.remove(this.level);
    this.level.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          (m as THREE.MeshLambertMaterial).map?.dispose();
          m.dispose();
        }
      }
    });
    this.level = new THREE.Group();
    this.scene.add(this.level);
    this.floorMeshes = [];
    this.fogKey = null;

    const { map } = state;
    const floorsByVariant: number[][] = TILESET.floors.map(() => []);
    const walls: number[] = [];
    const isFloor = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < map.width && y < map.height && map.tiles[y * map.width + x] === 'floor';
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const i = y * map.width + x;
        if (map.tiles[i] === 'floor') {
          floorsByVariant[tileset ? floorVariant(x, y) : 0]!.push(i);
          continue;
        }
        // 床に接していない壁は決して見えないので作らない
        let touches = false;
        for (let dy = -1; dy <= 1 && !touches; dy++) for (let dx = -1; dx <= 1; dx++) if (isFloor(x + dx, y + dy)) touches = true;
        if (touches) walls.push(i);
      }
    }

    const floorGeo = new THREE.PlaneGeometry(1, 1);
    floorGeo.rotateX(-Math.PI / 2);
    floorsByVariant.forEach((tiles, v) => {
      if (tiles.length === 0) return;
      const src = TILESET.floors[v]!;
      const mat = tileset
        ? new THREE.MeshLambertMaterial({ map: cropTexture(tileset, src.x, src.y) })
        : new THREE.MeshLambertMaterial({ color: new THREE.Color(this.colors.floor) });
      const mesh = new THREE.InstancedMesh(floorGeo, mat, tiles.length);
      this.level.add(mesh);
      this.floorMeshes.push({ mesh, tiles });
    });

    if (walls.length > 0) {
      const wallGeo = new THREE.BoxGeometry(1, WALL_HEIGHT, 1);
      wallGeo.translate(0, WALL_HEIGHT / 2, 0);
      // 壁の模様は、オートタイルのひな形の「中央」の部品（どの向きにもつながる部分）を使う
      const t = TILESET.wallTemplate;
      const mat = tileset
        ? new THREE.MeshLambertMaterial({ map: cropTexture(tileset, t.x + 16, t.y + 48) })
        : new THREE.MeshLambertMaterial({ color: new THREE.Color(this.colors.wall) });
      const mesh = new THREE.InstancedMesh(wallGeo, mat, walls.length);
      this.level.add(mesh);
      this.wallMesh = { mesh, tiles: walls };
    } else {
      this.wallMesh = null;
    }

    this.stairs = null;
    if (map.stairs) {
      const mat = tileset
        ? new THREE.MeshBasicMaterial({ map: cropTexture(tileset, TILESET.stairs.x, TILESET.stairs.y), transparent: true, alphaTest: 0.5 })
        : new THREE.MeshBasicMaterial({ color: new THREE.Color(this.colors.stairs) });
      const geo = new THREE.PlaneGeometry(tileset ? 1 : 0.6, tileset ? 1 : 0.6);
      geo.rotateX(-Math.PI / 2);
      this.stairs = new THREE.Mesh(geo, mat);
      this.stairs.position.set(map.stairs.x, 0.01, map.stairs.y);
      this.level.add(this.stairs);
    }

    this.chestTexture?.dispose();
    this.chestTexture = tileset ? cropTexture(tileset, TILESET.chest.x, TILESET.chest.y) : null;
    for (const s of this.chests.values()) this.scene.remove(s.parent!);
    this.chests.clear();

    this.torch.color.set(TORCH_COLORS[state.trait]);
    this.ambient.color.set(TORCH_COLORS[state.trait]);
    this.levelKey = { map: state.map, textured: tileset !== null };
  }

  /** 霧の反映：見ていないマスは大きさ0で隠し、見えていないマスは暗くする */
  private applyFog(state: ExploreState, visible: Set<number>) {
    const { map, seen } = state;
    const m = new THREE.Matrix4();
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    const bright = new THREE.Color(1, 1, 1);
    const dim = new THREE.Color(SEEN_DIM, SEEN_DIM, SEEN_DIM);
    const apply = ({ mesh, tiles }: { mesh: THREE.InstancedMesh; tiles: number[] }) => {
      tiles.forEach((i, k) => {
        if (!seen[i]) {
          mesh.setMatrixAt(k, hidden);
        } else {
          mesh.setMatrixAt(k, m.makeTranslation(i % map.width, 0, Math.floor(i / map.width)));
        }
        mesh.setColorAt(k, visible.has(i) ? bright : dim);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    this.floorMeshes.forEach(apply);
    if (this.wallMesh) apply(this.wallMesh);
    if (this.stairs && map.stairs) {
      const i = map.stairs.y * map.width + map.stairs.x;
      this.stairs.visible = seen[i]!;
      (this.stairs.material as THREE.MeshBasicMaterial).color.copy(visible.has(i) ? bright : dim);
    }
    this.fogKey = { state, visible };
  }

  private syncChests(state: ExploreState, visible: Set<number>) {
    const { map, seen } = state;
    const alive = new Set<string>();
    for (const c of state.chests) {
      const key = `${c.pos.x},${c.pos.y}`;
      alive.add(key);
      let s = this.chests.get(key);
      if (!s) {
        s = this.makeBillboard();
        const mat = s.material;
        if (this.chestTexture) mat.map = this.chestTexture;
        else mat.color.set(this.colors.treasure);
        s.scale.set(0.8, 0.8, 1);
        s.parent!.position.set(c.pos.x, 0, c.pos.y);
        this.scene.add(s.parent!);
        this.chests.set(key, s);
      }
      const i = c.pos.y * map.width + c.pos.x;
      s.parent!.visible = seen[i]!;
      s.material.color.setScalar(visible.has(i) ? 1 : SEEN_DIM);
    }
    for (const [key, s] of this.chests) {
      if (alive.has(key)) continue;
      this.scene.remove(s.parent!);
      this.chests.delete(key);
    }
  }

  /** 敵の頭上の表示（状態のマークと、減っていればHPの棒）。変わったときだけ描き直す */
  private drawLabel(view: EnemyView, enemy: MapEnemy) {
    const def = enemyDef(enemy);
    const key = `${enemy.mode}:${enemy.justNoticed ? 1 : 0}:${enemy.hp}`;
    if (view.labelKey === key) return;
    view.labelKey = key;
    const ctx = view.labelCanvas.getContext('2d')!;
    const { width: w, height: h } = view.labelCanvas;
    ctx.clearRect(0, 0, w, h);
    const big = enemy.justNoticed;
    ctx.font = `900 ${big ? 40 : 28}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = this.colors.fog;
    ctx.fillStyle = enemy.mode === 'wander' ? this.colors.calm : this.colors.notice;
    ctx.strokeText(ENEMY_MARK[enemy.mode].mark, w / 2, 22);
    ctx.fillText(ENEMY_MARK[enemy.mode].mark, w / 2, 22);
    if (enemy.hp < def.hp) {
      ctx.fillStyle = this.colors.fog;
      ctx.fillRect(14, h - 12, w - 28, 8);
      ctx.fillStyle = this.colors.hp;
      ctx.fillRect(16, h - 10, Math.max(2, Math.round((w - 32) * (enemy.hp / def.hp))), 4);
    }
    (view.label.material.map as THREE.Texture).needsUpdate = true;
  }

  private syncEnemies(frame: Frame) {
    const { state, visible } = frame;
    const { map } = state;
    const alive = new Set<number>();
    for (const e of state.enemies) {
      alive.add(e.uid);
      let view = this.enemies.get(e.uid);
      if (!view) {
        const body = this.makeBillboard();
        const look = ENEMY_LOOKS[e.id];
        body.material.map = this.spriteTexture(look.sprite, look.recolor);
        const def = enemyDef(e);
        const scale = def.boss ? 1.6 : e.elite ? 1.2 : 1;
        body.scale.set(scale, scale, 1);
        const group = body.parent as THREE.Group;
        if (e.elite) {
          // 強敵は赤い輪、ボスは金の輪を足元に敷く
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.4 * scale, 0.48 * scale, 32),
            new THREE.MeshBasicMaterial({ color: new THREE.Color(def.boss ? this.colors.boss : this.colors.elite), side: THREE.DoubleSide }),
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.y = 0.02;
          group.add(ring);
        }
        const [labelCanvas] = makeCanvas(64, 56);
        const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: pixelTexture(labelCanvas), transparent: true, depthTest: false }));
        label.center.set(0.5, 0);
        label.scale.set(0.7, 0.6, 1);
        label.position.y = scale + 0.05;
        label.renderOrder = 10;
        group.add(label);
        this.scene.add(group);
        view = { group, body, label, labelCanvas, labelKey: '' };
        this.enemies.set(e.uid, view);
      }
      // 今見えているマスにいる敵だけを描く
      view.group.visible = visible.has(e.pos.y * map.width + e.pos.x);
      const at = lerp(frame.from.enemies.get(e.uid) ?? e.pos, e.pos, frame.progress);
      view.group.position.set(at.x, 0, at.y);
      this.drawLabel(view, e);
    }
    for (const [uid, view] of this.enemies) {
      if (alive.has(uid)) continue;
      this.scene.remove(view.group);
      view.label.material.map?.dispose();
      view.label.material.dispose();
      view.body.material.dispose();
      this.enemies.delete(uid);
    }
  }

  private resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0 || (w === this.size.w && h === this.size.h)) return;
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(frame: Frame) {
    this.resize();
    const { state } = frame;
    const textured = frame.tileset !== null;
    if (!this.levelKey || this.levelKey.map !== state.map || this.levelKey.textured !== textured) {
      // 階が変わったら、前の階の敵の表示も片付ける
      if (this.levelKey?.map !== state.map) {
        for (const view of this.enemies.values()) this.scene.remove(view.group);
        this.enemies.clear();
      }
      this.buildLevel(state, frame.tileset);
    }
    if (!this.fogKey || this.fogKey.state !== state || this.fogKey.visible !== frame.visible) this.applyFog(state, frame.visible);
    this.syncChests(state, frame.visible);
    this.syncEnemies(frame);

    // 主人公のマントは防具の色。準備が当たったかが3Dでも見た目でわかる
    const cloak = cloakOf(state.stats.armor);
    if (cloak !== this.heroCloak) {
      this.heroCloak = cloak;
      this.hero.material.map = this.spriteTexture('hero', CLOAKS[cloak]);
      this.hero.material.needsUpdate = true;
    }
    const p = lerp(frame.from.player, state.player, frame.progress);
    this.hero.parent!.position.set(p.x, 0, p.y);

    this.target.visible = frame.walkTarget !== null;
    if (frame.walkTarget) this.target.position.set(frame.walkTarget.x, 0.02, frame.walkTarget.y);

    this.torch.position.set(p.x, 1.8, p.y + 0.3);
    this.camera.position.set(p.x + CAMERA_OFFSET.x, CAMERA_OFFSET.y, p.y + CAMERA_OFFSET.z);
    this.camera.lookAt(p.x, 0, p.y);
    this.renderer.render(this.scene, this.camera);
  }

  /** 画面上の位置（タップ・クリック）が指しているマス。地面に当たらなければ null */
  pickTile(clientX: number, clientY: number): Pos | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.ground, hit)) return null;
    return worldToTile(hit.x, hit.z);
  }

  dispose() {
    for (const tex of this.spriteCache.values()) tex.dispose();
    this.chestTexture?.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          (m as THREE.MeshBasicMaterial).map?.dispose();
          m.dispose();
        }
      }
    });
    this.renderer.dispose();
  }
}
