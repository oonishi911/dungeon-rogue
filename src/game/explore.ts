// マップ上の探索。プレイヤーの移動・霧（視界と記憶）・満腹度・階段・宝箱・敵との戦闘・ボス階を扱う。
// 1ターン = プレイヤーの行動 → 満腹度の消費 → 敵の手番。
// ほかのロジックと同じく、状態を受け取り新しい状態を返す純粋関数でできている。
// 階の数・広さ・満腹度・小部屋・敵の置き方と出る敵・レベルの上がり方・魔法は、遊んでいるダンジョンの設定（state.dungeon。dungeons.ts）で決まる。
//
// 型と数値は exploreTypes.ts、視界の計算は exploreSight.ts、魔法の計算（魔力・ダメージ・相性）は magic.ts にある。

import { BOSS_CONFIG, phaseOf, phaseSow, PHASE_MAX } from './bossPhase';
import { buildPlayer, enemyHitDamage, hitAffinity, itemCapacity, playerHitDamage, swapWeapons, weaponTypeOf } from './combat';
import { gearName, lootSeed, noFound, rollLoot, satietySaving, savesSatiety } from './echo';
import { echoName } from './echo';
import { enemyBase, enemyReward, expToNext, ITEMS, REWARD_CONFIG, SPELLS, STATUS_MASTER, TRAITS, TRAIT_IDS, TREASURE_CONFIG } from './data';
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
  type Field,
  type HitEvent,
} from './exploreTypes';
import { alarmTargets, chargeRun, guardsAgainst, minionTile, retreatStep, stepDir, straightLine, weakestOf } from './enemyBehavior';
import { canSee, samePos, visibleTiles } from './exploreSight';
import { SKILL_CONFIG, skillOf } from './weaponSkill';
import { afflict, cureAll, statusNames } from './status';
import { applyFoeStatus, burnRemaining, extinguish, foeImmune, foeKindOf, scaled, thaw, whetstoneChance, type ComboKind, type FoeStatusKind } from './foeStatus';
import { around9, FIELD_CONFIG, fieldAt, immuneToField, placeField, tickFields, type FieldKind } from './fields';
import type { DungeonFile, GrowthSettings, RoomSettings } from './genMaster';
import { magicPower, spellAffinity, spellDamage, startMagic } from './magic';
import {
  behaviorsOf,
  eliteArea,
  ENEMY_CONFIG,
  enemyDef,
  fromHome,
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
import { floorParams } from './floorParams';
import { nextInt, nextRandom, shuffle } from './rng';
import type { Element, EnemyDef, EnemyId, ItemId, PlayerStats, Result, SpellId, TraitId } from './types';
import { lost } from './story';

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
    stats: startStats(buildPlayer(options.loadout ?? [], options.echoes), settings.growth),
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
    sightRadius: sightRadiusOf(options.loadout ?? []),
    maxItems: itemCapacity(options.loadout ?? []),
    turn: 0,
    rngState: traitRoll.state,
    outcome: 'ongoing',
    log: [],
    visited: {},
    hits: [],
    foes: [],
    skill: 0,
    fields: [],
    found: noFound(),
  };
  return enterFloor(state, 0, state.map);
}

/** ダンジョンに入ったときのHPと最大HP（そのダンジョンの設定 growth.startHp・startMaxHp）にする。HPは最大HPを超えない */
export function startStats(stats: PlayerStats, growth: Pick<GrowthSettings, 'startHp' | 'startMaxHp'>): PlayerStats {
  return { ...stats, maxHp: growth.startMaxHp, hp: Math.min(growth.startHp, growth.startMaxHp) };
}

/** 持っていくものから決まる、視界の半径（視界を広げる道具がなければ EXPLORE_CONFIG.sightRadius） */
export function sightRadiusOf(loadout: readonly ItemId[]): number {
  return loadout.reduce<number>((r, id) => {
    const e = ITEMS[id].effect;
    return e.kind === 'sight' ? Math.max(r, e.radius) : r;
  }, EXPLORE_CONFIG.sightRadius);
}

