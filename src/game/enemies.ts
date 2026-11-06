// マップ上の敵：配置・能力・移動の経路。
// 敵の手番の進め方（気付く・追う・攻撃する）は explore.ts にある。

import { ENEMIES, TRAIT_ENEMIES } from './data';
import { tileAt, type FloorMap, type Pos } from './map';
import { nextInt, nextRandom } from './rng';
import type { EnemyDef, EnemyId, TraitId } from './types';

// 数値はすべて仮。バランス調整で見直す
export const ENEMY_CONFIG = {
  density: 0.0075, // 通路1マスあたりの通常の敵の数（40×40で6〜7体）
  strengthRate: 0.5, // 通常の敵と強敵のHP・攻撃力は、data.ts の値の何倍か（ボスはそのまま）
  safeDistance: 8, // 入口からこのマス数以内には通常の敵を置かない
  sight: 5, // 敵の視界の半径
  loseTurns: 5, // 見失ってから、うろつきに戻るまでのターン数
  wanderMoveChance: 0.6, // うろついているとき、1ターンに動く確率
  surpriseMultiplier: 2, // 不意打ちのダメージ倍率
  backAttackChance: 0.5, // 通常の敵から離れたとき、背後から攻撃される確率（強敵は必ず）
  eliteHpRate: 2, // 強敵の能力は、元の敵の何倍か
  eliteAtkRate: 1.5,
  chaseSearchLimit: 40, // 追いかけるときの経路探索の最大距離
} as const;

/**
 * 敵の状態。
 * wander：気付いていない（不意打ちできる） / chase：追っている / search：見失って探している
 */
export type EnemyMode = 'wander' | 'chase' | 'search';

export interface MapEnemy {
  uid: number;
  id: EnemyId;
  elite: boolean; // 強敵とボスは動かず、離れようとすると必ず背後から攻撃してくる
  pos: Pos;
  hp: number;
  mode: EnemyMode;
  justNoticed: boolean; // このターンに気付いた（「！」を強調して表示する）
  lastSeen: Pos | null; // 最後にプレイヤーを見た場所
  searchTurns: number; // search のとき、あと何ターン探すか
}

/**
 * 実際に戦うときの敵の能力。ボスは data.ts の能力のまま。
 * 通常の敵は HP・攻撃力を strengthRate 倍にし、強敵はさらにそこから能力を上げる（防御力はそのまま）
 */
export function enemyDef(enemy: Pick<MapEnemy, 'id' | 'elite'>): EnemyDef {
  const base = ENEMIES[enemy.id];
  if (base.boss) return base;
  const scale = (n: number) => Math.max(1, Math.round(n * ENEMY_CONFIG.strengthRate));
  const normal = { ...base, hp: scale(base.hp), atk: scale(base.atk) };
  if (!enemy.elite) return normal;
  return {
    ...normal,
    name: `${base.name}（強敵）`,
    hp: Math.round(normal.hp * ENEMY_CONFIG.eliteHpRate),
    atk: Math.round(normal.atk * ENEMY_CONFIG.eliteAtkRate),
  };
}

/** 特性の敵のうち、いちばん強いもの。強敵の元にする */
function strongestOf(trait: TraitId): EnemyId {
  const pool = TRAIT_ENEMIES[trait].pool;
  return [...pool].sort((a, b) => ENEMIES[b].hp * ENEMIES[b].atk - ENEMIES[a].hp * ENEMIES[a].atk)[0]!;
}

/**
 * 階に敵を配置する。
 * 強敵はマップの「強敵」の行き止まりに置き、通常の敵は入口から離れた通路にランダムに置く。
 */
