// マップ上の探索。プレイヤーの移動・霧（視界と記憶）・満腹度・階段・宝箱・敵との戦闘・ボス階を扱う。
// 1ターン = プレイヤーの行動 → 満腹度の消費 → 敵の手番。
// ほかのロジックと同じく、状態を受け取り新しい状態を返す純粋関数でできている。

import { buildPlayer, enemyHitDamage, playerHitDamage } from './combat';
import { COMBAT_CONFIG, ITEMS, PREP_CONFIG, TRAITS, TRAIT_IDS, TREASURE_CONFIG } from './data';
import {
  ENEMY_CONFIG,
  enemyDef,
  isAdjacent,
  key,
  nextStepToward,
  spawnBoss,
  spawnEnemies,
  wanderStep,
  type MapEnemy,
} from './enemies';
import { generateBossFloor, generateFloor, tileAt, type FloorMap, type Pos } from './map';
import { rankParams, regenIntervalFor } from './rank';
import { nextInt, nextRandom } from './rng';
import type { ItemId, PlayerStats, Result, TraitId } from './types';

// 数値はすべて仮。バランス調整で見直す
export const EXPLORE_CONFIG = {
  floors: 3, // 通常の階の数。その下にボス階がある
  sightRadius: 6, // 視界の半径（マス）
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

/** 移動先に敵がいれば、移動ではなく攻撃になる（体当たり方式）。道具を使うのも1行動 */
export type ExploreAction =
  | { kind: 'move'; dir: Dir }
  | { kind: 'wait' }
  | { kind: 'descend' }
  | { kind: 'ascend' } // 上り階段（2階目からの入口）から、1つ上の階へ戻る
  | { kind: 'use_item'; item: ItemId };

export type ExploreOutcome = 'ongoing' | 'cleared' | 'defeated';

/** 宝箱。持ち物がいっぱいで道具を取れなかったときは、道具だけ残る */
export interface Chest {
  pos: Pos;
  gold: number;
  item: ItemId | null;
  /** 開けたか。開けた宝箱は、空になってもその場に残す（開いた形で描く） */
  opened: boolean;
}

/** この行動で入ったダメージ。画面に数字を出すために使う（ルールには使わない） */
export interface HitEvent {
  kind: 'dealt' | 'taken'; // dealt：プレイヤーが敵に与えた / taken：プレイヤーが受けた
  at: Pos; // ダメージを受けた側がいたマス
  amount: number;
}

/** 一度離れた階の様子。戻ってきたら、倒した敵・開けた宝箱・晴れた霧はそのまま */
export interface FloorMemory {
  map: FloorMap;
  enemies: MapEnemy[];
  chests: Chest[];
  seen: boolean[];
}

export interface ExploreState {
  seed: number;
  trait: TraitId;
  rank: number; // 広さ・満腹度の上限・敵の数・報酬が決まる
  floor: number; // 0始まり。floors と同じならボス階
  floors: number; // 通常の階の数
  mapSize: number;
  enemyDensity: number;
  map: FloorMap;
  player: Pos;
  stats: PlayerStats; // HP・攻撃力・装備
  satiety: number;
  maxSatiety: number;
  enemies: MapEnemy[];
  chests: Chest[]; // この階の宝箱（開けて空になったものも残す）
  gold: number; // この挑戦で手に入れた金貨
  hasMap: boolean; // 地図があれば、各階の入口から階段までの道筋が最初から見える
  nextUid: number;
  defeated: number; // 倒した敵の数
  seen: boolean[]; // この階で一度でも見えたマス（霧が晴れた場所）
  turn: number; // 行動した回数
  rngState: number;
  outcome: ExploreOutcome;
  log: string[];
  visited: Record<number, FloorMemory>; // 一度離れた階（階の番号ごと）。今いる階は入らない
  hits: HitEvent[]; // 直前の行動で入ったダメージ（行動のたびに空からやり直す）
}

export interface ExploreOptions {
  floors?: number;
  rank?: number; // 省略時は1。広さ・満腹度・敵の密度は、個別に指定するとそちらが優先される
  mapSize?: number;
  maxSatiety?: number;
  trait?: TraitId; // 省略時はシードから決める
  loadout?: readonly ItemId[];
  enemyDensity?: number;
  hasMap?: boolean;
}

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T>(error: string): Result<T> => ({ ok: false, error });

/** 階ごとのマップのシード。同じ挑戦なら同じ並びになる */
export function floorSeed(seed: number, floor: number): number {
  return (seed + Math.imul(floor + 1, 0x9e3779b1)) >>> 0;
}

/** シードから決まるダンジョンの特性（startExplore で特性を指定しなかったときと同じ） */
export function traitForSeed(seed: number): TraitId {
  return TRAIT_IDS[nextInt(seed, TRAIT_IDS.length).value]!;
}

export function startExplore(seed: number, options: ExploreOptions = {}): ExploreState {
  const params = rankParams(options.rank ?? 1);
  const mapSize = options.mapSize ?? params.mapSize;
  const maxSatiety = options.maxSatiety ?? params.maxSatiety;
  const traitRoll = nextInt(seed, TRAIT_IDS.length);
  const state: ExploreState = {
    seed,
    trait: options.trait ?? TRAIT_IDS[traitRoll.value]!,
    rank: params.rank,
    floor: 0,
    floors: options.floors ?? EXPLORE_CONFIG.floors,
    mapSize,
    enemyDensity: options.enemyDensity ?? params.enemyDensity,
    map: floorMap(seed, 0, mapSize),
    player: { x: 0, y: 0 },
    stats: buildPlayer(options.loadout ?? []),
    satiety: maxSatiety,
    maxSatiety,
    enemies: [],
    chests: [],
    gold: 0,
    hasMap: options.hasMap ?? false,
    nextUid: 0,
    defeated: 0,
    seen: [],
    turn: 0,
    rngState: traitRoll.state,
    outcome: 'ongoing',
    log: [],
    visited: {},
    hits: [],
  };
  return enterFloor(state, 0, state.map);
}

/** 1行動進める。壁への移動など行動にならない操作はエラーを返し、ターンも満腹度も消費しない */
export function step(state: ExploreState, action: ExploreAction): Result<ExploreState> {
  if (state.outcome !== 'ongoing') return err('探索は終わっています');
  state = { ...state, hits: [] };

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
        next = openChest(reveal({ ...next, player: to }));
      }
      break;
    }
    case 'wait': {
      next = state;
      break;
    }
    case 'use_item': {
      const r = useItem(state, action.item);
      if (!r.ok) return r;
      next = r.value;
      break;
    }
    case 'descend': {
      if (!state.map.stairs || !samePos(state.player, state.map.stairs)) return err('ここに階段はない');
      // 最後の通常の階の階段はボス階へ続く。階を移ったターンは敵が動かない。
      // 一度来たことのある階なら、離れたときの様子のまま、上り階段（入口）に立つ
      const floor = state.floor + 1;
      const left = leaveFloor(state);
      const memory = state.visited[floor];
      if (memory) return ok(spendAction(returnToFloor(left, floor, memory, memory.map.start, `地下${floor + 1}階に降りた`)));
      const map = floor >= state.floors ? generateBossFloor() : floorMap(state.seed, floor, state.mapSize);
      return ok(spendAction(enterFloor(left, floor, map)));
    }
    case 'ascend': {
      const up = upStairs(state);
      if (!up || !samePos(state.player, up)) return err('ここに上り階段はない');
      // 1つ上の階の、下り階段の上に戻る。上の階は必ず一度通っているので、離れたときの様子のまま
      const floor = state.floor - 1;
      const memory = state.visited[floor]!;
      return ok(spendAction(returnToFloor(leaveFloor(state), floor, memory, memory.map.stairs!, `地下${floor + 1}階に戻った`)));
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

/** 上り階段の場所。2階目からは、降りてきた入口が上り階段になる（1階目の入口はダンジョンの外への出口なので上れない） */
export function upStairs(state: Pick<ExploreState, 'floor' | 'map'>): Pos | null {
  return state.floor > 0 ? state.map.start : null;
}

/** 今の階の様子を覚えて、階を離れる準備をする */
function leaveFloor(state: ExploreState): ExploreState {
  const memory: FloorMemory = { map: state.map, enemies: state.enemies, chests: state.chests, seen: state.seen };
  return { ...state, visited: { ...state.visited, [state.floor]: memory } };
}

/** 一度離れた階に戻る。敵は追うのをやめ、うろつきに戻っている */
function returnToFloor(state: ExploreState, floor: number, memory: FloorMemory, at: Pos, message: string): ExploreState {
  const visited = { ...state.visited };
  delete visited[floor]; // 今いる階は覚えておく一覧に入れない
  const enemies = memory.enemies.map((e) => ({ ...e, mode: 'wander' as const, justNoticed: false, lastSeen: null, searchTurns: 0 }));
  return reveal({
    ...state,
    floor,
    map: memory.map,
    player: at,
    enemies,
    chests: memory.chests,
    seen: memory.seen,
    visited,
    log: [...state.log, message],
  });
}

/** 新しい階に入る：入口に立ち、敵と宝箱を配置し、霧をリセットする。地図があれば本道は最初から見える */
function enterFloor(state: ExploreState, floor: number, map: FloorMap): ExploreState {
  const seen = new Array<boolean>(map.tiles.length).fill(false);
  if (state.hasMap) for (const p of map.mainPath) seen[p.y * map.width + p.x] = true;

  if (map.boss) {
    const boss = spawnBoss(map.boss, state.trait, state.nextUid);
    return reveal({
      ...state,
      floor,
      map,
      player: map.start,
      enemies: [boss],
      chests: [],
      nextUid: state.nextUid + 1,
      seen,
      log: [...state.log, '最深部に降りた。強い気配がする'],
    });
  }

  const spawned = spawnEnemies(map, state.trait, state.rngState, state.nextUid, state.enemyDensity);
  const filled = fillChests(map, spawned.rngState, rankParams(state.rank).chestGoldRate);
  return reveal({
    ...state,
    floor,
    map,
    player: map.start,
    enemies: spawned.enemies,
    chests: filled.chests,
    nextUid: state.nextUid + spawned.enemies.length,
    rngState: filled.rngState,
    seen,
    log: [...state.log, `地下${floor + 1}階に降りた`],
  });
}

export function isBossFloor(state: ExploreState): boolean {
  return state.floor >= state.floors;
}

// ===== 宝箱 =====

/** マップの「宝箱」の行き止まりに中身を入れる。金貨は本道から遠いほど、ランクが高いほど多く、道具は一定の確率で入る */
function fillChests(map: FloorMap, rngState: number, goldRate: number): { chests: Chest[]; rngState: number } {
  let s = rngState;
  const chests: Chest[] = [];
  for (const f of map.features) {
    if (f.kind !== 'treasure') continue;
    const has = nextRandom(s);
    const pick = nextInt(has.state, TREASURE_CONFIG.items.length);
    s = pick.state;
    chests.push({
      pos: f.pos,
      gold: Math.round(f.depth * TREASURE_CONFIG.goldPerDepth * goldRate),
      item: has.value < TREASURE_CONFIG.itemChance ? TREASURE_CONFIG.items[pick.value]! : null,
      opened: false,
    });
  }
  return { chests, rngState: s };
}

/** 宝箱の上に乗ったら開ける。持ち物がいっぱいなら道具は残す。空になった宝箱は、開いたままその場に残す */
function openChest(state: ExploreState): ExploreState {
  const chest = state.chests.find((c) => samePos(c.pos, state.player));
  if (!chest || isEmptyChest(chest)) return state;
  const log: string[] = [];
  let { gold, stats } = state;
  let item = chest.item;
  if (chest.gold > 0) {
    gold += chest.gold;
    log.push(`宝箱から金貨${chest.gold}Gを手に入れた`);
  }
  if (item) {
    if (stats.items.length < PREP_CONFIG.maxItems) {
      stats = { ...stats, items: [...stats.items, item] };
      log.push(`宝箱から${ITEMS[item].name}を手に入れた`);
      item = null;
    } else {
      log.push(`宝箱に${ITEMS[item].name}が入っているが、持ち物がいっぱいだ`);
    }
  }
  const chests = state.chests.map((c) => (c === chest ? { ...c, gold: 0, item, opened: true } : c));
  return { ...state, gold, stats, chests, log: [...state.log, ...log] };
}

/** 開けて、中身がもう何もない宝箱 */
export function isEmptyChest(chest: Chest): boolean {
  return chest.opened && chest.gold === 0 && chest.item === null;
}

// ===== 道具 =====

function useItem(state: ExploreState, itemId: ItemId): Result<ExploreState> {
  const { stats } = state;
  const index = stats.items.indexOf(itemId);
  if (index === -1) return err('その道具は持っていません');
  const item = ITEMS[itemId];
  const items = stats.items.filter((_, i) => i !== index);
  const effect = item.effect;

  switch (effect.kind) {
    case 'heal': {
      if (stats.hp >= stats.maxHp) return err('HPは減っていない');
      const hp = Math.min(stats.maxHp, stats.hp + effect.hp);
      return ok({ ...state, stats: { ...stats, hp, items }, log: [...state.log, `${item.name}でHPが${hp - stats.hp}回復`] });
    }
    case 'food': {
      if (state.satiety >= state.maxSatiety) return err('お腹はいっぱいだ');
      const satiety = Math.min(state.maxSatiety, state.satiety + effect.satiety);
      return ok({
        ...state,
        satiety,
        stats: { ...stats, items },
        log: [...state.log, `${item.name}を食べて満腹度が${satiety - state.satiety}回復`],
      });
    }
    case 'enchant': {
      // 付けられる属性は1つだけ。新しく付けると上書きする
      const holder = stats.weapon ? ITEMS[stats.weapon].name : '拳';
      return ok({
        ...state,
        stats: { ...stats, items, enchant: { element: effect.element, hits: effect.hits } },
        log: [...state.log, `${item.name}で${holder}に${TRAITS[effect.element].name}の力が宿った（攻撃${effect.hits}回）`],
      });
    }
    case 'weapon':
    case 'armor':
      return err('装備品は道具として使えません');
    default: {
      const unreachable: never = effect;
      return unreachable;
    }
  }
}

// ===== プレイヤーの攻撃 =====

/** 体当たりで攻撃する。気付いていない敵なら不意打ちになる */
function playerAttack(state: ExploreState, target: MapEnemy): ExploreState {
  const def = enemyDef(target);
  const surprise = target.mode === 'wander';
  const dmg = playerHitDamage(state.stats, def) * (surprise ? ENEMY_CONFIG.surpriseMultiplier : 1);
  const hp = target.hp - dmg;
  const log = [...state.log, surprise ? `${def.name}に不意打ち！ ${dmg}のダメージ` : `${def.name}に${dmg}のダメージ`];
  state = { ...state, hits: [...state.hits, { kind: 'dealt', at: target.pos, amount: dmg }] };

  // 属性付与はダメージを計算したあとで1回減らし、0回になると消える
  let stats = state.stats;
  if (stats.enchant) {
    const hits = stats.enchant.hits - 1;
    if (hits <= 0) log.push(`武器から${TRAITS[stats.enchant.element].name}の力が消えた`);
    stats = { ...stats, enchant: hits > 0 ? { ...stats.enchant, hits } : null };
  }

  if (hp <= 0) {
    log.push(`${def.name}を倒した`);
    let gold = state.gold;
    if (def.boss) {
      const reward = rankParams(state.rank).bossGold;
      gold += reward;
      log.push(`報酬として金貨${reward}Gを手に入れた`, 'ダンジョンを踏破した');
    } else if (target.elite) {
      gold += TREASURE_CONFIG.eliteGold;
      log.push(`金貨${TREASURE_CONFIG.eliteGold}Gを手に入れた`);
    }
    return {
      ...state,
      stats,
      gold,
      enemies: state.enemies.filter((e) => e.uid !== target.uid),
      defeated: state.defeated + 1,
      outcome: def.boss ? 'cleared' : state.outcome,
      log,
    };
  }
  // 攻撃された敵はこちらに気付く
  const hit: MapEnemy = { ...target, hp, mode: 'chase', justNoticed: surprise, lastSeen: state.player };
  return { ...state, stats, enemies: state.enemies.map((e) => (e.uid === target.uid ? hit : e)), log };
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
  state = { ...state, hits: [...state.hits, { kind: 'taken', at: state.player, amount: dmg }] };
  if (hp === 0) {
    return { ...state, stats: { ...state.stats, hp }, outcome: 'defeated', log: [...log, `${by}に倒された…`] };
  }
  return { ...state, stats: { ...state.stats, hp }, log };
}

// ===== 満腹度 =====

/** 1行動ぶん満腹度を減らす。満腹度が残っていればHPが少しずつ回復し、0ならHPが減る */
function spendAction(state: ExploreState): ExploreState {
  const poisoned = applyPoison(state);
  if (poisoned.outcome !== 'ongoing') return { ...poisoned, turn: poisoned.turn + 1 };
  state = poisoned;
  const turn = state.turn + 1;
  const { stats } = state;
  if (state.satiety > 0) {
    const satiety = Math.max(0, state.satiety - EXPLORE_CONFIG.satietyPerAction);
    const log = satiety === 0 ? [...state.log, '空腹で力が出ない…'] : state.log;
    // 回復の間隔はマップの広さで決まる（狭いほど速い）
    const regen = turn % regenIntervalFor(state.mapSize) === 0 && stats.hp < stats.maxHp ? 1 : 0;
    return { ...state, turn, satiety, stats: { ...stats, hp: stats.hp + regen }, log };
  }
  const hp = Math.max(0, stats.hp - EXPLORE_CONFIG.starveDamage);
  if (hp === 0) {
    return { ...state, turn, stats: { ...stats, hp }, outcome: 'defeated', log: [...state.log, '飢えて力尽きた…'] };
  }
  return { ...state, turn, stats: { ...stats, hp } };
}

/** 毒の仕組み（今は毒を与える敵はいないが、状態異常として残している） */
function applyPoison(state: ExploreState): ExploreState {
  const { stats } = state;
  if (stats.poisonTurns <= 0) return state;
  const next = { ...stats, poisonTurns: stats.poisonTurns - 1 };
  return damagePlayer({ ...state, stats: next }, COMBAT_CONFIG.poisonDamage, '毒', '毒');
}

// ===== 結果 =====

export interface ExploreResult {
  outcome: 'cleared' | 'defeated';
  floorReached: number; // 1始まり
  bossFloor: boolean; // ボス階までたどり着いたか
  defeated: number;
  gold: number; // 手に入れた金貨
  goldBrought: number; // 持ち帰った金貨。踏破すれば全額、力尽きたら一部
}

export function toResult(state: ExploreState): ExploreResult {
  const cleared = state.outcome === 'cleared';
  return {
    outcome: cleared ? 'cleared' : 'defeated',
    floorReached: state.floor + 1,
    bossFloor: isBossFloor(state),
    defeated: state.defeated,
    gold: state.gold,
    goldBrought: cleared ? state.gold : Math.floor(state.gold * TREASURE_CONFIG.keepOnDefeat),
  };
}

// ===== 視界 =====

/** 今の位置から見えるマスを、この階の記憶に加える */
function reveal(state: ExploreState): ExploreState {
  const seen = [...state.seen];
  for (const i of visibleTiles(state.map, state.player, EXPLORE_CONFIG.sightRadius)) seen[i] = true;
  return { ...state, seen };
}

/**
 * 主人公の視界：from から半径 radius 以内のマスの番号。壁にさえぎられず、壁の向こうや曲がり角の先も見える。
 * 敵の視界は canSee で、こちらは今までどおり壁にさえぎられる。
 */
export function visibleTiles(map: FloorMap, from: Pos, radius: number): Set<number> {
  const result = new Set<number>();
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = from.x + dx;
      const y = from.y + dy;
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      // 主人公の視界は壁にさえぎられない（壁の向こう・曲がり角の先も、半径以内ならすべて見える）
      if (dx * dx + dy * dy <= radius * radius) result.add(y * map.width + x);
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
