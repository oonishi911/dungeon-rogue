// マップ上の探索。プレイヤーの移動・霧（視界と記憶）・満腹度・階段・宝箱・敵との戦闘・ボス階を扱う。
// 1ターン = プレイヤーの行動 → 満腹度の消費 → 敵の手番。
// ほかのロジックと同じく、状態を受け取り新しい状態を返す純粋関数でできている。
// 階の数・広さ・満腹度・小部屋・敵の置き方と出る敵・レベルの上がり方・魔法は、遊んでいるダンジョンの設定（state.dungeon。dungeons.ts）で決まる。
//
// 型と数値は exploreTypes.ts、視界の計算は exploreSight.ts、魔法の計算（魔力・ダメージ・相性）は magic.ts にある。

import { buildPlayer, enemyHitDamage, playerHitDamage } from './combat';
import { COMBAT_CONFIG, enemyReward, expToNext, ITEMS, LOADOUT_CONFIG, REWARD_CONFIG, SPELLS, TRAITS, TRAIT_IDS, TREASURE_CONFIG } from './data';
import { DEFAULT_DUNGEON_ID, dungeonOf } from './dungeons';
import {
  DIR_DELTA,
  EXPLORE_CONFIG,
  type CastEvent,
  type Chest,
  type Dir,
  type ExploreAction,
  type ExploreOptions,
  type ExploreResult,
  type ExploreState,
  type FloorMemory,
  type HitEvent,
} from './exploreTypes';
import { canSee, samePos, visibleTiles } from './exploreSight';
import type { DungeonFile, RoomSettings } from './genMaster';
import { spellAffinity, spellDamage, startMagic } from './magic';
import {
  ENEMY_CONFIG,
  enemyDef,
  isAdjacent,
  key,
  nextStepToward,
  spawnBoss,
  spawnBossMinions,
  spawnEnemies,
  wanderStep,
  type MapEnemy,
} from './enemies';
import { generateBossFloor, generateFloor, tileAt, type FloorMap, type Pos } from './map';
import { floorParams, regenIntervalFor } from './floorParams';
import { nextInt, nextRandom } from './rng';
import type { EnemyId, ItemId, Result, SpellId, TraitId } from './types';

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

/** 遊んでいるダンジョンの設定 */
export function dungeonOfState(state: Pick<ExploreState, 'dungeon'>): DungeonFile {
  return dungeonOf(state.dungeon);
}

