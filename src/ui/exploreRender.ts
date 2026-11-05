// 探索画面の Canvas への描画。
// 1歩ごとの状態の変化を、前の位置から新しい位置へ少しずつ動かして描くことで、滑らかにスクロールさせる。

import { enemyDef, type EnemyMode, type MapEnemy } from '../game/enemies';
import type { ExploreState } from '../game/explore';
import type { Pos } from '../game/map';
import { drawSprite } from '../sprites/canvas';
import { CLOAKS } from '../sprites/data';
import { cloakOf, ENEMY_LOOKS } from '../sprites/looks';
import { floorVariant, QUARTER, TILESET, wallPieces } from './autotile';

export const VIEW_W = 21; // 画面に映すマス数（主人公が中央に来るよう奇数）。画面の大きさに関係なく固定
export const VIEW_H = 15;
export const CELL = 32; // 1マスの大きさ（px）。あとで用意する画像の大きさに合わせる
export const MINI_CELL = 3;

/** 敵の頭上に出すマークと、文字で伝える状態 */
export const ENEMY_MARK: Record<EnemyMode, { mark: string; text: string }> = {
  wander: { mark: '…', text: '気付いていない（不意打ちできる）' },
  chase: { mark: '!', text: '追ってくる' },
  search: { mark: '?', text: '見失って探している' },
};

/** 1歩の動きの始まりの位置。ここから今の状態の位置へ動かして描く */
export interface Motion {
  player: Pos;
  enemies: Map<number, Pos>;
}

export interface Frame {
  state: ExploreState;
  visible: Set<number>;
  from: Motion;
  progress: number; // 0〜1。1なら動き終わり
  walkTarget: Pos | null; // タップ・クリックで向かっている場所
  tileset: HTMLImageElement | null; // ダンジョン特性のタイル素材。読み込み前は null（色の四角で描く）
}

export function motionOf(state: ExploreState): Motion {
  return { player: state.player, enemies: new Map(state.enemies.map((e) => [e.uid, e.pos])) };
}

export type Colors = ReturnType<typeof readColors>;

/** 色は styles.css の変数から取る。毎フレーム読むと重いので、画面を開いたときに1回だけ読む */
export function readColors() {
  const css = getComputedStyle(document.documentElement);
  const c = (name: string) => css.getPropertyValue(name).trim();
  return {
    fog: c('--fog'),
    floor: c('--pine-deep'),
    wall: c('--pine-line'),
    wallTop: c('--wall-top'),
    stairs: c('--bone'),
    treasure: c('--hp-enemy'),
    elite: c('--fire'),
    boss: c('--procure'),
    notice: c('--hp-enemy'),
    calm: c('--bone-dim'),
    hp: c('--hp-enemy'),
    target: c('--hp-you'),
    mini: c('--bone-dim'), // 3D画面の上に半透明で重ねるので、暗い床の上でも見える明るい色にする
  };
}

export const lerp = (a: Pos, b: Pos, t: number): Pos => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** 画面の左上に映っているマップ上の座標（小数）。主人公が常に中央に来る */
export function viewOrigin(frame: Frame): Pos {
  const camera = lerp(frame.from.player, frame.state.player, frame.progress);
  return { x: camera.x - Math.floor(VIEW_W / 2), y: camera.y - Math.floor(VIEW_H / 2) };
}

/** 主人公を中心に、周りのマスを描く。見えていないマスは霧、一度見たマスは暗く描く */
export function drawView(canvas: HTMLCanvasElement, frame: Frame, colors: Colors) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { state, visible } = frame;
  const { map, seen } = state;
  const origin = viewOrigin(frame);
  // 小数の位置のまま描くと境目がにじむので、整数のピクセルにそろえる
  const toPx = (x: number, y: number) => ({
    px: Math.round((x - origin.x) * CELL),
    py: Math.round((y - origin.y) * CELL),
  });

  ctx.fillStyle = colors.fog;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false; // ドット絵をぼかさない
  const tiles = frame.tileset;

  // スクロールの途中は端のマスが半分ずつ見えるので、1マス余分に描く
  const x0 = Math.floor(origin.x);
  const y0 = Math.floor(origin.y);
  for (let y = y0; y <= y0 + VIEW_H; y++) {
    for (let x = x0; x <= x0 + VIEW_W; x++) {
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      const i = y * map.width + x;
      if (!seen[i]) continue;
      const { px, py } = toPx(x, y);
      const isStairs = map.stairs !== null && x === map.stairs.x && y === map.stairs.y;
      // まだ空になっていない宝箱だけを描く
      const hasChest = state.chests.some((c) => c.pos.x === x && c.pos.y === y);
      if (tiles) {
        drawTile(ctx, tiles, TILESET.floors[floorVariant(x, y)]!, px, py);
        if (map.tiles[i] === 'wall') drawWall(ctx, tiles, state, x, y, px, py);
        if (isStairs) drawTile(ctx, tiles, TILESET.stairs, px, py);
        if (hasChest) drawTile(ctx, tiles, TILESET.chest, px, py);
      } else {
        if (map.tiles[i] === 'wall') {
          ctx.fillStyle = colors.wall;
          ctx.fillRect(px, py, CELL, CELL);
          ctx.fillStyle = colors.wallTop;
          ctx.fillRect(px, py, CELL, 4);
        } else {
          ctx.fillStyle = colors.floor;
          ctx.fillRect(px, py, CELL, CELL);
        }
        if (isStairs) drawStairs(ctx, px, py, colors.stairs);
        if (hasChest) drawChest(ctx, px, py, colors.treasure, colors.fog);
      }
      // 一度見たが今は見えていないマスは暗くする
      if (!visible.has(i)) {
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = colors.fog;
        ctx.fillRect(px, py, CELL, CELL);
        ctx.globalAlpha = 1;
      }
    }
  }

  if (frame.walkTarget) {
    const { px, py } = toPx(frame.walkTarget.x, frame.walkTarget.y);
    ctx.strokeStyle = colors.target;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 4, py + 4, CELL - 8, CELL - 8);
  }

  // 敵は今見えているマスにいるものだけ、前の位置から動かして描く
  for (const e of state.enemies) {
    if (!visible.has(e.pos.y * map.width + e.pos.x)) continue;
    const at = lerp(frame.from.enemies.get(e.uid) ?? e.pos, e.pos, frame.progress);
    const { px, py } = toPx(at.x, at.y);
    if (px < -CELL || py < -CELL || px >= canvas.width || py >= canvas.height) continue;
    drawEnemy(ctx, e, px, py, colors);
  }

  drawSprite(ctx, 'hero', Math.floor(VIEW_W / 2) * CELL, Math.floor(VIEW_H / 2) * CELL, CELL, CLOAKS[cloakOf(state.stats.armor)]);
}

