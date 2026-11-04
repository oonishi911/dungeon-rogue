// 階層マップの生成。
// 1. 小部屋をランダムに配置する。
// 2. 残りの空間を穴掘り法（再帰的バックトラック）の迷路で埋める。
// 3. 部屋と通路を隔てる壁に穴を開けて全体をつなぐ。つながったあとも一部の壁は壊してループを作る。
// 4. 入口からほどよく遠い場所に階段を置き、そこまでの最短路を本道とする。
// 5. 本道から外れた行き止まりに、宝箱か強敵を置く。
// 乱数はシード付きなので、同じシード・同じ設定なら必ず同じマップになる。

import { nextInt, nextRandom, shuffle } from './rng';

export const MAP_CONFIG = {
  minSize: 30,
  maxSize: 100,
  roomAttemptRate: 0.04, // 迷路のセル数に対する、部屋を置こうとする回数の割合
  roomMinSize: 3, // 部屋の一辺（奇数）
  roomMaxSize: 9,
  loopChance: 0.04, // すでにつながっている場所どうしの壁を壊してループにする確率
  stairsMinRatio: 0.55, // 階段は、入口から最も遠い通路までの距離のこの範囲に置く
  stairsMaxRatio: 0.8,
  featureRate: 0.5, // 条件を満たす行き止まりのうち、宝箱・強敵を置く割合
  minBranchDepth: 3, // 本道からこのマス数以上離れた行き止まりにだけ置く
} as const;

export type Tile = 'wall' | 'floor';

export interface Pos {
  x: number;
  y: number;
}

export interface Room {
  x: number; // 左上
  y: number;
  width: number;
  height: number;
}

export type FeatureKind = 'treasure' | 'elite';

export interface Feature {
  kind: FeatureKind;
  pos: Pos;
  depth: number; // 本道からの距離。報酬の質や敵の強さを決めるのに使う
}

export interface FloorMap {
  width: number;
  height: number;
  tiles: Tile[]; // 行優先（index = y * width + x）
  rooms: Room[];
  start: Pos;
  stairs: Pos;
  mainPath: Pos[]; // 入口から階段までの最短路（両端を含む）
  features: Feature[];
}

export interface FloorOptions {
  width: number;
  height: number;
  loopChance?: number;
  featureRate?: number;
}