export function startExplore(seed: number, options: ExploreOptions = {}): ExploreState {
  const dungeon = options.dungeon ?? DEFAULT_DUNGEON_ID;
  const settings = dungeonOf(dungeon);
  const params = floorParams(settings.floors);
  const mapSize = options.mapSize ?? params.mapSize;
  const maxSatiety = options.maxSatiety ?? params.maxSatiety;
  const traitRoll = nextInt(seed, TRAIT_IDS.length);
  const state: ExploreState = {
    seed,
    dungeon,
    trait: options.trait ?? TRAIT_IDS[traitRoll.value]!,
    floor: 0,
    floors: options.floors ?? settings.floors.count,
    mapSize,
    enemyDensity: options.enemyDensity ?? params.enemyDensity,
    map: floorMap(seed, 0, mapSize, settings.rooms),
    player: { x: 0, y: 0 },
    stats: buildPlayer(options.loadout ?? []),
    satiety: maxSatiety,
    maxSatiety,
    ...startMagic(options.loadout ?? [], settings.magic),
    regen: null,
    cast: null,
    enemies: [],
    chests: [],
    gold: 0,
    nextUid: 0,
    defeated: 0,
    level: 1,
    exp: 0,
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
  state = { ...state, hits: [], cast: null };

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
    case 'cast': {
      const r = castSpell(state, action.spell, action.dir ?? null);
      if (!r.ok) return r;
      next = r.value;
      if (next.outcome !== 'ongoing') return ok({ ...next, turn: next.turn + 1 });
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
      const map = mapOfFloor(state.seed, state.floors, state.mapSize, floor, dungeonOfState(state).rooms);
      return ok(spendAction(enterFloor(left, floor, map)));
    }
    case 'retire': {
      // 1ターンも使わず、敵も動かないうちに出る
      return ok({ ...state, outcome: 'retired', log: [...state.log, 'リタイアして、ダンジョンを出た'] });
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

function floorMap(seed: number, floor: number, mapSize: number, rooms: RoomSettings): FloorMap {
  return generateFloor(floorSeed(seed, floor), { width: mapSize, height: mapSize, rooms });
}

/** その階のマップ。通常の階（0 から floors - 1）はシードから作り、その次はボス階。同じ値からは、いつも同じ形になる（rooms はダンジョンの設定の小部屋） */
export function mapOfFloor(seed: number, floors: number, mapSize: number, floor: number, rooms: RoomSettings): FloorMap {
  return floor >= floors ? generateBossFloor() : floorMap(seed, floor, mapSize, rooms);
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
  const settings = dungeonOfState(state);
  const encounter = settings.encounters[state.trait];
  const seen = new Array<boolean>(map.tiles.length).fill(false);

  if (map.boss) {
    // ボスは部屋の中を歩き、まわりには道中と同じ種類の雑魚敵がいる
    const boss = spawnBoss(map.boss, encounter.boss, state.nextUid, map.rooms[0]);
    const minions = spawnBossMinions(map, encounter.pool, settings.enemies.bossMinions, state.rngState, state.nextUid + 1, settings.enemies.stayInRoom);
    return reveal({
      ...state,
      floor,
      map,
      player: map.start,
      enemies: [boss, ...minions.enemies],
      chests: [],
      nextUid: state.nextUid + 1 + minions.enemies.length,
      rngState: minions.rngState,
      seen,
      log: [...state.log, '最深部に降りた。強い気配がする'],
    });
  }

  const spawned = spawnEnemies(map, encounter.pool, state.rngState, state.nextUid, state.enemyDensity, settings.enemies);
  const filled = fillChests(map, spawned.rngState);
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

/** マップの「宝箱」の行き止まりに中身を入れる。金貨は本道から遠いほど多く、道具は一定の確率で入る */
function fillChests(map: FloorMap, rngState: number): { chests: Chest[]; rngState: number } {
  let s = rngState;
  const chests: Chest[] = [];
  for (const f of map.features) {
    if (f.kind !== 'treasure') continue;
    const has = nextRandom(s);
    const pick = nextInt(has.state, TREASURE_CONFIG.items.length);
    s = pick.state;
    chests.push({
      pos: f.pos,
      gold: Math.round(f.depth * TREASURE_CONFIG.goldPerDepth),
      item: has.value < TREASURE_CONFIG.itemChance ? TREASURE_CONFIG.items[pick.value]! : null,
      opened: false,
    });
  }
  return { chests, rngState: s };
}

/**
 * 宝箱の上に乗ったら開ける。金貨は必ず取る。持ち物がいっぱいなら道具は残し、宝箱は閉じたままにする（道具を取るまで開いた形にしない）。
 * 空になった宝箱は、開いたままその場に残す
 */
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
    if (stats.items.length < LOADOUT_CONFIG.maxItems) {
      stats = { ...stats, items: [...stats.items, item] };
      log.push(`宝箱から${ITEMS[item].name}を手に入れた`);
      item = null;
    } else {
      log.push(`宝箱に${ITEMS[item].name}が入っているが、持ち物がいっぱいだ`);
    }
  }
  // 道具が残っているあいだは閉じたまま（次に乗ったとき、また取ろうとする）
  const chests = state.chests.map((c) => (c === chest ? { ...c, gold: 0, item, opened: item === null } : c));
  return { ...state, gold, stats, chests, log: [...state.log, ...log] };
}

/** 開けて、中身がもう何もない宝箱（道具を取るまでは開いた形にしないので、開いていれば空） */
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
    case 'spellbook':
      return err('呪文書は道具として使えません（呪文として唱える）');
    default: {
      const unreachable: never = effect;
      return unreachable;
    }
  }
}

