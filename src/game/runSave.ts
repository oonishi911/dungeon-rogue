// 探索の途中の状態（中断データ）。1手ごとに保存し、ページを開き直したら続きから遊べるようにする。
// ブラウザの「戻る」や再読み込み、スマホがページを閉じてしまったときに、その回の探索がなくならないようにするため。
// 周回をまたいで残す記録（save.ts）とは別に持つ：探索が終われば消す。
//
// 小さく保存するための工夫：
// - 階の形（マップ）は保存しない。シードから同じ形を作り直せるので、読み込むときに作り直す
//   （作り直した形が保存したときと違えば、ゲームが更新されて作り方が変わったということなので、続きはあきらめる）
// - 霧の晴れたマス（seen）は、4マスを1文字（16進数）にまとめる
// - 記録（log）は、新しい方から LOG_KEEP 行だけ残す
// 読み込んだデータは壊れていたり古い形式だったりするので、形を確かめてから使う。合わなければ null（新しい挑戦を始める）
// 遊んでいるダンジョンは ID で持つ。ダンジョンを選べるようになる前の中断データ（ID がない）は、標準のダンジョンとして読む。
// そのダンジョンの設定ファイルが消されていたら、続きはあきらめる

import { ENEMIES, ITEMS, SPELLS, TRAIT_IDS } from './data';
import { DEFAULT_DUNGEON_ID, dungeonOf, hasDungeon } from './dungeons';
import type { MapEnemy } from './enemies';
import { mapOfFloor, type Chest, type ExploreState, type FloorMemory } from './explore';
import type { FloorMap, Pos } from './map';
import { parseSave, type SaveData } from './save';
import type { Departure, ItemId, SpellId, TraitId } from './types';

export const RUN_SAVE_VERSION = 1;
const LOG_KEEP = 200;

/** 保存する階の様子（マップの代わりに、形を確かめるための数を持つ） */
interface PackedFloor {
  mapCheck: number;
  seen: string;
  enemies: MapEnemy[];
  chests: Chest[];
}

type PackedState = Omit<ExploreState, 'map' | 'seen' | 'visited' | 'hits' | 'cast' | 'enemies' | 'chests'> & {
  current: PackedFloor;
  visited: Record<string, PackedFloor>;
};

/** 中断データ */
export interface RunSave {
  version: typeof RUN_SAVE_VERSION;
  base: SaveData; // この挑戦を始めたときの記録（何回目か、など）
  outcome: Departure; // 出発したときに決まったこと（ダンジョン・特性・持ち物）
  seed: number;
  state: PackedState;
}

/** 読み込んだ中断データ（探索の状態を元の形に戻したもの） */
export interface ResumedRun {
  base: SaveData;
  outcome: Departure;
  seed: number;
  state: ExploreState;
}

// ===== 保存 =====

/** 霧の晴れたマスを、4マスごとに16進数の1文字にまとめる */
export function packSeen(seen: readonly boolean[]): string {
  let out = '';
  for (let i = 0; i < seen.length; i += 4) {
    const n = (seen[i] ? 8 : 0) | (seen[i + 1] ? 4 : 0) | (seen[i + 2] ? 2 : 0) | (seen[i + 3] ? 1 : 0);
    out += n.toString(16);
  }
  return out;
}

/** packSeen の逆。length はマスの数。形が合わなければ null */
export function unpackSeen(text: string, length: number): boolean[] | null {
  if (text.length !== Math.ceil(length / 4) || !/^[0-9a-f]*$/.test(text)) return null;
  const seen = new Array<boolean>(length);
  for (let i = 0; i < length; i++) seen[i] = (parseInt(text[i >> 2]!, 16) & (8 >> (i & 3))) !== 0;
  return seen;
}

/** 階の形を確かめるための数（壁と床の並び、入口、階段から作る） */
export function mapCheck(map: FloorMap): number {
  let h = 2166136261;
  const mix = (n: number) => {
    h = Math.imul(h ^ n, 16777619) >>> 0;
  };
  mix(map.width);
  mix(map.height);
  for (const t of map.tiles) mix(t === 'wall' ? 1 : 2);
  for (const p of [map.start, map.stairs, map.boss]) {
    mix(p ? p.x + 1 : 0);
    mix(p ? p.y + 1 : 0);
  }
  return h;
}

