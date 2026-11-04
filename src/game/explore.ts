// マップ上の探索。プレイヤーの移動・霧（視界と記憶）・満腹度・階段・敵との戦闘を扱う。
// 1ターン = プレイヤーの行動 → 満腹度の消費 → 敵の手番。
// ほかのロジックと同じく、状態を受け取り新しい状態を返す純粋関数でできている。

import { buildPlayer, enemyHitDamage, playerHitDamage } from './combat';
import { TRAIT_IDS } from './data';
import {
  ENEMY_CONFIG,
  enemyDef,
  isAdjacent,
  key,
  nextStepToward,
  spawnEnemies,
  wanderStep,
  type MapEnemy,
} from './enemies';
import { generateFloor, tileAt, type FloorMap, type Pos } from './map';
import { nextInt, nextRandom } from './rng';
import type { ItemId, PlayerStats, Result, TraitId } from './types';

// 数値はすべて仮。バランス調整で見直す
export const EXPLORE_CONFIG = {
  floors: 3, // ボス階は別に作る予定
  mapSize: 40, // ランク1の広さ
  sightRadius: 6, // 視界の半径（マス）
  maxSatiety: 600, // 満腹度の上限。3階分の本道（40×40で最大400歩弱）を歩き切れる量
  satietyPerAction: 1,
  starveDamage: 1, // 満腹度0のとき、1行動ごとに減るHP
  regenInterval: 6, // 満腹度が残っていれば、このターン数ごとにHPが1回復する
} as const;

export type Dir = 'up' | 'down' | 'left' | 'right';

export const DIR_DELTA: Record<Dir, Pos> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** 移動先に敵がいれば、移動ではなく攻撃になる（体当たり方式） */
export type ExploreAction = { kind: 'move'; dir: Dir } | { kind: 'wait' } | { kind: 'descend' };

export type ExploreOutcome = 'ongoing' | 'reached_bottom' | 'defeated';

export interface ExploreState {
  seed: number;
  trait: TraitId;
  floor: number; // 0始まり
  floors: number;
  mapSize: number;
  enemyDensity: number;
  map: FloorMap;
  player: Pos;
  stats: PlayerStats; // HP・攻撃力・装備
  satiety: number;
  maxSatiety: number;
  enemies: MapEnemy[];
  nextUid: number;
  defeated: number; // 倒した敵の数
  seen: boolean[]; // この階で一度でも見えたマス（霧が晴れた場所）
  turn: number; // 行動した回数
  rngState: number;
  outcome: ExploreOutcome;
  log: string[];
}

export interface ExploreOptions {
  floors?: number;
  mapSize?: number;
  maxSatiety?: number;
  trait?: TraitId; // 省略時はシードから決める
  loadout?: readonly ItemId[];
  enemyDensity?: number;
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
  const traitRoll = nextInt(seed, TRAIT_IDS.length);
  const state: ExploreState = {
    seed,
    trait: options.trait ?? TRAIT_IDS[traitRoll.value]!,
    floor: 0,
    floors: options.floors ?? EXPLORE_CONFIG.floors,
    mapSize,
    enemyDensity: options.enemyDensity ?? ENEMY_CONFIG.density,
    map: floorMap(seed, 0, mapSize),
    player: { x: 0, y: 0 },
    stats: buildPlayer(options.loadout ?? []),
    satiety: maxSatiety,
    maxSatiety,
    enemies: [],
    nextUid: 0,
    defeated: 0,
    seen: [],
    turn: 0,
    rngState: traitRoll.state,
    outcome: 'ongoing',
    log: [],
  };
  return enterFloor(state, 0, state.map);
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
      const target = state.enemies.find((e) => samePos(e.pos, to));
      if (target) {
        next = playerAttack(state, target);
      } else {
        next = backAttacks(state, to);
        if (next.outcome !== 'ongoing') return ok({ ...next, turn: next.turn + 1 });
        next = reveal({ ...next, player: to });
      }
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
      // 階を移ったターンは敵が動かない
      const floor = state.floor + 1;
      return ok(spendAction(enterFloor(state, floor, floorMap(state.seed, floor, state.mapSize))));
    }
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }

  next = spendAction(next);
  if (next.outcome !== 'ongoing') return ok(next);
  return ok(enemiesTurn(next));
}

