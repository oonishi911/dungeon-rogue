// 探索フェーズの流れ（MVP）：3フロア × 敵2体 → ボス。
// HPと消費アイテムは戦闘をまたいで引き継ぐ。
// 画面では人が advance() に行動を渡し、autoPlay では簡易AIが同じ advance() を呼ぶ。
// 進め方が1つなので、バランステストの結果がそのまま手動プレイにも当てはまる。

import { act, buildPlayer, playerHitDamage, startCombat } from './combat';
import { ENEMIES, TRAIT_ENEMIES } from './data';
import { nextInt } from './rng';
import type { CombatAction, CombatState, EnemyId, ItemId, PlayerStats, Result, TraitId } from './types';

export const EXPEDITION_CONFIG = {
  floors: 3,
  enemiesPerFloor: 2,
  restHeal: 15, // フロアを降りるときに回復するHP
} as const;

/** フロア間の休憩 */
export function rest(player: PlayerStats): PlayerStats {
  return { ...player, hp: Math.min(player.maxHp, player.hp + EXPEDITION_CONFIG.restHeal) };
}

/** フロアごとの敵の並び。最後の要素はボスだけのフロア */
export function generateEncounters(trait: TraitId, seed: number): EnemyId[][] {
  const { pool, boss } = TRAIT_ENEMIES[trait];
  const floors: EnemyId[][] = [];
  let s = seed;
  for (let f = 0; f < EXPEDITION_CONFIG.floors; f++) {
    const floor: EnemyId[] = [];
    for (let e = 0; e < EXPEDITION_CONFIG.enemiesPerFloor; e++) {
      const roll = nextInt(s, pool.length);
      s = roll.state;
      floor.push(pool[roll.value]!);
    }
    floors.push(floor);
  }
  floors.push([boss]);
  return floors;
}

/** 簡易AI：毒なら毒消し、HPが減ったら回復薬、炎の敵には氷の巻物、それ以外は攻撃 */
export function autoAction(state: CombatState): CombatAction {
  const { player } = state;
  const enemy = ENEMIES[state.enemy.id];
  const has = (item: ItemId) => player.consumables.includes(item);

  if (player.poisonTurns >= 2 && has('antidote')) return { kind: 'use_item', item: 'antidote' };
  if (player.hp <= 20 && has('potion')) return { kind: 'use_item', item: 'potion' };
  if (enemy.element === 'fire' && has('frost_scroll') && state.enemy.hp > playerHitDamage(player, enemy)) {
    return { kind: 'use_item', item: 'frost_scroll' };
  }
  return { kind: 'attack' };
}

// ===== 探索の進行（手動プレイと自動プレイで共通） =====

export interface ExpeditionState {
  trait: TraitId;
  floors: EnemyId[][];
  floor: number; // 0始まり
  index: number; // そのフロアで何体目か（0始まり）
  combat: CombatState; // 今の戦闘。探索が終わったあとは最後の戦闘が残る
  defeated: number;
  outcome: 'ongoing' | 'cleared' | 'defeated';
  log: string[]; // 探索全体の記録
}

export function startExpedition(
  loadout: readonly ItemId[],
  trait: TraitId,
  seed: number,
  armorChoice?: ItemId,
): ExpeditionState {
  const floors = generateEncounters(trait, seed);
  const combat = startCombat(buildPlayer(loadout, armorChoice), floors[0]![0]!);
  return {
    trait,
    floors,
    floor: 0,
    index: 0,
    combat,
    defeated: 0,
    outcome: 'ongoing',
    log: ['地下1階に降りた', ...combat.log],
  };
}

/** 1ラウンド戦い、勝ったら次の敵・次のフロアへ進める */
export function advance(state: ExpeditionState, action: CombatAction): Result<ExpeditionState> {
  if (state.outcome !== 'ongoing') return { ok: false, error: '探索は終わっています' };

  const r = act(state.combat, action);
  if (!r.ok) return r;
  const combat = r.value;
  const log = [...state.log, ...combat.log.slice(state.combat.log.length)];

  if (combat.outcome === 'ongoing') return ok({ ...state, combat, log });
  if (combat.outcome === 'lost') return ok({ ...state, combat, log, outcome: 'defeated' });

  // 勝利：次の敵へ
  const defeated = state.defeated + 1;
  const floorEnemies = state.floors[state.floor]!;
  if (state.index + 1 < floorEnemies.length) {
    const next = startCombat(combat.player, floorEnemies[state.index + 1]!);
    return ok({ ...state, combat: next, index: state.index + 1, defeated, log: [...log, ...next.log] });
  }

  // フロアを突破：休憩して次のフロアへ
  const nextFloor = state.floor + 1;
  if (nextFloor >= state.floors.length) {
    return ok({ ...state, combat, defeated, log: [...log, 'ダンジョンを踏破した'], outcome: 'cleared' });
  }
  const rested = rest(combat.player);
  const next = startCombat(rested, state.floors[nextFloor]![0]!);
  const isBoss = nextFloor === state.floors.length - 1;
  return ok({
    ...state,
    combat: next,
    floor: nextFloor,
    index: 0,
    defeated,
    log: [
      ...log,
      `休憩してHPが${rested.hp - combat.player.hp}回復`,
      isBoss ? '最深部に降りた' : `地下${nextFloor + 1}階に降りた`,
      ...next.log,
    ],
  });
}

export interface ExpeditionResult {
  outcome: 'cleared' | 'defeated';
  floorReached: number; // 1始まり。ボスフロアは floors + 1
  enemiesDefeated: number;
  player: PlayerStats;
}

export function toResult(state: ExpeditionState): ExpeditionResult {
  return {
    outcome: state.outcome === 'cleared' ? 'cleared' : 'defeated',
    floorReached: state.floor + 1,
    enemiesDefeated: state.defeated,
    player: state.combat.player,
  };
}

export function autoPlay(
  loadout: readonly ItemId[],
  trait: TraitId,
  seed: number,
  armorChoice?: ItemId,
): ExpeditionResult {
  let state = startExpedition(loadout, trait, seed, armorChoice);
  while (state.outcome === 'ongoing') {
    const r = advance(state, autoAction(state.combat));
    if (!r.ok) throw new Error(r.error); // AIが不正な行動を選んだらバグ
    state = r.value;
  }
  return toResult(state);
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

/** 多数のシードで自動プレイしたときのクリア率 */
export function clearRate(
  loadout: readonly ItemId[],
  trait: TraitId,
  trials = 200,
  armorChoice?: ItemId,
): number {
  let cleared = 0;
  for (let i = 0; i < trials; i++) {
    if (autoPlay(loadout, trait, i * 2654435761, armorChoice).outcome === 'cleared') cleared++;
  }
  return cleared / trials;
}