function packFloor(floor: FloorMemory): PackedFloor {
  return { mapCheck: mapCheck(floor.map), seen: packSeen(floor.seen), enemies: floor.enemies, chests: floor.chests };
}

/** 探索の途中の状態を、保存する形にする */
export function packRun(base: SaveData, outcome: Departure, seed: number, state: ExploreState): RunSave {
  const { map, seen, visited, hits: _hits, cast: _cast, enemies, chests, ...rest } = state;
  return {
    version: RUN_SAVE_VERSION,
    base,
    outcome,
    seed,
    state: {
      ...rest,
      log: state.log.slice(-LOG_KEEP),
      current: packFloor({ map, seen, enemies, chests }),
      visited: Object.fromEntries(Object.entries(visited).map(([floor, memory]) => [floor, packFloor(memory)])),
    },
  };
}

// ===== 読み込み =====

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min;
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isItem = (v: unknown): v is ItemId => typeof v === 'string' && v in ITEMS;
const isItemOrNull = (v: unknown) => v === null || isItem(v);

function isFloorPos(map: FloorMap, v: unknown): v is Pos {
  if (!isObject(v) || !isCount(v.x) || !isCount(v.y)) return false;
  return v.x < map.width && v.y < map.height && map.tiles[v.y * map.width + v.x] === 'floor';
}

function isEnemy(map: FloorMap, v: unknown): v is MapEnemy {
  if (!isObject(v) || !isCount(v.uid) || typeof v.id !== 'string' || !(v.id in ENEMIES)) return false;
  if (typeof v.elite !== 'boolean' || typeof v.justNoticed !== 'boolean' || !isNumber(v.hp) || !isCount(v.searchTurns)) return false;
  if (v.mode !== 'wander' && v.mode !== 'chase' && v.mode !== 'search') return false;
  if (!isFloorPos(map, v.pos) || !(v.lastSeen === null || isFloorPos(map, v.lastSeen))) return false;
  const room = v.room;
  return room === undefined || (isObject(room) && isCount(room.x) && isCount(room.y) && isCount(room.width) && isCount(room.height));
}

function isChest(map: FloorMap, v: unknown): v is Chest {
  return isObject(v) && isFloorPos(map, v.pos) && isCount(v.gold) && isItemOrNull(v.item) && typeof v.opened === 'boolean';
}

/** 保存した階の様子を、作り直したマップと合わせて元に戻す。形が合わなければ null */
function unpackFloor(map: FloorMap, v: unknown): FloorMemory | null {
  if (!isObject(v) || v.mapCheck !== mapCheck(map) || typeof v.seen !== 'string') return null;
  const seen = unpackSeen(v.seen, map.tiles.length);
  if (!seen || !Array.isArray(v.enemies) || !Array.isArray(v.chests)) return null;
  if (!v.enemies.every((e) => isEnemy(map, e)) || !v.chests.every((c) => isChest(map, c))) return null;
  return { map, seen, enemies: v.enemies as MapEnemy[], chests: v.chests as Chest[] };
}

function isStats(v: unknown): v is ExploreState['stats'] {
  if (!isObject(v) || !isCount(v.hp, 1) || !isCount(v.maxHp, 1) || !isNumber(v.atk) || !isNumber(v.def) || !isCount(v.poisonTurns)) return false;
  if (!isItemOrNull(v.weapon) || !isItemOrNull(v.armor) || !Array.isArray(v.items) || !v.items.every(isItem)) return false;
  const e = v.enchant;
  return e === null || (isObject(e) && TRAIT_IDS.includes(e.element as TraitId) && isCount(e.hits));
}

/** 中断データのダンジョンの ID（ない古いデータは標準のダンジョン）。そのダンジョンがもうなければ null */
function dungeonIdOf(v: unknown): string | null {
  const id = v === undefined ? DEFAULT_DUNGEON_ID : v;
  return typeof id === 'string' && hasDungeon(id) ? id : null;
}