// ===== 階の移動 =====

function floorMap(seed: number, floor: number, mapSize: number): FloorMap {
  return generateFloor(floorSeed(seed, floor), { width: mapSize, height: mapSize });
}

/** 新しい階に入る：入口に立ち、敵を配置し、霧をリセットする */
function enterFloor(state: ExploreState, floor: number, map: FloorMap): ExploreState {
  const spawned = spawnEnemies(map, state.trait, state.rngState, state.nextUid, state.enemyDensity);
  return reveal({
    ...state,
    floor,
    map,
    player: map.start,
    enemies: spawned.enemies,
    nextUid: state.nextUid + spawned.enemies.length,
    rngState: spawned.rngState,
    seen: new Array<boolean>(map.tiles.length).fill(false),
    log: [...state.log, `地下${floor + 1}階に降りた`],
  });
}

// ===== プレイヤーの攻撃 =====

/** 体当たりで攻撃する。気付いていない敵なら不意打ちになる */
function playerAttack(state: ExploreState, target: MapEnemy): ExploreState {
  const def = enemyDef(target);
  const surprise = target.mode === 'wander';
  const dmg = playerHitDamage(state.stats, def) * (surprise ? ENEMY_CONFIG.surpriseMultiplier : 1);
  const hp = target.hp - dmg;
  const log = [...state.log, surprise ? `${def.name}に不意打ち！ ${dmg}のダメージ` : `${def.name}に${dmg}のダメージ`];

  if (hp <= 0) {
    return {
      ...state,
      enemies: state.enemies.filter((e) => e.uid !== target.uid),
      defeated: state.defeated + 1,
      log: [...log, `${def.name}を倒した`],
    };
  }
  // 攻撃された敵はこちらに気付く
  const hit: MapEnemy = { ...target, hp, mode: 'chase', justNoticed: surprise, lastSeen: state.player };
  return { ...state, enemies: state.enemies.map((e) => (e.uid === target.uid ? hit : e)), log };
}

/** 隣にいる敵から離れると、背後から攻撃されることがある（強敵は必ず） */
function backAttacks(state: ExploreState, to: Pos): ExploreState {
  let s = state;
  for (const e of state.enemies) {
    if (e.mode === 'wander' || !isAdjacent(e.pos, state.player) || isAdjacent(e.pos, to)) continue;
    let hits = e.elite;
    if (!hits) {
      const roll = nextRandom(s.rngState);
      s = { ...s, rngState: roll.state };
      hits = roll.value < ENEMY_CONFIG.backAttackChance;
    }
    if (!hits) continue;
    const def = enemyDef(e);
    s = damagePlayer(s, enemyHitDamage(s.stats, def), `離れようとして、${def.name}に背後から攻撃された`, def.name);
    if (s.outcome !== 'ongoing') return s;
  }
  return s;
}

// ===== 敵の手番 =====

/**
 * 敵が1体ずつ行動する。
 * 1. プレイヤーが見えるか調べ、状態（うろつき・追跡・探索）を切り替える。気付いたターンは動かない
 * 2. 追跡中・探索中で隣にいれば攻撃し、そうでなければ移動する（強敵は動かない）
 */