// ===== 魔法 =====

/** 1行動ごとの、魔力の回復と再生の呪文の回復 */
function recoverMagic(state: ExploreState, turn: number): ExploreState {
  let { mp, regen, stats } = state;
  if (state.maxMp > 0 && mp < state.maxMp && turn % dungeonOfState(state).magic.regenEvery === 0) mp++;
  if (regen) {
    stats = { ...stats, hp: Math.min(stats.maxHp, stats.hp + regen.amount) };
    regen = regen.turns > 1 ? { ...regen, turns: regen.turns - 1 } : null;
  }
  return { ...state, mp, regen, stats };
}

function castSpell(state: ExploreState, spell: SpellId, dir: Dir | null): Result<ExploreState> {
  if (!state.spells.includes(spell)) return err('その呪文書は持っていません');
  const def = SPELLS[spell];
  const settings = dungeonOfState(state);
  const cfg = settings.spells[spell];
  const cost = cfg.cost ?? 0;
  if (state.mp < cost) return err('魔力が足りない');
  if (def.aim && !dir) return err('向きを選んでください');
  const event: CastEvent = { spell, dir: def.aim ? dir : null, path: [], moves: [], affinity: null };
  let s: ExploreState = { ...state, mp: state.mp - cost, cast: event, log: [...state.log, `${def.name}を唱えた`] };
  const { stats } = s;

  switch (def.effect.kind) {
    case 'heal': {
      if (stats.hp >= stats.maxHp) return err('HPは減っていない');
      const hp = Math.min(stats.maxHp, stats.hp + (cfg.amount ?? 0));
      s = { ...s, stats: { ...stats, hp }, log: [...s.log, `HPが${hp - stats.hp}回復`] };
      break;
    }
    case 'regen': {
      s = { ...s, regen: { amount: cfg.amount ?? 0, turns: cfg.turns ?? 1 }, log: [...s.log, `体が温かい光に包まれた（${cfg.turns}ターン）`] };
      break;
    }
    case 'bolt':
    case 'sweep': {
      // 向いた方向へ、壁に当たるか届くマス数まで進む。矢は最初の敵で止まり、なぎ払いは貫く
      const d = DIR_DELTA[dir!];
      const range = cfg.range ?? 1;
      const targets: MapEnemy[] = [];
      for (let i = 1; i <= range; i++) {
        const p = { x: s.player.x + d.x * i, y: s.player.y + d.y * i };
        if (tileAt(s.map, p) === 'wall') break;
        event.path.push(p);
        const enemy = s.enemies.find((e) => samePos(e.pos, p));
        if (enemy) {
          targets.push(enemy);
          if (def.effect.kind === 'bolt') break;
        }
      }
      if (targets.length === 0) s = { ...s, log: [...s.log, '何にも当たらなかった'] };
      if (def.effect.kind === 'bolt' && targets[0]) event.affinity = spellAffinity(spell, enemyDef(targets[0]));
      for (const t of targets) s = hurtEnemy(s, t.uid, spellDamage(s.stats, spell, enemyDef(t), settings));
      break;
    }
    case 'shockwave': {
      // まわり8マスの敵を、主人公から離れる向きへ吹き飛ばす。壁や敵にぶつかったら止まり、追加ダメージ。ボスは動かない
      const around = s.enemies.filter((e) => Math.max(Math.abs(e.pos.x - s.player.x), Math.abs(e.pos.y - s.player.y)) === 1);
      if (around.length === 0) s = { ...s, log: [...s.log, 'まわりに敵はいなかった'] };
      for (const t of around) {
        s = hurtEnemy(s, t.uid, spellDamage(s.stats, spell, enemyDef(t), settings));
        const target = s.enemies.find((e) => e.uid === t.uid);
        if (!target || s.outcome !== 'ongoing' || enemyDef(target).boss) continue;
        const d = { x: Math.sign(target.pos.x - s.player.x), y: Math.sign(target.pos.y - s.player.y) };
        let pos = target.pos;
        let crashed = false;
        for (let i = 0; i < (cfg.push ?? 0); i++) {
          const p = { x: pos.x + d.x, y: pos.y + d.y };
          if (tileAt(s.map, p) === 'wall' || s.enemies.some((e) => e.uid !== target.uid && samePos(e.pos, p)) || samePos(p, s.player)) {
            crashed = true;
            break;
          }
          pos = p;
        }
        if (!samePos(pos, target.pos)) {
          event.moves.push({ from: target.pos, to: pos });
          s = { ...s, enemies: s.enemies.map((e) => (e.uid === target.uid ? { ...e, pos } : e)) };
        }
        if (crashed && (cfg.crash ?? 0) > 0) {
          s = { ...s, log: [...s.log, `${enemyDef(target).name}は壁にぶつかった`] };
          s = hurtEnemy(s, target.uid, cfg.crash ?? 0);
        }
      }
      break;
    }
    default: {
      const unreachable: never = def.effect;
      return unreachable;
    }
  }

  // 唱える声で、近くのうろついている敵が気付く
  const radius = dungeonOfState(state).magic.noiseRadius;
  if (radius > 0 && s.outcome === 'ongoing') {
    s = {
      ...s,
      enemies: s.enemies.map((e) =>
        e.mode === 'wander' && Math.abs(e.pos.x - s.player.x) + Math.abs(e.pos.y - s.player.y) <= radius
          ? { ...e, mode: 'chase', justNoticed: true, lastSeen: s.player }
          : e,
      ),
    };
  }
  return ok(s);
}