const DIRS: readonly Pos[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export function generateFloor(seed: number, options: FloorOptions): FloorMap {
  const { width, height } = options;
  for (const size of [width, height]) {
    if (!Number.isInteger(size) || size < MAP_CONFIG.minSize || size > MAP_CONFIG.maxSize) {
      // 設定値の誤りはプログラムのバグなので、Result ではなく例外にする
      throw new RangeError(`マップの広さは${MAP_CONFIG.minSize}〜${MAP_CONFIG.maxSize}の整数で指定してください`);
    }
  }
  const loopChance = options.loopChance ?? MAP_CONFIG.loopChance;
  const featureRate = options.featureRate ?? MAP_CONFIG.featureRate;

  const tiles: Tile[] = new Array<Tile>(width * height).fill('wall');
  // 掘ったマスがどの区画（部屋1つ、または迷路1つ）に属するか。壁は -1
  const region: number[] = new Array<number>(width * height).fill(-1);
  const idx = (p: Pos) => p.y * width + p.x;
  let regionCount = 0;
  let s = seed;

  const roll = (max: number) => {
    const r = nextInt(s, max);
    s = r.state;
    return r.value;
  };
  const carve = (p: Pos, r: number) => {
    tiles[idx(p)] = 'floor';
    region[idx(p)] = r;
  };

  // 奇数座標のマスをセルとし、その間の偶数座標を壁として扱う
  const cols = Math.floor((width - 1) / 2);
  const rows = Math.floor((height - 1) / 2);
  const maxCellX = cols * 2 - 1;
  const maxCellY = rows * 2 - 1;

  // --- 1. 小部屋を置く ---
  // 位置も大きさも奇数にそろえるので、部屋どうしの間には必ず壁が1マス以上残る
  const rooms: Room[] = [];
  const sizeSteps = (MAP_CONFIG.roomMaxSize - MAP_CONFIG.roomMinSize) / 2 + 1;
  const attempts = Math.round(cols * rows * MAP_CONFIG.roomAttemptRate);
  for (let a = 0; a < attempts; a++) {
    const w = Math.min(MAP_CONFIG.roomMinSize + roll(sizeSteps) * 2, maxCellX);
    const h = Math.min(MAP_CONFIG.roomMinSize + roll(sizeSteps) * 2, maxCellY);
    // 右端・下端が maxCell を超えない奇数座標から選ぶ
    const x = roll((maxCellX - w) / 2 + 1) * 2 + 1;
    const y = roll((maxCellY - h) / 2 + 1) * 2 + 1;
    const room = { x, y, width: w, height: h };
    if (rooms.some((o) => overlaps(room, o))) continue;
    rooms.push(room);
    const r = regionCount++;
    for (let ry = y; ry < y + h; ry++) for (let rx = x; rx < x + w; rx++) carve({ x: rx, y: ry }, r);
  }

  // --- 2. 残りの空間を迷路で埋める ---
  for (let cy = 1; cy <= maxCellY; cy += 2) {
    for (let cx = 1; cx <= maxCellX; cx += 2) {
      if (tiles[cy * width + cx] === 'floor') continue;
      const r = regionCount++;
      const first = { x: cx, y: cy };
      carve(first, r);
      const stack: Pos[] = [first];
      while (stack.length > 0) {
        const current = stack[stack.length - 1]!;
        const candidates = DIRS.map((d) => ({
          wall: { x: current.x + d.x, y: current.y + d.y },
          next: { x: current.x + d.x * 2, y: current.y + d.y * 2 },
        })).filter(
          ({ next }) =>
            next.x >= 1 && next.y >= 1 && next.x <= maxCellX && next.y <= maxCellY && tiles[idx(next)] === 'wall',
        );
        if (candidates.length === 0) {
          stack.pop();
          continue;
        }
        const { wall, next } = candidates[roll(candidates.length)]!;
        carve(wall, r);
        carve(next, r);
        stack.push(next);
      }
    }
  }

  // --- 3. 区画どうしをつなぐ ---
  // 左右または上下を通路にはさまれた壁が候補。別々の区画を隔てる壁なら必ず壊し、
  // すでにつながっている区画どうしなら loopChance の確率で壊してループにする
  const connectors: { pos: Pos; a: number; b: number }[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (tiles[y * width + x] !== 'wall') continue;
      const pair: [number, number][] = [
        [region[y * width + x - 1]!, region[y * width + x + 1]!],
        [region[(y - 1) * width + x]!, region[(y + 1) * width + x]!],
      ];
      const between = pair.find(([a, b]) => a !== -1 && b !== -1);
      if (between) connectors.push({ pos: { x, y }, a: between[0], b: between[1] });
    }
  }
  const shuffledConnectors = shuffle(connectors, s);
  s = shuffledConnectors.state;
  const union = new UnionFind(regionCount);
  for (const c of shuffledConnectors.value) {
    if (union.join(c.a, c.b)) {
      tiles[idx(c.pos)] = 'floor';
    } else {
      const r = nextRandom(s);
      s = r.state;
      if (r.value < loopChance) tiles[idx(c.pos)] = 'floor';
    }
  }

  const map = { width, height, tiles };

  // --- 4. 階段と本道 ---
  const start = { x: roll(cols) * 2 + 1, y: roll(rows) * 2 + 1 };
  const fromStart = bfs(map, [start]);
  const farthest = Math.max(...fromStart.dist);
  const minDist = Math.ceil(farthest * MAP_CONFIG.stairsMinRatio);
  const maxDist = Math.floor(farthest * MAP_CONFIG.stairsMaxRatio);
  const stairsCandidates: number[] = [];
  fromStart.dist.forEach((d, i) => {
    if (d >= minDist && d <= maxDist) stairsCandidates.push(i);
  });
  const stairsIndex = stairsCandidates[roll(stairsCandidates.length)]!;
  const stairs = { x: stairsIndex % width, y: Math.floor(stairsIndex / width) };
  const mainPath: Pos[] = [];
  for (let i = stairsIndex; i !== -1; i = fromStart.parent[i]!) {
    mainPath.push({ x: i % width, y: Math.floor(i / width) });
  }
  mainPath.reverse();

  // --- 5. 脇道の行き止まりに宝箱・強敵を置く ---
  const fromMain = bfs(map, mainPath);
  const deadEnds = findDeadEnds(map).filter((p) => fromMain.dist[idx(p)]! >= MAP_CONFIG.minBranchDepth);
  const shuffled = shuffle(deadEnds, s);
  s = shuffled.state;
  const count = deadEnds.length === 0 ? 0 : Math.max(1, Math.round(deadEnds.length * featureRate));
  const features: Feature[] = [];
  for (const pos of shuffled.value.slice(0, count)) {
    const r = nextRandom(s);
    s = r.state;
    features.push({ kind: r.value < 0.5 ? 'treasure' : 'elite', pos, depth: fromMain.dist[idx(pos)]! });
  }

  return { width, height, tiles, rooms, start, stairs, mainPath, features };
}