function enemiesTurn(state: ExploreState): ExploreState {
  let s = state;
  for (const original of state.enemies) {
    const current = s.enemies.find((e) => e.uid === original.uid);
    if (!current) continue;
    const def = enemyDef(current);
    const sees = canSee(s.map, current.pos, s.player, ENEMY_CONFIG.sight);
    let e: MapEnemy = { ...current, justNoticed: false };
    const log: string[] = [];

    if (sees) {
      if (e.mode !== 'chase') {
        // 気付いたターンは身構えるだけで動かない。プレイヤーに対応する猶予を与える
        e = { ...e, mode: 'chase', justNoticed: true, lastSeen: s.player };
        s = withEnemy({ ...s, log: [...s.log, `${def.name}がこちらに気付いた`] }, e);
        continue;
      }
      e = { ...e, lastSeen: s.player };
    } else if (e.mode === 'chase') {
      e = { ...e, mode: 'search', searchTurns: ENEMY_CONFIG.loseTurns };
    } else if (e.mode === 'search') {
      e = { ...e, searchTurns: e.searchTurns - 1 };
      if (e.searchTurns <= 0) {
        e = { ...e, mode: 'wander', lastSeen: null, searchTurns: 0 };
        log.push(`${def.name}はこちらを見失ったようだ`);
      }
    }
    s = { ...s, log: [...s.log, ...log] };

    // 攻撃
    if (e.mode !== 'wander' && isAdjacent(e.pos, s.player)) {
      s = withEnemy(s, e);
      s = damagePlayer(s, enemyHitDamage(s.stats, def), `${def.name}の攻撃`, def.name);
      if (s.outcome !== 'ongoing') return s;
      continue;
    }

    // 移動
    if (!e.elite) {
      const blocked = new Set(s.enemies.filter((o) => o.uid !== e.uid).map((o) => key(o.pos)));
      blocked.add(key(s.player));
      if (e.mode !== 'wander' && e.lastSeen && !samePos(e.pos, e.lastSeen)) {
        const nextPos = nextStepToward(s.map, e.pos, e.lastSeen, blocked);
        if (nextPos && !samePos(nextPos, s.player)) e = { ...e, pos: nextPos };
      } else {
        const moved = wanderStep(s.map, e.pos, blocked, s.rngState);
        s = { ...s, rngState: moved.rngState };
        e = { ...e, pos: moved.pos };
      }
    }
    s = withEnemy(s, e);
  }
  return s;
}

function withEnemy(state: ExploreState, enemy: MapEnemy): ExploreState {
  return { ...state, enemies: state.enemies.map((e) => (e.uid === enemy.uid ? enemy : e)) };
}

function damagePlayer(state: ExploreState, dmg: number, message: string, by: string): ExploreState {
  const hp = Math.max(0, state.stats.hp - dmg);
  const log = [...state.log, `${message}で${dmg}のダメージ`];
  if (hp === 0) {
    return { ...state, stats: { ...state.stats, hp }, outcome: 'defeated', log: [...log, `${by}に倒された…`] };
  }
  return { ...state, stats: { ...state.stats, hp }, log };
}

// ===== 満腹度 =====

/** 1行動ぶん満腹度を減らす。満腹度が残っていればHPが少しずつ回復し、0ならHPが減る */
function spendAction(state: ExploreState): ExploreState {
  const turn = state.turn + 1;
  const { stats } = state;
  if (state.satiety > 0) {
    const satiety = Math.max(0, state.satiety - EXPLORE_CONFIG.satietyPerAction);
    const log = satiety === 0 ? [...state.log, '空腹で力が出ない…'] : state.log;
    const regen = turn % EXPLORE_CONFIG.regenInterval === 0 && stats.hp < stats.maxHp ? 1 : 0;
    return { ...state, turn, satiety, stats: { ...stats, hp: stats.hp + regen }, log };
  }
  const hp = Math.max(0, stats.hp - EXPLORE_CONFIG.starveDamage);
  if (hp === 0) {
    return { ...state, turn, stats: { ...stats, hp }, outcome: 'defeated', log: [...state.log, '飢えて力尽きた…'] };
  }
  return { ...state, turn, stats: { ...stats, hp } };
}

// ===== 視界 =====

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
      const target = { x: from.x + dx, y: from.y + dy };
      if (target.x < 0 || target.y < 0 || target.x >= map.width || target.y >= map.height) continue;
      if (canSee(map, from, target, radius)) result.add(target.y * map.width + target.x);
    }
  }
  return result;
}

/** from から to が見えるか（半径以内で、間に壁がない） */
export function canSee(map: FloorMap, from: Pos, to: Pos, radius: number): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return dx * dx + dy * dy <= radius * radius && lineIsClear(map, from, to);
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