/** 敵に魔法などでダメージを与える。倒したら報酬（ボスなら踏破）、倒れなければこちらに気付く */
function hurtEnemy(state: ExploreState, uid: number, dmg: number): ExploreState {
  const target = state.enemies.find((e) => e.uid === uid);
  if (!target || state.outcome !== 'ongoing') return state;
  const def = enemyDef(target);
  const hp = target.hp - dmg;
  const log = [...state.log, `${def.name}に${dmg}のダメージ`];
  state = { ...state, hits: [...state.hits, { kind: 'dealt', at: target.pos, amount: dmg }] };
  if (hp <= 0) {
    log.push(`${def.name}を倒した`);
    const defeated = { ...state, enemies: state.enemies.filter((e) => e.uid !== uid), defeated: state.defeated + 1 };
    if (def.boss) {
      const reward = TREASURE_CONFIG.bossGold;
      log.push(`報酬として金貨${reward}Gを手に入れた`, 'ダンジョンを踏破した');
      return { ...defeated, gold: state.gold + reward, outcome: 'cleared', log };
    }
    return defeatReward({ ...defeated, log }, target);
  }
  const hit: MapEnemy = { ...target, hp, mode: 'chase', justNoticed: target.mode === 'wander', lastSeen: state.player };
  return { ...state, enemies: state.enemies.map((e) => (e.uid === uid ? hit : e)), log };
}

// ===== 敵を倒したときの報酬 =====

/**
 * 通常の敵・強敵を倒したときの報酬：金貨、経験値（レベルアップ）、道具。
 * 道具は持ち物に入れ、いっぱいなら倒した場所に宝箱で残す。強敵は必ず宝箱を落とす（金貨と良い道具が入っている）
 */