export function spawnEnemies(
  map: FloorMap,
  trait: TraitId,
  rngState: number,
  firstUid: number,
  density: number = ENEMY_CONFIG.density,
): { enemies: MapEnemy[]; rngState: number } {
  let s = rngState;
  const enemies: MapEnemy[] = [];
  const make = (id: EnemyId, pos: Pos, elite: boolean): MapEnemy => ({
    uid: firstUid + enemies.length,
    id,
    elite,
    pos,
    hp: enemyDef({ id, elite }).hp,
    mode: 'wander',
    justNoticed: false,
    lastSeen: null,
    searchTurns: 0,
  });

  const occupied = new Set<string>([key(map.start), ...(map.stairs ? [key(map.stairs)] : [])]);
  for (const f of map.features) {
    occupied.add(key(f.pos));
    if (f.kind === 'elite') enemies.push(make(strongestOf(trait), f.pos, true));
  }

  const candidates: Pos[] = [];
  map.tiles.forEach((t, i) => {
    const pos = { x: i % map.width, y: Math.floor(i / map.width) };
    if (t !== 'floor' || occupied.has(key(pos))) return;
    if (Math.abs(pos.x - map.start.x) + Math.abs(pos.y - map.start.y) <= ENEMY_CONFIG.safeDistance) return;
    candidates.push(pos);
  });
  const floorCount = map.tiles.filter((t) => t === 'floor').length;
  const count = Math.min(candidates.length, Math.round(floorCount * density));
  const pool = TRAIT_ENEMIES[trait].pool;
  for (let n = 0; n < count; n++) {
    const pick = nextInt(s, candidates.length);
    const kind = nextInt(pick.state, pool.length);
    s = kind.state;
    const [pos] = candidates.splice(pick.value, 1);
    enemies.push(make(pool[kind.value]!, pos!, false));
  }
  return { enemies, rngState: s };
}

/** ボス階のボス。動かない点は強敵と同じなので elite として扱う */
export function spawnBoss(pos: Pos, trait: TraitId, uid: number): MapEnemy {
  const id = TRAIT_ENEMIES[trait].boss;
  return {
    uid,
    id,
    elite: true,
    pos,
    hp: ENEMIES[id].hp,
    mode: 'wander',
    justNoticed: false,
    lastSeen: null,
    searchTurns: 0,
  };
}

/**
 * from から to へ向かう最短路の最初の1歩。blocked のマスは通れない（to 自体は通れる扱い）。
 * 届かない・遠すぎるときは null。
 */
export function nextStepToward(map: FloorMap, from: Pos, to: Pos, blocked: ReadonlySet<string>): Pos | null {
  if (from.x === to.x && from.y === to.y) return null;
  const parent = new Map<string, string>();
  const dist = new Map<string, number>([[key(from), 0]]);
  const queue: Pos[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head]!;
    const d = dist.get(key(p))!;
    if (d >= ENEMY_CONFIG.chaseSearchLimit) continue;
    for (const n of neighbors(p)) {
      const k = key(n);
      if (dist.has(k) || tileAt(map, n) === 'wall') continue;
      const isGoal = n.x === to.x && n.y === to.y;
      if (!isGoal && blocked.has(k)) continue;
      dist.set(k, d + 1);
      parent.set(k, key(p));
      if (isGoal) {
        // ゴールからたどって、from の次のマスを返す
        let cur = k;
        while (parent.get(cur) !== key(from)) cur = parent.get(cur)!;
        const [x, y] = cur.split(',').map(Number);
        return { x: x!, y: y! };
      }
      queue.push(n);
    }
  }
  return null;
}

/** うろつき：一定の確率で、空いている隣の通路へランダムに動く */
export function wanderStep(
  map: FloorMap,
  from: Pos,
  blocked: ReadonlySet<string>,
  rngState: number,
): { pos: Pos; rngState: number } {
  const move = nextRandom(rngState);
  if (move.value >= ENEMY_CONFIG.wanderMoveChance) return { pos: from, rngState: move.state };
  const open = neighbors(from).filter((n) => tileAt(map, n) === 'floor' && !blocked.has(key(n)));
  if (open.length === 0) return { pos: from, rngState: move.state };
  const pick = nextInt(move.state, open.length);
  return { pos: open[pick.value]!, rngState: pick.state };
}

export function isAdjacent(a: Pos, b: Pos): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

export function key(p: Pos): string {
  return `${p.x},${p.y}`;
}

function neighbors(p: Pos): Pos[] {
  return [
    { x: p.x, y: p.y - 1 },
    { x: p.x + 1, y: p.y },
    { x: p.x, y: p.y + 1 },
    { x: p.x - 1, y: p.y },
  ];
}
