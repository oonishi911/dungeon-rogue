// 探索画面の3D表示（Three.js）。斜め上から見下ろすカメラで、主人公を滑らかに追う。
// 2D表示（exploreRender.ts）と同じ Frame を受け取って描くので、操作やゲームのルールは共通。
//
// - 床と壁は、同じ形をまとめて描く InstancedMesh で描く。主人公の周りの画面に映る範囲だけを描くので、
//   マップがどれだけ広くても描く量は変わらない
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

const WALL_HEIGHT = 0.6; // マスの大きさを1とした壁の高さ。低めにして、手前の壁で主人公が隠れにくくする
const CAMERA = { fov: 40, height: 15, back: 7.5 }; // 主人公の真上15・手前7.5から見下ろす（約63度。横に17マスほど映る）
const REMEMBERED = 0.3; // 一度見たが今は見えていないマスの明るさ
const BACKGROUND = 0x0b1413;
// 床と壁を描く範囲（主人公からのマス数）。画面に映る横17×縦12マスほどより、動いている途中の分だけ広くとる
const DRAW_RANGE = { x: 13, z: 11 };
const DRAW_CAPACITY = (DRAW_RANGE.x * 2 + 1) * (DRAW_RANGE.z * 2 + 1);

/** ダンジョン特性ごとの床と壁の色。本番の素材ができたらテクスチャに置き換える */
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
  private readonly floors: THREE.InstancedMesh;
  private readonly walls: THREE.InstancedMesh;
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

    // 床と壁は、描く範囲のマス数ぶんの入れ物を最初に用意しておき、1歩ごとに中身を入れ替える
    this.floors = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      DRAW_CAPACITY,
    );
    this.walls = new THREE.InstancedMesh(
      shadedBox(WALL_HEIGHT),
      new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }),
      DRAW_CAPACITY,
    );
    // 中身を毎回入れ替えるので、最初の中身で計算された範囲で画面外と判定されないようにする
    this.floors.frustumCulled = false;
    this.walls.frustumCulled = false;
    this.scene.add(this.floors, this.walls);

    this.player = new THREE.Sprite(this.spriteMaterial('hero', {}, true));
    this.player.renderOrder = 1; // 壁より手前に描く
    this.target = new THREE.Mesh(this.shared.targetRing, this.shared.targetMat);
    this.scene.add(this.player, this.target);
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
    for (const mesh of [this.floors, this.walls]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
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
    const colors = TRAIT_COLORS[trait];
    const floorBase = new THREE.Color(colors.floor);
    const wallBase = new THREE.Color(colors.wall);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    let floors = 0;
    let walls = 0;
    for (let z = player.y - DRAW_RANGE.z; z <= player.y + DRAW_RANGE.z; z++) {
      for (let x = player.x - DRAW_RANGE.x; x <= player.x + DRAW_RANGE.x; x++) {
        if (x < 0 || z < 0 || x >= map.width || z >= map.height) continue;
        const i = z * map.width + x;
        if (!seen[i]) continue;
        const light = frame.visible.has(i) ? 1 : REMEMBERED;
        if (map.tiles[i] === 'wall') {
          this.walls.setMatrixAt(walls, m.makeTranslation(x, WALL_HEIGHT / 2, z));
          this.walls.setColorAt(walls++, c.copy(wallBase).multiplyScalar(light));
        } else {
          // 床は場所ごとに少しだけ明るさを変えて、単調さを減らす
          this.floors.setMatrixAt(floors, m.makeTranslation(x, 0, z));
          this.floors.setColorAt(floors++, c.copy(floorBase).multiplyScalar(light * (0.9 + floorVariant(x, z) * 0.05)));
        }
      }
    }
    for (const [mesh, count] of [
      [this.floors, floors],
      [this.walls, walls],
    ] as const) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
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
