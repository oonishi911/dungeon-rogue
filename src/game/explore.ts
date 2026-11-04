// マップ上の探索。プレイヤーの移動・霧（視界と記憶）・満腹度・階段での移動を扱う。
// 敵はまだいない。戦闘は次の段階でここに足す。
// ほかのロジックと同じく、状態を受け取り新しい状態を返す純粋関数でできている。

import { COMBAT_CONFIG } from './data';
import { generateFloor, tileAt, type FloorMap, type Pos } from './map';
import type { Result } from './types';

// 数値はすべて仮。バランス調整で見直す
export const EXPLORE_CONFIG = {
  floors: 3, // ボス階は別に作る予定
  mapSize: 40, // ランク1の広さ
  sightRadius: 6, // 視界の半径（マス）
  maxSatiety: 600, // 満腹度の上限。3階分の本道（40×40で最大400歩弱）を歩き切れる量
  satietyPerAction: 1,
  starveDamage: 1, // 満腹度0のとき、1行動ごとに減るHP
} as const;

export type Dir = 'up' | 'down' | 'left' | 'right';

export const DIR_DELTA: Record<Dir, Pos> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export type ExploreAction = { kind: 'move'; dir: Dir } | { kind: 'wait' } | { kind: 'descend' };

export type ExploreOutcome = 'ongoing' | 'reached_bottom' | 'defeated';

export interface ExploreState {
  seed: number;
  floor: number; // 0始まり
  floors: number;
  mapSize: number;
  map: FloorMap;
  player: Pos;
  hp: number;
  maxHp: number;
  satiety: number;
  maxSatiety: number;
  seen: boolean[]; // この階で一度でも見えたマス（霧が晴れた場所）
  turn: number; // 行動した回数
  outcome: ExploreOutcome;
  log: string[];
}

export interface ExploreOptions {
  floors?: number;
  mapSize?: number;
  maxSatiety?: number;
}

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T>(error: string): Result<T> => ({ ok: false, error });

/** 階ごとのマップのシード。同じ挑戦なら同じ並びになる */
export function floorSeed(seed: number, floor: number): number {
  return (seed + Math.imul(floor + 1, 0x9e3779b1)) >>> 0;
}

export function startExplore(seed: number, options: ExploreOptions = {}): ExploreState {
  const mapSize = options.mapSize ?? EXPLORE_CONFIG.mapSize;
  const maxSatiety = options.maxSatiety ?? EXPLORE_CONFIG.maxSatiety;
  const map = generateFloor(floorSeed(seed, 0), { width: mapSize, height: mapSize });
  return reveal({
    seed,
    floor: 0,
    floors: options.floors ?? EXPLORE_CONFIG.floors,
    mapSize,
    map,
    player: map.start,
    hp: COMBAT_CONFIG.playerHp,
    maxHp: COMBAT_CONFIG.playerHp,
    satiety: maxSatiety,
    maxSatiety,
    seen: new Array<boolean>(map.tiles.length).fill(false),
    turn: 0,
    outcome: 'ongoing',
    log: ['地下1階に降りた'],
  });
}

/** 1行動進める。壁への移動など行動にならない操作はエラーを返し、ターンも満腹度も消費しない */
export function step(state: ExploreState, action: ExploreAction): Result<ExploreState> {
  if (state.outcome !== 'ongoing') return err('探索は終わっています');

  let next: ExploreState;
  switch (action.kind) {
    case 'move': {
      const d = DIR_DELTA[action.dir];
      const to = { x: state.player.x + d.x, y: state.player.y + d.y };
      if (tileAt(state.map, to) === 'wall') return err('壁があって進めない');
      next = reveal({ ...state, player: to });
      break;
    }
    case 'wait': {
      next = state;
      break;
    }
    case 'descend': {
      if (!samePos(state.player, state.map.stairs)) return err('ここに階段はない');
      if (state.floor + 1 >= state.floors) {
        // 最下層の階段。ボス階は未実装なので、ここで探索を終える
        return ok({
          ...spendAction(state),
          outcome: 'reached_bottom',
          log: [...state.log, '最深部へ続く階段を見つけた'],
        });
      }
      const floor = state.floor + 1;
      const map = generateFloor(floorSeed(state.seed, floor), { width: state.mapSize, height: state.mapSize });
      next = reveal({
        ...state,
        floor,
        map,
        player: map.start,
        seen: new Array<boolean>(map.tiles.length).fill(false),
        log: [...state.log, `地下${floor + 1}階に降りた`],
      });
      break;
    }
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
  return ok(spendAction(next));
}

/** 1行動ぶん満腹度を減らす。満腹度が0ならHPが減る */
function spendAction(state: ExploreState): ExploreState {
  const turn = state.turn + 1;
  if (state.satiety > 0) {
    const satiety = Math.max(0, state.satiety - EXPLORE_CONFIG.satietyPerAction);
    const log = satiety === 0 ? [...state.log, '空腹で力が出ない…'] : state.log;
    return { ...state, turn, satiety, log };
  }
  const hp = Math.max(0, state.hp - EXPLORE_CONFIG.starveDamage);
  if (hp === 0) return { ...state, turn, hp, outcome: 'defeated', log: [...state.log, '飢えて力尽きた…'] };
  return { ...state, turn, hp };
}

/** 今の位置から見えるマスを、この階の記憶に加える */
function reveal(state: ExploreState): ExploreState {
  const seen = [...state.seen];
  for (const i of visibleTiles(state.map, state.player, EXPLORE_CONFIG.sightRadius)) seen[i] = true;
  return { ...state, seen };
}

/**
 * from から半径 radius 以内で見えるマスの番号。
 * 間に壁がなければ見える（見えた壁そのものも含む）。直線はブレゼンハムのアルゴリズムでたどる。
 */
export function visibleTiles(map: FloorMap, from: Pos, radius: number): Set<number> {
  const result = new Set<number>();
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const target = { x: from.x + dx, y: from.y + dy };
      if (target.x < 0 || target.y < 0 || target.x >= map.width || target.y >= map.height) continue;
      if (lineIsClear(map, from, target)) result.add(target.y * map.width + target.x);
    }
  }
  return result;
}

function lineIsClear(map: FloorMap, from: Pos, to: Pos): boolean {
  const dx = Math.abs(to.x - from.x);
  const dy = -Math.abs(to.y - from.y);
  const sx = from.x < to.x ? 1 : -1;
  const sy = from.y < to.y ? 1 : -1;
  let error = dx + dy;
  let x = from.x;
  let y = from.y;
  while (x !== to.x || y !== to.y) {
    // 始点は自分の位置なので調べない。終点は壁でも見える
    if ((x !== from.x || y !== from.y) && tileAt(map, { x, y }) === 'wall') return false;
    const e2 = 2 * error;
    if (e2 >= dy) {
      error += dy;
      x += sx;
    }
    if (e2 <= dx) {
      error += dx;
      y += sy;
    }
  }
  return true;
}

export function samePos(a: Pos, b: Pos): boolean {
  return a.x === b.x && a.y === b.y;
}

/** 隣り合う2マスの向き */
export function dirBetween(from: Pos, to: Pos): Dir {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dir = (Object.keys(DIR_DELTA) as Dir[]).find((d) => DIR_DELTA[d].x === dx && DIR_DELTA[d].y === dy);
  if (!dir) throw new Error('隣り合っていないマスです');
  return dir;
}