function drawTile(ctx: CanvasRenderingContext2D, tiles: HTMLImageElement, src: { x: number; y: number }, px: number, py: number) {
  ctx.drawImage(tiles, src.x, src.y, CELL, CELL, px, py, CELL, CELL);
}

/**
 * 壁をオートタイルで描く。隣のマスとのつながりで、4分の1マスずつ部品を選ぶ。
 * まだ見ていない隣のマスは壁として扱う（縁の形から、霧の向こうが通路だとわからないように）。
 */
function drawWall(
  ctx: CanvasRenderingContext2D,
  tiles: HTMLImageElement,
  state: ExploreState,
  x: number,
  y: number,
  px: number,
  py: number,
) {
  const { map, seen } = state;
  const isWall = (dx: number, dy: number) => {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) return true;
    const i = ny * map.width + nx;
    return !seen[i] || map.tiles[i] === 'wall';
  };
  const base = TILESET.wallTemplate;
  for (const { q, src } of wallPieces(isWall)) {
    ctx.drawImage(tiles, base.x + src.x, base.y + src.y, QUARTER, QUARTER, px + q.sx * QUARTER, py + q.sy * QUARTER, QUARTER, QUARTER);
  }
}

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: MapEnemy, px: number, py: number, colors: Colors) {
  const def = enemyDef(enemy);
  if (enemy.elite) {
    // 強敵は赤い枠、ボスは金の二重枠で囲む
    ctx.strokeStyle = def.boss ? colors.boss : colors.elite;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, CELL - 2, CELL - 2);
    if (def.boss) ctx.strokeRect(px - 2, py - 2, CELL + 4, CELL + 4);
  }
  const look = ENEMY_LOOKS[enemy.id];
  drawSprite(ctx, look.sprite, px, py, CELL, look.recolor);

  if (enemy.hp < def.hp) {
    ctx.fillStyle = colors.fog;
    ctx.fillRect(px + 3, py + CELL - 5, CELL - 6, 3);
    ctx.fillStyle = colors.hp;
    ctx.fillRect(px + 3, py + CELL - 5, Math.max(1, Math.round((CELL - 6) * (enemy.hp / def.hp))), 3);
  }

  // 頭上のマーク。気付いた瞬間の「！」だけ大きく強調する
  const big = enemy.justNoticed;
  ctx.font = `900 ${big ? 22 : 14}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 3;
  ctx.strokeStyle = colors.fog;
  ctx.fillStyle = enemy.mode === 'wander' ? colors.calm : colors.notice;
  const mx = px + CELL / 2;
  const my = py + (big ? 6 : 4);
  ctx.strokeText(ENEMY_MARK[enemy.mode].mark, mx, my);
  ctx.fillText(ENEMY_MARK[enemy.mode].mark, mx, my);
}

function drawChest(ctx: CanvasRenderingContext2D, px: number, py: number, color: string, line: string) {
  const m = CELL / 4;
  ctx.fillStyle = color;
  ctx.fillRect(px + m, py + m + 2, CELL - m * 2, CELL - m * 2 - 2);
  // ふたの線と留め金
  ctx.fillStyle = line;
  ctx.fillRect(px + m, py + m + 7, CELL - m * 2, 2);
  ctx.fillRect(px + CELL / 2 - 2, py + m + 9, 4, 4);
}

function drawStairs(ctx: CanvasRenderingContext2D, px: number, py: number, color: string) {
  ctx.fillStyle = color;
  for (let k = 0; k < 4; k++) {
    const inset = 4 + k * 3;
    ctx.fillRect(px + inset, py + 6 + k * 6, CELL - inset * 2, 3);
  }
}

export function drawMinimap(canvas: HTMLCanvasElement, state: ExploreState, colors: Colors) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { map, seen, player } = state;
  // 3D画面の上に重ねるので、背景は塗らずに透かす（下地の濃さは CSS で決める）
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = colors.mini;
  map.tiles.forEach((t, i) => {
    if (t === 'floor' && seen[i]) ctx.fillRect((i % map.width) * MINI_CELL, Math.floor(i / map.width) * MINI_CELL, MINI_CELL, MINI_CELL);
  });
  // 広いマップほど小さく縮めて表示されるので、主人公と階段の印はマップの広さに合わせて大きくする
  const mark = Math.max(MINI_CELL + 2, Math.round(canvas.width / 14));
  const dot = (p: Pos, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round((p.x + 0.5) * MINI_CELL - mark / 2), Math.round((p.y + 0.5) * MINI_CELL - mark / 2), mark, mark);
  };
  if (map.stairs && seen[map.stairs.y * map.width + map.stairs.x]) dot(map.stairs, colors.stairs);
  dot(player, colors.target);
}
