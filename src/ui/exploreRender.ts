// 探索画面の描画で使う共通の部品：1コマの情報（Frame）、1歩の動きの始まり（Motion）、敵の状態の印、小さな地図（ミニマップ）。
// ダンジョンそのものは3Dで描く（explore3d.ts）。ミニマップだけは Canvas に2Dで描いて、3D画面の右上に重ねる。

import type { EnemyMode } from '../game/enemies';
import { upStairs, type ExploreState } from '../game/explore';
import type { Pos } from '../game/map';

export const MINI_CELL = 3; // ミニマップの1マスの大きさ（px）

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
  walkPath: Pos[]; // そこまでの道筋（今いるマスを除き、行き先を含む）。歩いていなければ空
}

export function motionOf(state: ExploreState): Motion {
  return { player: state.player, enemies: new Map(state.enemies.map((e) => [e.uid, e.pos])) };
}

export type Colors = ReturnType<typeof readColors>;

/** ミニマップの色は styles.css の変数から取る。毎フレーム読むと重いので、描くときに1回だけ読む */
export function readColors() {
  const css = getComputedStyle(document.documentElement);
  const c = (name: string) => css.getPropertyValue(name).trim();
  return {
    stairs: c('--bone'),
    treasure: c('--hp-enemy'),
    target: c('--hp-you'),
    mini: c('--bone-dim'), // 3D画面の上に半透明で重ねるので、暗い床の上でも見える明るい色にする
  };
}

export const lerp = (a: Pos, b: Pos, t: number): Pos => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

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
  const up = upStairs(state);
  if (up && seen[up.y * map.width + up.x]) dot(up, colors.treasure); // 上り階段は、床と見分けられる金色
  dot(player, colors.target);
}