function defeatReward(state: ExploreState, enemy: MapEnemy): ExploreState {
  const settings = dungeonOfState(state);
  const growth = settings.growth;
  const reward = enemyReward(enemy.id);
  const rate = enemy.elite ? growth.eliteRate : 1;
  const log = [...state.log];
  let s = state.rngState;
  let { stats } = state;
  let chests = state.chests;

  const gold = Math.round(reward.gold * rate);
  if (gold > 0) log.push(`金貨${gold}Gを手に入れた`);

  // 道具：強敵は必ず宝箱で、通常の敵は確率で落とす
  let item: ItemId | null = null;
  const items = enemy.elite ? REWARD_CONFIG.eliteItems : REWARD_CONFIG.dropItems;
  if (enemy.elite || reward.drop > 0) {
    const roll = nextRandom(s);
    const pick = nextInt(roll.state, items.length);
    s = pick.state;
    if (enemy.elite || roll.value * 100 < reward.drop) item = items[pick.value]!;
  }
  if (item && !enemy.elite && stats.items.length < LOADOUT_CONFIG.maxItems) {
    stats = { ...stats, items: [...stats.items, item] };
    log.push(`${ITEMS[item].name}を手に入れた`);
    item = null;
  }
  const chestGold = enemy.elite ? TREASURE_CONFIG.eliteGold : 0;
  if (item || chestGold > 0) {
    // 宝箱で残す（すでに宝箱があるマスなら、その宝箱に入れる）
    const here = chests.find((c) => samePos(c.pos, enemy.pos));
    if (here) {
      chests = chests.map((c) => (c === here ? { ...c, gold: c.gold + chestGold, item: c.item ?? item, opened: false } : c));
    } else {
      chests = [...chests, { pos: enemy.pos, gold: chestGold, item, opened: false }];
    }
    log.push(enemy.elite ? '宝箱を落とした' : `${ITEMS[item!].name}を落としたが、持ち物がいっぱいなので宝箱に残した`);
  }

  // 経験値とレベルアップ
  let { level, exp } = state;
  exp += Math.round(reward.exp * rate);
  while (level < growth.maxLevel && exp >= expToNext(level, growth)) {
    exp -= expToNext(level, growth);
    level++;
    stats = {
      ...stats,
      maxHp: stats.maxHp + growth.hpPerLevel,
      hp: stats.hp + growth.hpPerLevel,
      atk: stats.atk + growth.atkPerLevel,
    };
    log.push(`レベル${level}に上がった（最大HP+${growth.hpPerLevel}、攻撃+${growth.atkPerLevel}）`);
  }
  if (level >= growth.maxLevel) exp = 0;

  return { ...state, gold: state.gold + gold, stats, chests, level, exp, rngState: s, log };
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
    const defeated = { ...state, stats, enemies: state.enemies.filter((e) => e.uid !== target.uid), defeated: state.defeated + 1 };
    if (def.boss) {
      const reward = TREASURE_CONFIG.bossGold;
      log.push(`報酬として金貨${reward}Gを手に入れた`, 'ダンジョンを踏破した');
      return { ...defeated, gold: state.gold + reward, outcome: 'cleared', log };
    }
    return defeatReward({ ...defeated, log }, target);
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
    s = damagePlayer(s, enemyHitDamage(s.stats, def), `離れようとして、${def.name}に背後から攻撃された`, def.name, def.id);
    if (s.outcome !== 'ongoing') return s;
  }
  return s;
}

// ===== 敵の手番 =====

/**
 * 敵が1体ずつ行動する。
 * 1. プレイヤーが見えるか調べ、状態（うろつき・追跡・探索）を切り替える。気付いたターンは動かない
 * 2. 追跡中・探索中で隣にいれば攻撃し、そうでなければ移動する（強敵は動かない。ボスは歩く）
 */