/** 1行動進める。壁への移動など行動にならない操作はエラーを返し、ターンも満腹度も消費しない */
export function step(state: ExploreState, action: ExploreAction): Result<ExploreState> {
  if (state.outcome !== 'ongoing') return err('探索は終わっています');
  state = { ...state, hits: [], foes: [], cast: null };

  let next: ExploreState;
  let slowed = false; // 霜の床から歩き出すか、鈍足のあいだは、その1歩に2ターンかかる
  let chilled = false; // 鈍足で歩いた1歩（終わったら、残りの歩数が1減る）
  let bleedSkip: readonly Pos[] = []; // 出血させたターンは、まだ出血のダメージを受けない敵のいるマス
  switch (action.kind) {
    case 'move': {
      const d = DIR_DELTA[action.dir];
      const to = { x: state.player.x + d.x, y: state.player.y + d.y };
      if (tileAt(state.map, to) === 'wall') return err('壁があって進めない');
      const target = state.enemies.find((e) => samePos(e.pos, to));
      if (target) {
        next = playerAttack(state, target);
      } else {
        chilled = (state.stats.chillSteps ?? 0) > 0;
        slowed = chilled || fieldAt(state.fields, state.player)?.kind === 'frost';
        next = backAttacks(state, to);
        if (next.outcome !== 'ongoing') return ok({ ...next, turn: next.turn + 1 });
        next = openChest(reveal({ ...next, player: to }));
        if (chilled) next = stepChill(next);
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
      bleedSkip = next.cast?.bleeding ?? [];
      if (next.outcome !== 'ongoing') return ok({ ...next, turn: next.turn + 1 });
      break;
    }
    case 'skill': {
      const r = useSkill(state, action.dir ?? null);
      if (!r.ok) return r;
      next = r.value;
      bleedSkip = next.foes.flatMap((f) => (f.kind === 'skill' && f.weapon === 'sword' ? f.path : []));
      if (next.outcome !== 'ongoing') return ok({ ...next, turn: next.turn + 1 });
      break;
    }
    case 'swap': {
      // 持ち替え：武器・残響・技ゲージが入れ替わる。1ターンかかる（敵は動く）
      const swapped = swapWeapons(state.stats, state.skill);
      if (!swapped) return err('サブ武器がない');
      const from = state.stats.weapon!;
      next = { ...state, stats: swapped.stats, skill: swapped.skill, log: [...state.log, `${ITEMS[from].name}から${ITEMS[swapped.stats.weapon!].name}に持ち替えた`] };
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

  next = passTurn(next, bleedSkip);
  if (slowed && next.outcome === 'ongoing') next = passTurn(next, []);
  return ok(next);
}

/** 鈍足で歩いた1歩ぶん、残りの歩数を減らす（0になったら治る） */
function stepChill(state: ExploreState): ExploreState {
  const left = Math.max(0, (state.stats.chillSteps ?? 0) - 1);
  const { chillSteps: _chill, ...rest } = state.stats;
  return { ...state, stats: left > 0 ? { ...rest, chillSteps: left } : rest, log: left > 0 ? state.log : [...state.log, '足が軽くなった'] };
}

/** 1ターン進める：満腹度・出血・燃焼・敵の動き・床の跡の順 */
function passTurn(state: ExploreState, bleeding: readonly Pos[]): ExploreState {
  let s = spendAction(state);
  if (s.outcome !== 'ongoing') return s;
  s = bleedTurn(s, bleeding);
  if (s.outcome !== 'ongoing') return s;
  // 燃やしたターンは、まだ燃焼のダメージを受けない（出血と同じ）
  s = burnTurn(s, s.foes.flatMap((f) => (f.kind === 'foe_status' && f.status === 'burn' ? [f.at] : [])));
  if (s.outcome !== 'ongoing') return s;
  s = phaseUp(s);
  s = enemiesTurn(s);
  if (s.outcome !== 'ongoing') return s;
  return fieldsTurn(s);
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
  const enemies = memory.enemies.map(({ stun: _stun, bleed: _bleed, burn: _burn, frozen: _frozen, chilled: _chilled, ...e }) => ({ ...e, mode: 'wander' as const, justNoticed: false, lastSeen: null, searchTurns: 0 }));
  return reveal({
    ...state,
    floor,
    map: memory.map,
    player: at,
    enemies,
    chests: memory.chests,
    seen: memory.seen,
    fields: [],
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
      fields: [],
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
    fields: [],
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
    log.push(`宝箱から忘れ物を拾った（${lost(chest.gold)}）`);
  }
  if (item) {
    if (stats.items.length < state.maxItems) {
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
    case 'cure': {
      const cured = cureAll(stats);
      if (!cured) return err('毒も鈍足も受けていない');
      return ok({ ...state, stats: { ...cured.stats, items }, log: [...state.log, `${item.name}で、${statusNames(cured.cured)}が治った`] });
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
    case 'ring':
      return err('装備品は道具として使えません');
    case 'spellbook':
      return err('呪文書は道具として使えません（呪文として唱える）');
    case 'sight':
    case 'capacity':
      return err('持っていくだけで効く道具です');
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
  const event: CastEvent = { spell, dir: def.aim ? dir : null, path: [], moves: [], stunned: [], bleeding: [], splash: [], affinity: null };
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
      // 炎・氷の矢は、当たった敵の足元に燃える床・霜の床を残す（連矢は、まわり8マスにも）
      const fieldKind = def.effect.kind === 'bolt' ? fieldOfElement(def.effect.element) : null;
      const hitAt = def.effect.kind === 'bolt' ? targets[0]?.pos : undefined;
      if (fieldKind && hitAt) s = addFields(s, def.effect.kind === 'bolt' && def.effect.splash ? around9(hitAt) : [hitAt], fieldKind);
      // 連矢：最初に当たった敵のまわり8マスの敵にも、その敵に与えるダメージの一部（splash の割合）を与える
      const center = def.effect.kind === 'bolt' && def.effect.splash ? targets[0] : undefined;
      const around = center ? s.enemies.filter((e) => e.uid !== center.uid && Math.max(Math.abs(e.pos.x - center.pos.x), Math.abs(e.pos.y - center.pos.y)) === 1) : [];
      const centerDamage = center ? spellDamage(s.stats, spell, enemyDef(center), settings) : 0;
      for (const t of targets) {
        const b = staffBoost(s, t.uid, spellDamage(s.stats, spell, enemyDef(t), settings));
        const a = def.effect.kind === 'bolt' ? spellAffinity(spell, enemyDef(t)) : 'normal';
        s = hurtEnemy(s, t.uid, b.dmg, false, b.combo, a === 'normal' ? undefined : a);
      }
      const splashDamage = centerDamage > 0 && (cfg.splash ?? 0) > 0 ? Math.max(1, Math.round(centerDamage * (cfg.splash ?? 0))) : 0;
      if (splashDamage > 0) {
        event.splash = around.map((e) => e.pos);
        for (const e of around) {
          const b = staffBoost(s, e.uid, splashDamage);
          s = hurtEnemy(s, e.uid, b.dmg, false, b.combo);
        }
      }
      // 炎・氷の矢は、当たった（倒れなかった）敵を燃やす・凍らせる（必ずかかる）。燃えている敵に氷、凍っている敵に炎は、蒸気になって打ち消し合う
      const foeKind = def.effect.kind === 'bolt' ? foeKindOf(def.effect.element) : null;
      if (foeKind && def.effect.kind === 'bolt') {
        for (const t of [...targets, ...around]) if (s.outcome === 'ongoing') s = inflict(s, t.uid, def.effect.element, foeKind, t === targets[0]);
      }
      // 烈なぎ払い：当たって倒れなかった敵が出血する（1ターンのダメージは、その敵に与えたダメージの割合。もう出血していれば、かけ直す）
      if (def.effect.kind === 'sweep' && def.effect.bleed && (cfg.bleedTurns ?? 0) > 0 && (cfg.bleedRate ?? 0) > 0) {
        for (const t of targets) {
          const alive = s.enemies.find((e) => e.uid === t.uid);
          if (!alive) continue;
          const amount = Math.max(1, Math.round(spellDamage(s.stats, spell, enemyDef(t), settings) * (cfg.bleedRate ?? 0)));
          event.bleeding.push(alive.pos);
          s = { ...s, enemies: s.enemies.map((e) => (e.uid === t.uid ? { ...e, bleed: { amount, turns: cfg.bleedTurns ?? 0 } } : e)) };
        }
        if (event.bleeding.length > 0) s = { ...s, log: [...s.log, `当たった敵は出血した（${cfg.bleedTurns}ターン）`] };
      }
      break;
    }
    case 'shockwave': {
      // まわり8マスの敵を、主人公から離れる向きへ吹き飛ばす。壁や敵にぶつかったら止まり、追加ダメージ。ボスは動かない
      const around = s.enemies.filter((e) => Math.max(Math.abs(e.pos.x - s.player.x), Math.abs(e.pos.y - s.player.y)) === 1);
      if (around.length === 0) s = { ...s, log: [...s.log, 'まわりに敵はいなかった'] };
      for (const t of around) {
        const b = staffBoost(s, t.uid, spellDamage(s.stats, spell, enemyDef(t), settings));
        s = hurtEnemy(s, t.uid, b.dmg, false, b.combo);
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
        // 強衝撃：倒れなかった敵が動けなくなる（ボスも）
        const left = s.enemies.find((e) => e.uid === target.uid);
        if (def.effect.kind === 'shockwave' && def.effect.stun && left && (cfg.stun ?? 0) > 0) {
          event.stunned.push(left.pos);
          s = { ...s, enemies: s.enemies.map((e) => (e.uid === target.uid ? { ...e, stun: cfg.stun ?? 0 } : e)), log: [...s.log, `${enemyDef(target).name}は動けなくなった`] };
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
function hurtEnemy(state: ExploreState, uid: number, dmg: number, slip: boolean | 'burn' | 'flame' = false, combo?: ComboKind, affinity?: 'weak' | 'resist'): ExploreState {
  const target = state.enemies.find((e) => e.uid === uid);
  if (!target || state.outcome !== 'ongoing') return state;
  const def = enemyDef(target);
  const hp = target.hp - dmg;
  const slipName = slip === 'burn' ? '燃える床' : slip === 'flame' ? '燃焼' : '出血';
  const log = [...state.log, slip ? `${def.name}は${slipName}で${dmg}のダメージ` : combo ? `${COMBO_NAMES[combo]}！ ${def.name}に${dmg}のダメージ` : `${def.name}に${dmg}のダメージ`];
  state = { ...state, hits: [...state.hits, { kind: 'dealt', at: target.pos, amount: dmg, ...(slip ? { slip: true } : {}), ...(combo ? { combo } : {}), ...(affinity ? { affinity } : {}), ...(hp <= 0 ? { killed: true } : {}) }], foes: combo ? [...state.foes, { kind: 'combo', at: target.pos, combo }] : state.foes };
  if (hp <= 0) {
    log.push(`${def.name}を倒した`);
    const defeated = { ...state, enemies: state.enemies.filter((e) => e.uid !== uid), defeated: state.defeated + (target.summoned ? 0 : 1) };
    if (def.boss) {
      const reward = TREASURE_CONFIG.bossGold;
      log.push(`報酬として忘れ物を拾った（${lost(reward)}）`, 'ダンジョンを踏破した');
      return lootFrom({ ...defeated, gold: state.gold + reward, outcome: 'cleared', log }, target);
    }
    return defeatReward({ ...defeated, log }, target);
  }
  // 出血のダメージでは、こちらに気付かない
  const hit: MapEnemy = slip ? { ...target, hp } : { ...target, hp, mode: 'chase', justNoticed: target.mode === 'wander', lastSeen: state.player };
  return { ...state, enemies: state.enemies.map((e) => (e.uid === uid ? hit : e)), log };
}

/**
 * 出血している敵が、1ターンにつき1回ダメージを受ける（倒れたら、ふつうに倒したときと同じ報酬）。残りのターンが0になれば出血は止まる。
 * 出血させたターン（skip のマスにいる敵）は、まだダメージを受けない
 */
function bleedTurn(state: ExploreState, skip: readonly Pos[]): ExploreState {
  let s = state;
  for (const { uid } of state.enemies.filter((e) => e.bleed)) {
    const e = s.enemies.find((x) => x.uid === uid);
    if (!e?.bleed || skip.some((p) => samePos(p, e.pos))) continue;
    const { amount, turns } = e.bleed;
    s = hurtEnemy(s, uid, amount, true);
    if (s.outcome !== 'ongoing') return s;
    s = {
      ...s,
      enemies: s.enemies.map((x) => {
        if (x.uid !== uid) return x;
        const { bleed: _bleed, ...rest } = x;
        return turns > 1 ? { ...rest, bleed: { amount, turns: turns - 1 } } : rest;
      }),
    };
  }
  return s;
}

/** 燃えている敵が、1ターンにつき1回ダメージを受ける。残りのターンが0になれば火は消える（倒れたら、ふつうに倒したときと同じ報酬）。燃やしたターン（skip のマスにいる敵）は、まだダメージを受けない */
function burnTurn(state: ExploreState, skip: readonly Pos[]): ExploreState {
  let s = state;
  for (const { uid } of state.enemies.filter((e) => e.burn)) {
    const e = s.enemies.find((x) => x.uid === uid);
    if (!e?.burn || skip.some((p) => samePos(p, e.pos))) continue;
    const { amount, turns } = e.burn;
    s = hurtEnemy(s, uid, amount, 'flame');
    if (s.outcome !== 'ongoing') return s;
    s = {
      ...s,
      enemies: s.enemies.map((x) => {
        if (x.uid !== uid) return x;
        const { burn: _burn, ...rest } = x;
        return turns > 1 ? { ...rest, burn: { amount, turns: turns - 1 } } : rest;
      }),
    };
  }
  return s;
}

const COMBO_NAMES: Record<ComboKind, string> = { smash: '砕いた', sear: '焼き斬り', arcane: '杖が共鳴した' };

/** 敵に燃焼・凍結をかける（かかった・蒸気で打ち消し合ったときは、ログと演出の出来事を足す。announce：かからない敵のとき、その旨をログに出す） */
function inflict(state: ExploreState, uid: number, element: Element, kind: FoeStatusKind, announce: boolean): ExploreState {
  const target = state.enemies.find((e) => e.uid === uid);
  if (!target) return state;
  const applied = applyFoeStatus(target, element, kind);
  if (!applied) return announce ? { ...state, log: [...state.log, `${enemyDef(target).name}は${kind === 'burn' ? '燃えない' : '凍らない'}`] } : state;
  return {
    ...state,
    enemies: state.enemies.map((e) => (e.uid === uid ? applied.enemy : e)),
    log: [...state.log, applied.log],
    foes: [...state.foes, applied.steam ? { kind: 'steam', at: target.pos } : { kind: 'foe_status', at: target.pos, status: kind }],
  };
}

/** 杖の呪文は、燃えている・凍っている敵に当てるとダメージが増える（杖 × 燃焼・凍結） */
function staffBoost(state: ExploreState, uid: number, dmg: number): { dmg: number; combo?: ComboKind } {
  const e = state.enemies.find((x) => x.uid === uid);
  if (!e || weaponTypeOf(state.stats.weapon) !== 'staff' || !(e.burn || e.frozen)) return { dmg };
  return { dmg: scaled(dmg, STATUS_MASTER.foe.spellPercent), combo: 'arcane' };
}

// ===== 敵を倒したときの報酬 =====

/**
 * 通常の敵・強敵を倒したときの報酬：金貨、経験値（レベルアップ）、道具。
 * 道具は持ち物に入れ、いっぱいなら倒した場所に宝箱で残す。強敵は必ず宝箱を落とす（金貨と良い道具が入っている）
 */
function defeatReward(state: ExploreState, enemy: MapEnemy): ExploreState {
  if (enemy.summoned) return state; // 呼ばれた敵を倒しても、報酬はない
  const settings = dungeonOfState(state);
  const growth = settings.growth;
  const reward = enemyReward(enemy.id);
  const rate = enemy.elite ? growth.eliteRate : 1;
  const log = [...state.log];
  let s = state.rngState;
  let { stats } = state;
  let chests = state.chests;

  const gold = Math.round(reward.gold * rate);
  if (gold > 0) log.push(`忘れ物を拾った（${lost(gold)}）`);

  // 道具：強敵は必ず宝箱で、通常の敵は確率で落とす
  let item: ItemId | null = null;
  const items = enemy.elite ? REWARD_CONFIG.eliteItems : REWARD_CONFIG.dropItems;
  if (enemy.elite || reward.drop > 0) {
    const roll = nextRandom(s);
    const pick = nextInt(roll.state, items.length);
    s = pick.state;
    if (enemy.elite || roll.value * 100 < reward.drop) item = items[pick.value]!;
  }
  if (item && !enemy.elite && stats.items.length < state.maxItems) {
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
      mag: stats.mag + growth.magPerLevel,
    };
    log.push(`レベル${level}に上がった（最大HP+${growth.hpPerLevel}、攻撃+${growth.atkPerLevel}${growth.magPerLevel > 0 ? `、魔力+${growth.magPerLevel}` : ''}）`);
  }
  if (level >= growth.maxLevel) exp = 0;

  return lootFrom({ ...state, gold: state.gold + gold, stats, chests, level, exp, rngState: s, log }, enemy);
}

/**
 * 倒した敵が、刻印武器や残響を落とす（ごく稀）。拾ったものは、探索のあいだ持っていて、終わったとき（力尽きても）倉庫に入る。宝箱には入らない。
 * くじは探索の乱数を使わない（lootSeed）。呼ばれた敵は、何も落とさない
 */
function lootFrom(state: ExploreState, enemy: MapEnemy): ExploreState {
  if (enemy.summoned) return state;
  const def = enemyDef(enemy);
  const got = rollLoot(lootSeed(state, enemy.uid), def, def.boss ? 'boss' : enemy.elite ? 'elite' : 'normal');
  if (!got.gear && !got.echo && !got.ring) return state;
  const log = [...state.log];
  const found = { echoes: [...state.found.echoes], gear: [...state.found.gear], rings: [...state.found.rings] };
  if (got.gear) {
    found.gear.push(got.gear);
    log.push(`${gearName(got.gear.base)}を拾った（刻印スロット${got.gear.slots}つ）。倉庫に送った`);
  }
  if (got.echo) {
    found.echoes.push(got.echo);
    log.push(`${echoName(got.echo)}を拾った。倉庫に送った`);
  }
  if (got.ring) {
    found.rings.push(got.ring);
    log.push(`${ITEMS[got.ring].name}を拾った。倉庫に送った`);
  }
  return { ...state, found, log };
}

// ===== プレイヤーの攻撃 =====

/** 体当たりで攻撃する。気付いていない敵なら不意打ちになる */
function playerAttack(state: ExploreState, target: MapEnemy): ExploreState {
  const def = enemyDef(target);
  const surprise = target.mode === 'wander';
  // 盾持ちの敵は、向いている正面からの攻撃を大きく防ぐ（側面・背中からなら、そのまま通る）
  const guarded = behaviorsOf(def).includes('shield') && guardsAgainst(target, state.player);
  const raw = playerHitDamage(state.stats, def) * (surprise ? ENEMY_CONFIG.surpriseMultiplier : 1);
  let dmg = guarded ? Math.max(1, Math.round(raw * (1 - ENEMY_CONFIG.shieldCut))) : raw;
  // コンボ：ハンマー × 凍結 ＝ 砕く（凍結は解ける）／ 剣 × 燃焼 ＝ 焼き斬り（残りの燃焼のダメージを一度に与え、火が消える）
  const weapon = weaponTypeOf(state.stats.weapon);
  let combo: ComboKind | undefined;
  let victim = target;
  if (weapon === 'hammer' && target.frozen) {
    dmg = scaled(dmg, STATUS_MASTER.foe.smashPercent);
    combo = 'smash';
    victim = thaw(target);
  } else if (weapon === 'sword' && target.burn) {
    dmg += burnRemaining(target);
    combo = 'sear';
    victim = extinguish(target);
  }
  const hp = target.hp - dmg;
  const log = [
    ...state.log,
    combo ? `${COMBO_NAMES[combo]}！ ${def.name}に${dmg}のダメージ` : guarded ? `${def.name}の盾に防がれた（${dmg}のダメージ）` : surprise ? `${def.name}に不意打ち！ ${dmg}のダメージ` : `${def.name}に${dmg}のダメージ`,
  ];
  const enchantBefore = state.stats.enchant;
  const affinity = guarded ? null : hitAffinity(state.stats, def);
  state = {
    ...state,
    skill: gaugeUp(state),
    hits: [...state.hits, { kind: 'dealt', at: target.pos, amount: dmg, ...(guarded ? { blocked: true } : {}), ...(combo ? { combo } : {}), ...(affinity ? { affinity } : {}), ...(hp <= 0 ? { killed: true } : {}) }],
    foes: [...(guarded ? [...state.foes, { kind: 'block' as const, at: target.pos }] : state.foes), ...(combo ? [{ kind: 'combo' as const, at: target.pos, combo }] : [])],
  };

  // 属性付与はダメージを計算したあとで1回減らし、0回になると消える。炎・氷の力を宿した武器で当てると、敵の足元に床が残る
  const used = useEnchant(state, [target.pos]);
  state = used.state;
  if (used.ended) log.push(used.ended);
  const stats = state.stats;

  if (hp <= 0) {
    log.push(`${def.name}を倒した`);
    const defeated = { ...state, stats, enemies: state.enemies.filter((e) => e.uid !== target.uid), defeated: state.defeated + (target.summoned ? 0 : 1) };
    if (def.boss) {
      const reward = TREASURE_CONFIG.bossGold;
      log.push(`報酬として忘れ物を拾った（${lost(reward)}）`, 'ダンジョンを踏破した');
      return lootFrom({ ...defeated, gold: state.gold + reward, outcome: 'cleared', log }, target);
    }
    return defeatReward({ ...defeated, log }, target);
  }
  // 攻撃された敵はこちらに気付く
  const hit: MapEnemy = { ...victim, hp, mode: 'chase', justNoticed: surprise, lastSeen: state.player };
  state = { ...state, stats, enemies: state.enemies.map((e) => (e.uid === target.uid ? hit : e)), log };
  // 炎・氷の砥石で殴ると、確率で燃える・凍る（かからない敵には、確率も引かない）
  const kind = foeKindOf(enchantBefore?.element);
  if (enchantBefore && kind && !foeImmune(hit, kind)) {
    const roll = nextRandom(state.rngState);
    state = { ...state, rngState: roll.state };
    if (roll.value < whetstoneChance(kind)) state = inflict(state, hit.uid, enchantBefore.element, kind, false);
  }
  return state;
}

/** 隣にいる敵から離れると、背後から攻撃されることがある（強敵は必ず） */
function backAttacks(state: ExploreState, to: Pos): ExploreState {
  let s = state;
  for (const e of state.enemies) {
    if (e.mode === 'wander' || (e.stun ?? 0) > 0 || !isAdjacent(e.pos, state.player) || isAdjacent(e.pos, to)) continue;
    let hits = e.elite;
    if (!hits) {
      const roll = nextRandom(s.rngState);
      s = { ...s, rngState: roll.state };
      hits = roll.value < ENEMY_CONFIG.backAttackChance;
    }
    if (!hits) continue;
    const def = enemyDef(e);
    s = hitByEnemy(s, enemyHitDamage(s.stats, def), `離れようとして、${def.name}に背後から攻撃された`, def);
    if (s.outcome !== 'ongoing') return s;
  }
  return s;
}

// ===== ボスの段階 =====

/**
 * ボスのHPが 2/3・1/3 以下になっていたら、段階を上げる（一度上がった段階は下がらない）。
 * 段階が上がったボスは、このターンは咆哮して動かない（動けない状態を1ターン入れる。演出は roar の出来事で見せる）
 */
function phaseUp(state: ExploreState): ExploreState {
  let s = state;
  for (const e of state.enemies) {
    const base = enemyBase(e.id);
    if (!base.boss) continue;
    const phase = Math.min(PHASE_MAX, Math.max(e.phase ?? 1, phaseOf(e.hp, base.hp)));
    if (phase === (e.phase ?? 1)) continue;
    s = {
      ...s,
      enemies: s.enemies.map((x) => (x.uid === e.uid ? { ...x, phase, stun: Math.max(x.stun ?? 0, 1) } : x)),
      foes: [...s.foes, { kind: 'roar', at: e.pos, phase }],
      log: [...s.log, `${base.name}が咆哮した！ 力が増していく…`],
    };
  }
  return s;
}

/** ボスが主人公のまわり（縦横 BOSS_CONFIG.sowRadius マス以内）の床に、燃える床・霜の床をまく。まいたマスを返す（まく床がないときは何もしない） */
function sowFields(state: ExploreState, boss: MapEnemy, kind: FieldKind): ExploreState {
  const { x, y } = state.player;
  const r = BOSS_CONFIG.sowRadius;
  const open: Pos[] = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const p = { x: x + dx, y: y + dy };
    if ((dx !== 0 || dy !== 0) && tileAt(state.map, p) !== 'wall') open.push(p);
  }
  const picked = shuffle(open, state.rngState);
  const to = picked.value.slice(0, BOSS_CONFIG.sowCount);
  const s = addFields({ ...state, rngState: picked.state }, to, kind);
  return { ...s, foes: [...s.foes, { kind: 'sow', at: boss.pos, to, field: kind }], log: [...s.log, `${enemyDef(boss).name}が${kind === 'fire' ? '炎' : '冷気'}をまき散らした`] };
}

// ===== 敵の手番 =====

/**
 * 敵が1体ずつ行動する。
 * 1. プレイヤーが見えるか調べ、状態（うろつき・追跡・探索）を切り替える。気付いたターンは動かない
 *    （見張りは、気付くと叫んで、近くの仲間も気付かせる。気付かされた仲間も、そのターンは動かない）
 * 2. 追跡中・探索中で隣にいれば攻撃し、そうでなければ移動する（強敵は持ち場の近くだけを動く。ボスは歩く）
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
  const spawned: MapEnemy[] = []; // このターンに呼ばれた敵（次のターンから動く）
  const roused = new Set<number>(); // このターンに、見張りの合図で気付かされた敵（uid）。気付いたターンは身構えるだけで、次のターンから動く
  for (let i = 0; i < enemies.length; i++) {
    const current = enemies[i]!;
    if (roused.has(current.uid)) continue;
    // 動けない敵は、このターンは何もしない（気付くことも、動くことも、攻撃することも）。突進の構えも解ける
    if ((current.stun ?? 0) > 0) {
      const { stun, charge: _charge, frozen, ...rest } = current;
      // 凍結は、動けないターン（stun）が切れると解ける
      enemies[i] = stun! > 1 ? { ...rest, ...(frozen ? { frozen } : {}), stun: stun! - 1, justNoticed: false } : { ...rest, justNoticed: false };
      continue;
    }
    const def = enemyDef(current);
    // 待ち伏せ：気付かれていないあいだは、近く（ambushRange）に来るまで気付かない
    const lying = current.mode === 'wander' && behaviorsOf(def).includes('ambush');
    const sees = canSee(s.map, current.pos, s.player, lying ? ENEMY_CONFIG.ambushRange : ENEMY_CONFIG.sight);
    let e: MapEnemy = { ...current, justNoticed: false };

    if (sees) {
      if (e.mode !== 'chase' && behaviorsOf(def).includes('alarm')) {
        // 見張りの合図：叫んで、近くのまだ気付いていない仲間を（近い順に3体まで）、一斉に気付かせる（壁ごしでも届く。仲間は、自分で見つけるのを待たずに追ってくる）
        const heard = alarmTargets(enemies, current, ENEMY_CONFIG.alarmRange, ENEMY_CONFIG.alarmMax);
        for (const j of heard) {
          enemies[j] = { ...enemies[j]!, mode: 'chase', justNoticed: true, lastSeen: s.player, searchTurns: 0 };
          if (j > i) roused.add(enemies[j]!.uid);
        }
        s = {
          ...s,
          foes: [...s.foes, { kind: 'alarm', at: current.pos, to: heard.map((j) => enemies[j]!.pos) }],
          log: [...s.log, heard.length > 0 ? `${def.name}が叫んで、仲間を呼んだ` : `${def.name}が叫んだ`],
        };
      }
      if (e.mode !== 'chase') {
        if (!lying) {
          // 気付いたターンは身構えるだけで動かない。プレイヤーに対応する猶予を与える
          // 記録には書かない（気付いたことは、頭上の「！」で見せる）
          enemies[i] = { ...e, mode: 'chase', justNoticed: true, lastSeen: s.player };
          continue;
        }
        // 待ち伏せは、猶予なし。気付いたそのターンに動く（隣なら殴る）
        e = { ...e, mode: 'chase', justNoticed: true, lastSeen: s.player };
        s = { ...s, log: [...s.log, `${def.name}が襲いかかってきた`] };
      } else {
        e = { ...e, lastSeen: s.player };
      }
    } else if (e.mode === 'chase') {
      e = { ...e, mode: 'search', searchTurns: ENEMY_CONFIG.loseTurns };
    } else if (e.mode === 'search') {
      e = { ...e, searchTurns: e.searchTurns - 1 };
      if (e.searchTurns <= 0) {
        // 見失ったことも、記録には書かない
        e = { ...e, mode: 'wander', lastSeen: null, searchTurns: 0 };
      }
    }

    // 突進の構え：構えた次のターンに、その向きへ走る（主人公が動いていても、同じ向きへ走る）
    if (e.charge) {
      const dir = e.charge;
      const run = chargeRun(s.map, e.pos, dir, s.player, blocked);
      const from = e.pos;
      leave(key(from));
      const { charge: _charge, ...rest } = e;
      e = { ...rest, pos: run.to, facing: dir, cool: ENEMY_CONFIG.chargeCool };
      enter(key(e.pos));
      s = { ...s, foes: [...s.foes, { kind: 'charge', from, to: run.to, hit: run.hit }] };
      if (run.hit) {
        enemies[i] = e;
        s = hitByEnemy(s, Math.max(1, Math.ceil(enemyHitDamage(s.stats, def) * ENEMY_CONFIG.chargeRate)), `${def.name}の突進`, def);
        if (s.outcome !== 'ongoing') return { ...s, enemies };
        continue;
      }
      if (run.wall) {
        e = { ...e, stun: ENEMY_CONFIG.chargeStun };
        s = { ...s, foes: [...s.foes, { kind: 'bump', at: run.to }], log: [...s.log, `${def.name}は壁にぶつかって動けなくなった`] };
      }
      enemies[i] = e;
      continue;
    }

    // 行動の個性（enemyBehavior.ts）：主人公を追っていて見えているあいだ、個性のある行動をしたら、そのターンはほかのことをしない
    const behaviors = behaviorsOf(def);
    if ((e.cool ?? 0) > 0) e = { ...e, cool: e.cool! - 1 };
    // ボスの床まき：主人公が見えているあいだ、一定のターンごとに、そのターンの行動のかわりに床をまく
    const sow = def.boss ? phaseSow(e.id, e.phase ?? 1) : null;
    if (sow && e.mode === 'chase' && sees && s.turn % BOSS_CONFIG.sowEvery === 0) {
      enemies[i] = e;
      s = sowFields(s, e, sow);
      continue;
    }
    if (e.mode === 'chase' && sees && behaviors.length > 0) {
      const line = straightLine(s.map, e.pos, s.player, blocked);
      // 召喚：間隔ごとに、近くのあいている床に、道中でいちばん弱い敵を呼ぶ（同時に出していられる数まで）
      if (behaviors.includes('summoner')) {
        const left = (e.summonIn ?? ENEMY_CONFIG.summonEvery) - 1;
        if (left > 0) e = { ...e, summonIn: left };
        else {
          e = { ...e, summonIn: ENEMY_CONFIG.summonEvery };
          const mine = [...enemies, ...spawned].filter((m) => m.summonedBy === e.uid).length;
          const tile = mine < ENEMY_CONFIG.summonMax ? minionTile(s.map, e.pos, s.player, blocked) : null;
          if (tile) {
            const id = weakestOf(dungeonOfState(s).encounters[s.trait].pool);
            const minion: MapEnemy = { uid: s.nextUid, id, elite: false, pos: tile, hp: enemyDef({ id, elite: false }).hp, mode: 'chase', justNoticed: true, lastSeen: s.player, searchTurns: 0, summoned: true, summonedBy: e.uid };
            spawned.push(minion);
            enter(key(tile));
            s = { ...s, nextUid: s.nextUid + 1, foes: [...s.foes, { kind: 'summon', at: tile, from: e.pos }], log: [...s.log, `${def.name}が${enemyDef(minion).name}を呼んだ`] };
            enemies[i] = e;
            continue;
          }
        }
      }
      // 突進：まっすぐ2〜3マス離れていたら構える
      if (behaviors.includes('charger') && (e.cool ?? 0) <= 0 && line && line.dist >= 2 && line.dist <= ENEMY_CONFIG.chargeRange) {
        e = { ...e, charge: line.dir, facing: line.dir };
        s = { ...s, foes: [...s.foes, { kind: 'windup', at: e.pos }], log: [...s.log, `${def.name}が突進の構えをとった`] };
        enemies[i] = e;
        continue;
      }
      // 遠距離：まっすぐ2〜4マスで見通せれば撃つ。隣り合うと、撃てる位置へ1歩下がる
      if (behaviors.includes('ranged')) {
        if (line && line.dist >= 2 && line.dist <= ENEMY_CONFIG.rangedRange) {
          enemies[i] = e;
          s = { ...s, foes: [...s.foes, { kind: 'shot', from: e.pos, to: s.player, by: e.id }] };
          s = hitByEnemy(s, Math.max(1, Math.ceil(enemyHitDamage(s.stats, def) * ENEMY_CONFIG.rangedRate)), `${def.name}の遠距離攻撃`, def, true);
          if (s.outcome !== 'ongoing') return { ...s, enemies };
          continue;
        }
        if (isAdjacent(e.pos, s.player) && (e.cool ?? 0) <= 0) {
          const back = retreatStep(s.map, e.pos, s.player, blocked);
          if (back) {
            leave(key(e.pos));
            e = { ...e, pos: back, facing: stepDir(e.pos, back) ?? e.facing, cool: ENEMY_CONFIG.retreatCool };
            enter(key(back));
            enemies[i] = e;
            continue;
          }
        }
      }
    }

    // 攻撃
    if (e.mode !== 'wander' && isAdjacent(e.pos, s.player)) {
      enemies[i] = e;
      s = hitByEnemy(s, enemyHitDamage(s.stats, def), `${def.name}の攻撃`, def);
      if (s.outcome !== 'ongoing') return { ...s, enemies };
      continue;
    }

    // 待ち伏せ：気付かれていないあいだは、その場から動かない
    if (e.mode === 'wander' && behaviorsOf(def).includes('ambush')) {
      enemies[i] = e;
      continue;
    }

    // 移動（自分のいるマスは、自分にとっては通れないマスに数えない）。ボスは歩いて追ってくる。
    // 強敵は持ち場を守る：ふだんは持ち場の近くをうろつき、気付いたら追うが、持ち場から離れすぎるところへは行かず、あきらめて戻る
    const home = e.elite && !def.boss ? (e.home ?? e.pos) : null; // 持ち場のない前の版の途中保存は、今いる場所を持ち場にする
    if (home && !e.home) e = { ...e, home };
    // 霜の床の上では、歩き出すのに1ターン余計にかかる（霜の敵は影響を受けない）
    if (fieldAt(s.fields, e.pos)?.kind === 'frost' && !immuneToField(def, 'frost') && !e.chilled) {
      enemies[i] = { ...e, chilled: true };
      continue;
    }
    if (e.chilled) e = { ...e, chilled: false };
    leave(key(e.pos));
    if (e.mode !== 'wander' && e.lastSeen && !samePos(e.pos, e.lastSeen)) {
      const nextPos = nextStepToward(s.map, e.pos, e.lastSeen, blocked);
      if (home && nextPos && fromHome(home, nextPos) > ENEMY_CONFIG.eliteLeash) {
        e = { ...e, mode: 'wander', lastSeen: null, searchTurns: 0 }; // 深追いはしない
      } else if (nextPos && !samePos(nextPos, s.player)) e = { ...e, pos: nextPos };
    } else if (home && fromHome(home, e.pos) > ENEMY_CONFIG.eliteRoam) {
      // 持ち場へ戻る
      const back = nextStepToward(s.map, e.pos, home, blocked);
      if (back && !samePos(back, s.player)) e = { ...e, pos: back };
    } else {
      const moved = wanderStep(s.map, e.pos, blocked, s.rngState, home ? eliteArea(home) : e.room);
      s = { ...s, rngState: moved.rngState };
      e = { ...e, pos: moved.pos };
    }
    // 歩いたら、その向きが正面になる（盾持ちの盾の向き）
    const faced = samePos(e.pos, current.pos) ? null : stepDir(current.pos, e.pos);
    if (faced) e = { ...e, facing: faced };
    // 炎の足跡：歩いたら、離れたマスに燃える床を残す
    if (!samePos(e.pos, current.pos) && behaviorsOf(def).includes('trail')) s = addFields(s, [current.pos], 'fire');
    enter(key(e.pos));
    enemies[i] = e;
  }
  enemies.push(...spawned);
  return { ...s, enemies };
}

// ===== 武器の固有技 =====

/** 通常攻撃を当てたら、技ゲージが1たまる（満タンまで。武器がなければたまらない） */
function gaugeUp(state: ExploreState): number {
  const skill = skillOf(state.stats.weapon, state.stats.echoes);
  return skill ? Math.min(skill.max, state.skill + 1) : 0;
}

/**
 * 武器に宿した属性の力を1回使う（0回になると消える）。炎・氷の力なら、at のマスに燃える床・霜の床が残る。
 * 属性が消えたときは、記録に書く言葉を ended で返す
 */
function useEnchant(state: ExploreState, at: readonly Pos[]): { state: ExploreState; ended: string | null } {
  const { enchant } = state.stats;
  if (!enchant) return { state, ended: null };
  const kind = fieldOfElement(enchant.element);
  const placed = kind ? addFields(state, at, kind) : state;
  const hits = enchant.hits - 1;
  return {
    state: { ...placed, stats: { ...placed.stats, enchant: hits > 0 ? { ...enchant, hits } : null } },
    ended: hits <= 0 ? `武器から${TRAITS[enchant.element].name}の力が消えた` : null,
  };
}

/** 武器の固有技を出す。技ゲージが満タンのときだけ（1ターン使い、ゲージは0に戻る）。敵に当たらないときは出せない */
function useSkill(state: ExploreState, dir: Dir | null): Result<ExploreState> {
  const skill = skillOf(state.stats.weapon, state.stats.echoes);
  if (!skill) return err('武器を持っていない');
  if (state.skill < skill.max) return err('技ゲージがたまっていない');
  let s: ExploreState = { ...state, skill: 0 };
  const from = s.player;
  const cutOf = (e: MapEnemy) => (behaviorsOf(enemyDef(e)).includes('shield') && guardsAgainst(e, from) ? 1 - ENEMY_CONFIG.shieldCut : 1);

  switch (skill.weapon) {
    case 'sword': {
      // 連斬り：向いた方向の隣の敵に2回、合計で通常の1.6倍。倒れなかった敵は出血する
      if (!dir) return err('向きを選んでください');
      const at = { x: from.x + DIR_DELTA[dir].x, y: from.y + DIR_DELTA[dir].y };
      const target = s.enemies.find((e) => samePos(e.pos, at));
      if (!target) return err('向いた方向に敵がいない');
      const def = enemyDef(target);
      const raw = playerHitDamage(s.stats, def) * (target.mode === 'wander' ? ENEMY_CONFIG.surpriseMultiplier : 1);
      const cut = cutOf(target);
      const each = Math.max(1, Math.round(((raw * SKILL_CONFIG.slashRate) / SKILL_CONFIG.slashHits) * cut));
      s = { ...s, log: [...s.log, `${skill.name}！`], foes: [...s.foes, { kind: 'skill', weapon: 'sword', from, dir, path: [at] }, ...(cut < 1 ? [{ kind: 'block' as const, at }] : [])] };
      for (let i = 0; i < SKILL_CONFIG.slashHits; i++) {
        s = hurtEnemy(s, target.uid, each);
        if (s.outcome !== 'ongoing' || !s.enemies.some((e) => e.uid === target.uid)) break;
      }
      if (s.outcome !== 'ongoing') return ok(s);
      const used = useEnchant(s, [at]);
      s = { ...used.state, log: used.ended ? [...used.state.log, used.ended] : used.state.log };
      if (s.enemies.some((e) => e.uid === target.uid)) {
        const amount = Math.max(1, Math.round(each * SKILL_CONFIG.bleedRate));
        s = { ...s, enemies: s.enemies.map((e) => (e.uid === target.uid ? { ...e, bleed: { amount, turns: SKILL_CONFIG.bleedTurns } } : e)), log: [...s.log, `${def.name}は出血した（${SKILL_CONFIG.bleedTurns}ターン）`] };
      }
      return ok(s);
    }
    case 'hammer': {
      // 地響き：まわり8マスの敵すべてに通常のダメージと、1ターンの気絶
      const around = s.enemies.filter((e) => Math.max(Math.abs(e.pos.x - from.x), Math.abs(e.pos.y - from.y)) === 1);
      if (around.length === 0) return err('まわりに敵がいない');
      s = { ...s, log: [...s.log, `${skill.name}！`], foes: [...s.foes, { kind: 'skill', weapon: 'hammer', from, dir: null, path: around.map((e) => e.pos) }] };
      for (const t of around) {
        const cut = cutOf(t);
        s = hurtEnemy(s, t.uid, Math.max(1, Math.round(playerHitDamage(s.stats, enemyDef(t)) * cut)));
        if (s.outcome !== 'ongoing') return ok(s);
        if (s.enemies.some((e) => e.uid === t.uid)) s = { ...s, enemies: s.enemies.map((e) => (e.uid === t.uid ? { ...e, stun: SKILL_CONFIG.slamStun } : e)) };
      }
      const used = useEnchant(s, around.map((e) => e.pos));
      return ok({ ...used.state, log: used.ended ? [...used.state.log, used.ended] : used.state.log });
    }
    case 'staff': {
      // 魔力弾：向いた方向の最初の敵に、魔法の強さの1.5倍（敵の防御は無視）
      if (!dir) return err('向きを選んでください');
      const d = DIR_DELTA[dir];
      const path: Pos[] = [];
      let target: MapEnemy | undefined;
      for (let i = 1; i <= SKILL_CONFIG.boltRange; i++) {
        const p = { x: from.x + d.x * i, y: from.y + d.y * i };
        if (tileAt(s.map, p) === 'wall') break;
        path.push(p);
        target = s.enemies.find((e) => samePos(e.pos, p));
        if (target) break;
      }
      if (!target) return err('向いた方向に敵がいない');
      const dmg = Math.max(1, Math.round(magicPower(s.stats, dungeonOfState(s).magic) * SKILL_CONFIG.boltRate * (enemyDef(target).magic ?? 1)));
      s = { ...s, log: [...s.log, `${skill.name}！`], foes: [...s.foes, { kind: 'skill', weapon: 'staff', from, dir, path }] };
      return ok(hurtEnemy(s, target.uid, dmg));
    }
    default: {
      const unreachable: never = skill.weapon;
      return unreachable;
    }
  }
}

// ===== 床に残る魔法の跡 =====

/** 炎は燃える床、氷は霜の床を残す。光・闇は残さない */
function fieldOfElement(element: string): FieldKind | null {
  return element === 'fire' ? 'fire' : element === 'ice' ? 'frost' : null;
}

/** 床を置く（主人公のいるマスには置かない）。逆の床とぶつかると水蒸気になる */
function addFields(state: ExploreState, at: readonly Pos[], kind: FieldKind): ExploreState {
  let fields: Field[] = state.fields;
  const foes = [...state.foes];
  for (const pos of at) {
    const placed = placeField(fields, state.map, pos, kind, state.player);
    fields = placed.fields;
    for (const p of placed.steam) foes.push({ kind: 'steam', at: p });
  }
  return { ...state, fields, foes };
}

/** ターンの終わりに、燃える床に乗っている主人公と敵がダメージを受け、床の残りターンが1つ減る */
function fieldsTurn(state: ExploreState): ExploreState {
  let s = state;
  const fires = s.fields.filter((f) => f.kind === 'fire');
  if (fires.some((f) => samePos(f.pos, s.player))) {
    s = damagePlayer(s, FIELD_CONFIG.fireDamage, '燃える床', '燃える床');
    if (s.outcome !== 'ongoing') return s;
  }
  for (const { uid, pos } of state.enemies) {
    if (!fires.some((f) => samePos(f.pos, pos))) continue;
    const e = s.enemies.find((x) => x.uid === uid);
    if (!e || immuneToField(enemyDef(e), 'fire')) continue;
    s = hurtEnemy(s, uid, FIELD_CONFIG.fireDamage, 'burn');
    if (s.outcome !== 'ongoing') return s;
  }
  return { ...s, fields: tickFields(s.fields) };
}

function damagePlayer(state: ExploreState, dmg: number, message: string, by: string, enemy?: EnemyId, ranged = false): ExploreState {
  const hp = Math.max(0, state.stats.hp - dmg);
  const log = [...state.log, `${message}で${dmg}のダメージ`];
  const hit: HitEvent = enemy ? { kind: 'taken', at: state.player, amount: dmg, by: enemy, ...(ranged ? { ranged: true } : {}) } : { kind: 'taken', at: state.player, amount: dmg };
  state = { ...state, hits: [...state.hits, hit] };
  if (hp === 0) {
    return { ...state, stats: { ...state.stats, hp }, outcome: 'defeated', log: [...log, `${by}に倒された…`] };
  }
  return { ...state, stats: { ...state.stats, hp }, log };
}

/** 敵の攻撃を受ける。ダメージのあと、生きていれば、その敵の状態異常（毒・鈍足・空腹。status.ts）にかかることがある */
function hitByEnemy(state: ExploreState, dmg: number, message: string, def: EnemyDef, ranged = false): ExploreState {
  const hit = damagePlayer(state, dmg, message, def.name, def.id, ranged);
  if (hit.outcome !== 'ongoing') return hit;
  const a = afflict(hit, def);
  if (!a.log.length && a.rngState === hit.rngState) return hit;
  return { ...hit, stats: a.stats, satiety: a.satiety, rngState: a.rngState, log: [...hit.log, ...a.log] };
}

// ===== 満腹度 =====

/** 1行動ぶん満腹度を減らす。0ならHPが減る（HPは歩いても自然には回復しない。回復薬・呪文・レベルアップで戻す） */
function spendAction(state: ExploreState): ExploreState {
  const poisoned = applyPoison(state);
  if (poisoned.outcome !== 'ongoing') return { ...poisoned, turn: poisoned.turn + 1 };
  state = recoverMagic(poisoned, state.turn + 1);
  const turn = state.turn + 1;
  const { stats } = state;
  if (state.satiety > 0) {
    // ぬくもりの残響：決まった間隔で、満腹度が減らない行動ができる
    const spent = savesSatiety(satietySaving(stats.echoes), turn) ? 0 : EXPLORE_CONFIG.satietyPerAction;
    const satiety = Math.max(0, state.satiety - spent);
    const log = satiety === 0 ? [...state.log, '空腹で力が出ない…'] : state.log;
    return { ...state, turn, satiety, log };
  }
  const hp = Math.max(0, stats.hp - EXPLORE_CONFIG.starveDamage);
  if (hp === 0) {
    return { ...state, turn, stats: { ...stats, hp }, outcome: 'defeated', log: [...state.log, '飢えて力尽きた…'] };
  }
  return { ...state, turn, stats: { ...stats, hp } };
}

/** 毒：毎ターン、守りに関係なくダメージ（ターン数は status.ts。ダメージは statuses.json の poison.damage） */
function applyPoison(state: ExploreState): ExploreState {
  const { stats } = state;
  if (stats.poisonTurns <= 0) return state;
  const next = { ...stats, poisonTurns: stats.poisonTurns - 1 };
  const hurt = damagePlayer({ ...state, stats: next }, STATUS_MASTER.poison.damage, '毒', '毒');
  return next.poisonTurns === 0 && hurt.outcome === 'ongoing' ? { ...hurt, log: [...hurt.log, '毒が抜けた'] } : hurt;
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
    found: state.found,
  };
}

// ===== 視界 =====

/** 今の位置から見えるマスを、この階の記憶に加える */
function reveal(state: ExploreState): ExploreState {
  const seen = [...state.seen];
  for (const i of visibleTiles(state.map, state.player, state.sightRadius)) seen[i] = true;
  return { ...state, seen };
}

