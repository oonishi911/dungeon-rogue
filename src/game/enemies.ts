// マップ上の敵：配置・能力・移動の経路。
// 敵の手番の進め方（気付く・追う・攻撃する）は explore.ts にある。

import { enemyBase, TRAIT_ENEMIES } from './data';
import { GEN_SETTINGS, type EnemySettings } from './genMaster';
import { tileAt, type FloorMap, type Pos, type Room } from './map';
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
  room?: Room; // 気付くまでは、この部屋の中だけを歩く（部屋に置いた敵で、設定の stayInRoom がオンのとき）
}

/**
 * 実際に戦うときの敵の能力。ボスは data.ts の能力のまま。
 * 通常の敵は HP・攻撃力を strengthRate 倍にし、強敵はさらにそこから能力を上げる（防御力はそのまま）
 */
export function enemyDef(enemy: Pick<MapEnemy, 'id' | 'elite'>): EnemyDef {
  const base = enemyBase(enemy.id);
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
  return [...pool].sort((a, b) => enemyBase(b).hp * enemyBase(b).atk - enemyBase(a).hp * enemyBase(a).atk)[0]!;
}

/**
 * 階に敵を配置する。
 * 強敵はマップの「強敵」の行き止まりに置き、通常の敵は入口から離れた床にランダムに置く。
 * 数と置き方は設定（dungeonGen.json の enemies）で決める：数は amount 倍。置く場所は placement で、
 * 部屋にも通路にも（部屋の床は roomWeight 倍選ばれやすい）・部屋だけ・通路だけ。部屋が足りなければ置ける分だけ置く。
 * さらに、部屋ごとに nestChance の確率で「群れ部屋」にして、通常の敵とは別に nestMin〜nestMax 体をまとめて置く（通路だけのときは作らない）。
 * 入口から safeDistance マス以内には、どちらも置かない
 */