/** 出発したときに決まったこと。昔の中断データにあった knowledge・hasMap・carried（準備フェーズの結果）は、読み飛ばす */
function parseOutcome(v: unknown): Departure | null {
  if (!isObject(v) || !TRAIT_IDS.includes(v.trait as TraitId)) return null;
  const dungeon = dungeonIdOf(v.dungeon);
  if (!dungeon) return null;
  if (!Array.isArray(v.loadout) || !v.loadout.every(isItem)) return null;
  return { dungeon, trait: v.trait as TraitId, loadout: v.loadout };
}

/** 文字列から中断データを読む。形が合わない・続きから遊べないときは null */
export function parseRun(text: string | null): ResumedRun | null {
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(raw) || raw.version !== RUN_SAVE_VERSION || !isCount(raw.seed)) return null;
  const base = parseSave(JSON.stringify(raw.base));
  if (!base) return null;
  const outcome = parseOutcome(raw.outcome);
  const s = raw.state;
  if (!outcome || !isObject(s)) return null;

  // 数や決まった値
  if (s.outcome !== 'ongoing' || s.trait !== outcome.trait || typeof s.hasMap !== 'boolean') return null;
  if (dungeonIdOf(s.dungeon) !== outcome.dungeon) return null;
  const rooms = dungeonOf(outcome.dungeon).rooms;
  if (!isCount(s.seed) || !isCount(s.floor) || !isCount(s.floors, 1) || s.floor > s.floors) return null;
  if (!isCount(s.mapSize, 5) || s.mapSize > 200 || !isNumber(s.enemyDensity) || !isNumber(s.satiety) || !isNumber(s.maxSatiety)) return null;
  if (!isNumber(s.mp) || !isNumber(s.maxMp) || !isCount(s.gold) || !isCount(s.nextUid) || !isCount(s.defeated)) return null;
  if (!isCount(s.level, 1) || !isCount(s.exp) || !isCount(s.turn) || !isCount(s.rngState)) return null;
  if (!isStats(s.stats)) return null;
  if (!Array.isArray(s.spells) || !s.spells.every((id) => typeof id === 'string' && id in SPELLS)) return null;
  if (!Array.isArray(s.log) || !s.log.every((line) => typeof line === 'string')) return null;
  const regen = s.regen;
  if (!(regen === null || (isObject(regen) && isNumber(regen.amount) && isCount(regen.turns)))) return null;

  // 階の様子：マップを作り直して、保存したときと同じ形かを確かめる
  const floorOf = (floor: number) => mapOfFloor(s.seed as number, s.floors as number, s.mapSize as number, floor, rooms);
  const current = unpackFloor(floorOf(s.floor), s.current);
  if (!current || !isFloorPos(current.map, s.player) || !isObject(s.visited)) return null;
  const visited: Record<number, FloorMemory> = {};
  for (const [name, packed] of Object.entries(s.visited)) {
    const floor = Number(name);
    if (!isCount(floor) || floor > s.floors || floor === s.floor) return null;
    const memory = unpackFloor(floorOf(floor), packed);
    if (!memory) return null;
    visited[floor] = memory;
  }

  const state: ExploreState = {
    seed: s.seed,
    dungeon: outcome.dungeon,
    trait: outcome.trait,
    floor: s.floor,
    floors: s.floors,
    mapSize: s.mapSize,
    enemyDensity: s.enemyDensity,
    map: current.map,
    player: { x: s.player.x, y: s.player.y },
    stats: s.stats,
    satiety: s.satiety,
    maxSatiety: s.maxSatiety,
    spells: s.spells as SpellId[],
    mp: s.mp,
    maxMp: s.maxMp,
    regen: regen as ExploreState['regen'],
    cast: null,
    enemies: current.enemies,
    chests: current.chests,
    gold: s.gold,
    hasMap: s.hasMap,
    nextUid: s.nextUid,
    defeated: s.defeated,
    level: s.level,
    exp: s.exp,
    seen: current.seen,
    turn: s.turn,
    rngState: s.rngState,
    outcome: 'ongoing',
    log: s.log as string[],
    visited,
    hits: [],
  };
  return { base, outcome, seed: raw.seed, state };
}