function enemiesTurn(state: ExploreState): ExploreState {
  let s = state;
  // 敵の並びと「敵のいるマス」は、1体動かすたびに作り直さず、その場で書き換える。
  // （1体ごとに全員ぶんを作り直すと、敵が100体を超える広い階で、手間が敵の数の2乗になるため）
  const enemies = [...state.enemies];
  const playerKey = key(s.player);
  const crowd = new Map<string, number>(); // マスごとの敵の数
  for (const e of enemies) crowd.set(key(e.pos), (crowd.get(key(e.pos)) ?? 0) + 1);
  const blocked = new Set<string>([...crowd.keys(), playerKey]); // 通れないマス：敵と主人公
  const leave = (k: string) => {
    const left = (crowd.get(k) ?? 1) - 1;
    crowd.set(k, left);
    if (left <= 0 && k !== playerKey) blocked.delete(k);
  };
  const enter = (k: string) => {
    crowd.set(k, (crowd.get(k) ?? 0) + 1);
    blocked.add(k);
  };
  for (let i = 0; i < enemies.length; i++) {
    const current = enemies[i]!;
    const def = enemyDef(current);
    const sees = canSee(s.map, current.pos, s.player, ENEMY_CONFIG.sight);
    let e: MapEnemy = { ...current, justNoticed: false };

    if (sees) {
      if (e.mode !== 'chase') {
        // 気付いたターンは身構えるだけで動かない。プレイヤーに対応する猶予を与える
        // 記録には書かない（気付いたことは、頭上の「！」で見せる）
        enemies[i] = { ...e, mode: 'chase', justNoticed: true, lastSeen: s.player };
        continue;
      }
      e = { ...e, lastSeen: s.player };
    } else if (e.mode === 'chase') {
      e = { ...e, mode: 'search', searchTurns: ENEMY_CONFIG.loseTurns };
    } else if (e.mode === 'search') {
      e = { ...e, searchTurns: e.searchTurns - 1 };
      if (e.searchTurns <= 0) {
        // 見失ったことも、記録には書かない
        e = { ...e, mode: 'wander', lastSeen: null, searchTurns: 0 };
      }
    }

    // 攻撃
    if (e.mode !== 'wander' && isAdjacent(e.pos, s.player)) {
      enemies[i] = e;
      s = damagePlayer(s, enemyHitDamage(s.stats, def), `${def.name}の攻撃`, def.name, def.id);
      if (s.outcome !== 'ongoing') return { ...s, enemies };
      continue;
    }

    // 移動（自分のいるマスは、自分にとっては通れないマスに数えない）。強敵はその場から動かないが、ボスは歩いて追ってくる
    if (!e.elite || def.boss) {
      leave(key(e.pos));
      if (e.mode !== 'wander' && e.lastSeen && !samePos(e.pos, e.lastSeen)) {
        const nextPos = nextStepToward(s.map, e.pos, e.lastSeen, blocked);
        if (nextPos && !samePos(nextPos, s.player)) e = { ...e, pos: nextPos };
      } else {
        const moved = wanderStep(s.map, e.pos, blocked, s.rngState, e.room);
        s = { ...s, rngState: moved.rngState };
        e = { ...e, pos: moved.pos };
      }
      enter(key(e.pos));
    }
    enemies[i] = e;
  }
  return { ...s, enemies };
}

function damagePlayer(state: ExploreState, dmg: number, message: string, by: string, enemy?: EnemyId): ExploreState {
  const hp = Math.max(0, state.stats.hp - dmg);
  const log = [...state.log, `${message}で${dmg}のダメージ`];
  const hit: HitEvent = enemy ? { kind: 'taken', at: state.player, amount: dmg, by: enemy } : { kind: 'taken', at: state.player, amount: dmg };
  state = { ...state, hits: [...state.hits, hit] };
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
  state = recoverMagic(poisoned, state.turn + 1);
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

export function toResult(state: ExploreState): ExploreResult {
  const cleared = state.outcome === 'cleared';
  return {
    outcome: cleared ? 'cleared' : state.outcome === 'retired' ? 'retired' : 'defeated',
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