export function spawnEnemies(
  map: FloorMap,
  trait: TraitId,
  rngState: number,
  firstUid: number,
  density: number = ENEMY_CONFIG.density,
  settings: EnemySettings = GEN_SETTINGS.enemies,
): { enemies: MapEnemy[]; rngState: number } {
  let s = rngState;
  const enemies: MapEnemy[] = [];
  // マスごとの「どの部屋の中か」を先に調べておく（敵を1体置くたびに全部の部屋を調べ直すと、部屋の多い広い階でとても遅い）。
  // 部屋どうしは重ならないが、念のため、前の書き方と同じく、先に並んでいる部屋を選ぶ
  const roomIndex = new Int16Array(map.tiles.length).fill(-1);
  for (let i = map.rooms.length - 1; i >= 0; i--) {
    const r = map.rooms[i]!;
    for (let y = Math.max(0, r.y); y < Math.min(map.height, r.y + r.height); y++) {
      roomIndex.fill(i, y * map.width + Math.max(0, r.x), y * map.width + Math.min(map.width, r.x + r.width));
    }
  }
  const inMap = (p: Pos) => p.x >= 0 && p.y >= 0 && p.x < map.width && p.y < map.height;
  const roomAt = (p: Pos) => (inMap(p) ? map.rooms[roomIndex[p.y * map.width + p.x]!] : undefined);
  const make = (id: EnemyId, pos: Pos, elite: boolean): MapEnemy => {
    const room = !elite && settings.stayInRoom ? roomAt(pos) : undefined;
    return {
      uid: firstUid + enemies.length,
      id,
      elite,
      pos,
      hp: enemyDef({ id, elite }).hp,
      mode: 'wander',
      justNoticed: false,
      lastSeen: null,
      searchTurns: 0,
      ...(room ? { room: { ...room } } : {}),
    };
  };

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
  const count = Math.min(candidates.length, Math.round(floorCount * density * settings.amount));
  const pool = TRAIT_ENEMIES[trait].pool;
  // 場所の選ばれやすさ（0 の場所には置かない）。部屋にも通路にも置くとき、部屋の床は roomWeight、通路の床は1
  const roomWeight = { mixed: settings.roomWeight, rooms: 1, corridors: 0 }[settings.placement];
  const corridorWeight = settings.placement === 'rooms' ? 0 : 1;
  const weights = candidates.map((p) => (roomAt(p) ? roomWeight : corridorWeight));
  const even = roomWeight === 1 && corridorWeight === 1; // どこも同じなら、前と同じ選び方（同じシードなら同じ配置）
  for (let n = 0; n < count; n++) {
    let index: number;
    if (even) {
      const pick = nextInt(s, candidates.length);
      s = pick.state;
      index = pick.value;
    } else {
      const total = weights.reduce((a, w) => a + w, 0);
      if (total <= 0) break;
      const r = nextRandom(s);
      s = r.state;
      let left = r.value * total;
      index = weights.findIndex((w) => (left -= w) < 0);
      if (index < 0) index = weights.length - 1;
    }
    const kind = nextInt(s, pool.length);
    s = kind.state;
    const [pos] = candidates.splice(index, 1);
    weights.splice(index, 1);
    enemies.push(make(pool[kind.value]!, pos!, false));
  }

  // 群れ部屋：部屋ごとに確率で決め、部屋の中の空いている床に、まとめて置く
  if (settings.nestChance > 0 && settings.placement !== 'corridors') {
    for (const room of map.rooms) {
      const roll = nextRandom(s);
      s = roll.state;
      if (roll.value >= settings.nestChance) continue;
      const size = nextInt(s, settings.nestMax - settings.nestMin + 1);
      s = size.state;
      // この部屋の中の、空いている床（candidates の中の番号。小さい順）
      const free = candidates.flatMap((p, i) => (roomAt(p) === room ? [i] : []));
      for (let n = 0; n < settings.nestMin + size.value; n++) {
        if (free.length === 0) break;
        const pick = nextInt(s, free.length);
        const kind = nextInt(pick.state, pool.length);
        s = kind.state;
        const [pos] = candidates.splice(free[pick.value]!, 1);
        // 置いたマスを空きから外し、それより後ろの番号を1つずつ詰める（candidates から1つ抜いたので）
        free.splice(pick.value, 1);
        for (let k = pick.value; k < free.length; k++) free[k]!--;
        enemies.push(make(pool[kind.value]!, pos!, false));
      }
    }
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
    hp: enemyBase(id).hp,
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
  // マスは番号（y × 幅 + x）で扱う（文字列の鍵で調べるより速い）
  const { width, height, tiles } = map;
  const start = from.y * width + from.x;
  const goal = to.y * width + to.x;
  const parent = new Int32Array(width * height).fill(-1); // そのマスへ来る前のマス。-1 はまだ来ていない
  const dist = new Int32Array(width * height);
  parent[start] = start;
  const queue = new Int32Array(width * height);
  queue[0] = start;
  let tail = 1;
  for (let head = 0; head < tail; head++) {
    const at = queue[head]!;
    const d = dist[at]!;
    if (d >= ENEMY_CONFIG.chaseSearchLimit) continue;
    const x = at % width;
    const y = (at - x) / width;
    for (const step of STEPS) {
      const nx = x + step.x;
      const ny = y + step.y;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (parent[n] !== -1 || tiles[n] === 'wall') continue;
      if (n !== goal && blocked.has(`${nx},${ny}`)) continue;
      dist[n] = d + 1;
      parent[n] = at;
      if (n === goal) {
        // ゴールからたどって、from の次のマスを返す
        let cur = n;
        while (parent[cur] !== start) cur = parent[cur]!;
        return { x: cur % width, y: Math.floor(cur / width) };
      }
      queue[tail++] = n;
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
  area?: Room, // あれば、この部屋の外へは出ない
): { pos: Pos; rngState: number } {
  const move = nextRandom(rngState);
  if (move.value >= ENEMY_CONFIG.wanderMoveChance) return { pos: from, rngState: move.state };
  const inArea = (p: Pos) => !area || (p.x >= area.x && p.x < area.x + area.width && p.y >= area.y && p.y < area.y + area.height);
  const open = neighbors(from).filter((n) => tileAt(map, n) === 'floor' && !blocked.has(key(n)) && (!inArea(from) || inArea(n)));
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

// 隣のマスへの向き（上・右・下・左）。neighbors と同じ順（道探しの結果が変わらないように）
const STEPS: readonly Pos[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

function neighbors(p: Pos): Pos[] {
  return [
    { x: p.x, y: p.y - 1 },
    { x: p.x + 1, y: p.y },
    { x: p.x, y: p.y + 1 },
    { x: p.x - 1, y: p.y },
  ];
}