/** 周囲1マスの壁も含めて重なるか */
function overlaps(a: Room, b: Room): boolean {
  return a.x - 1 < b.x + b.width && b.x - 1 < a.x + a.width && a.y - 1 < b.y + b.height && b.y - 1 < a.y + a.height;
}

/** 区画のつながりを管理する。join は別々だった2つをつないだとき true を返す */
class UnionFind {
  private readonly parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }

  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]!]!;
      i = this.parent[i]!;
    }
    return i;
  }

  join(a: number, b: number): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    this.parent[ra] = rb;
    return true;
  }
}

export function tileAt(map: Pick<FloorMap, 'width' | 'height' | 'tiles'>, pos: Pos): Tile {
  if (pos.x < 0 || pos.y < 0 || pos.x >= map.width || pos.y >= map.height) return 'wall';
  return map.tiles[pos.y * map.width + pos.x]!;
}

/** 通路のうち、隣接する通路が1つだけのマス */
export function findDeadEnds(map: Pick<FloorMap, 'width' | 'height' | 'tiles'>): Pos[] {
  const result: Pos[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (tileAt(map, { x, y }) !== 'floor') continue;
      const open = DIRS.filter((d) => tileAt(map, { x: x + d.x, y: y + d.y }) === 'floor').length;
      if (open === 1) result.push({ x, y });
    }
  }
  return result;
}

/**
 * 複数の出発点からの幅優先探索。
 * dist は到達できないマスが -1、parent は最短路の1つ前のマス（出発点は -1）。
 */
export function bfs(
  map: Pick<FloorMap, 'width' | 'height' | 'tiles'>,
  sources: readonly Pos[],
): { dist: number[]; parent: number[] } {
  const size = map.width * map.height;
  const dist = new Array<number>(size).fill(-1);
  const parent = new Array<number>(size).fill(-1);
  const queue: number[] = [];
  for (const p of sources) {
    const i = p.y * map.width + p.x;
    if (dist[i] === -1) {
      dist[i] = 0;
      queue.push(i);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const x = i % map.width;
    const y = Math.floor(i / map.width);
    for (const d of DIRS) {
      const n = { x: x + d.x, y: y + d.y };
      if (tileAt(map, n) !== 'floor') continue;
      const j = n.y * map.width + n.x;
      if (dist[j] !== -1) continue;
      dist[j] = dist[i]! + 1;
      parent[j] = i;
      queue.push(j);
    }
  }
  return { dist, parent };
}

/** デバッグ・テスト用の文字表示。# 壁 . 通路 S 入口 > 階段 T 宝箱 E 強敵 */
export function toAscii(map: FloorMap): string {
  const chars: string[] = map.tiles.map((t) => (t === 'wall' ? '#' : '.'));
  const put = (p: Pos, c: string) => (chars[p.y * map.width + p.x] = c);
  for (const f of map.features) put(f.pos, f.kind === 'treasure' ? 'T' : 'E');
  put(map.start, 'S');
  put(map.stairs, '>');
  const lines: string[] = [];
  for (let y = 0; y < map.height; y++) lines.push(chars.slice(y * map.width, (y + 1) * map.width).join(''));
  return lines.join('\n');
}
