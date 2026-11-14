// 自動プレイ：簡易AIが step() を呼んで探索を最後まで進める。
// 画面で人が遊ぶときと同じ step() を使うので、バランステストの結果がそのまま手動プレイにも当てはまる。
// AIはプレイヤーと同じ情報（霧が晴れた場所と、今見えている敵）だけで判断する。

import { enchantMultiplier, playerHitDamage } from './combat';
import { ITEMS } from './data';
import { enemyDef, isAdjacent, key, type MapEnemy } from './enemies';
import { startExplore, step, toResult } from './explore';
import { type ExploreAction, type ExploreOptions, type ExploreResult, type ExploreState } from './exploreTypes';
import { dirBetween } from './exploreSight';
import type { Pos } from './map';
import { DIRS, findPath } from './path';
import type { ItemId, TraitId } from './types';

export const AUTOPLAY_CONFIG = {
  healBelow: 0.4, // HPがこの割合を下回ったら回復薬を使う
  eatBelow: 60, // 満腹度がこれを下回ったら食料を食べる
  // 無限ループ防止。最後まで遊んだときの長さの目安（階の数が5で、長くても1万ターンほど）の2倍に置く。
  // 低すぎると、まだ歩いている途中で「力尽きた」と数えてしまい、クリア率が実際より低く出る（階の数を増やすたびに起きる）
  maxTurns: 20000,
} as const;

/** 今の状態で取る行動を1つ決める */
export function autoAction(state: ExploreState): ExploreAction {
  const { stats, map, player } = state;
  const has = (kind: string) => stats.items.find((id) => ITEMS[id].effect.kind === kind);

  // 1. 回復と食事
  const potion = has('heal');
  if (potion && stats.hp < stats.maxHp * AUTOPLAY_CONFIG.healBelow) return { kind: 'use_item', item: potion };
  const food = has('food');
  if (food && state.satiety < AUTOPLAY_CONFIG.eatBelow) return { kind: 'use_item', item: food };

  // 2. 隣の敵を攻撃する。一番弱っている敵から
  const adjacent = state.enemies.filter((e) => isAdjacent(e.pos, player)).sort((a, b) => a.hp - b.hp);
  const target = adjacent[0];
  if (target) {
    const enchant = bestEnchant(state, target);
    if (enchant) return { kind: 'use_item', item: enchant };
    return { kind: 'move', dir: dirBetween(player, target.pos) };
  }

  // 3. 階段の上なら降りる
  const { stairs } = map;
  if (stairs && player.x === stairs.x && player.y === stairs.y) return { kind: 'descend' };

  // 4. 目的地（階段、ボス階ではボス）が見えていれば向かう。5. 見えていなければ、まだ見ていない場所へ近づく
  // ボスは歩くので、ボス階では今ボスがいるマスへ向かう
  const goal = stairs ?? state.enemies.find((e) => enemyDef(e).boss)?.pos ?? map.boss;
  const isGoal = (p: Pos) => goal !== null && p.x === goal.x && p.y === goal.y;
  const goalKnown = goal !== null && state.seen[goal.y * map.width + goal.x] === true;
  const avoid = eliteZone(state);
  const next = goalKnown ? firstStep(state, isGoal, avoid) : firstStep(state, (p) => touchesFog(state, p), avoid);
  if (next) return { kind: 'move', dir: dirBetween(player, next) };

  // 強敵の周りを避けると行き場がないときは、避けずに探す
  const fallback = firstStep(state, (p) => touchesFog(state, p) || (goalKnown && isGoal(p)), new Set());
  if (fallback) return { kind: 'move', dir: dirBetween(player, fallback) };
  return { kind: 'wait' };
}

/**
 * この敵に効く属性付与の道具。付与がまだなく、敵が1回の攻撃では倒れないときだけ使う。
 * いちばん倍率の高いものを選び、倍率が1以下なら使わない。
 */
function bestEnchant(state: ExploreState, target: MapEnemy): ItemId | undefined {
  const { stats } = state;
  if (stats.enchant) return undefined;
  const def = enemyDef(target);
  if (target.hp <= playerHitDamage(stats, def)) return undefined;
  let best: { id: ItemId; rate: number } | undefined;
  for (const id of stats.items) {
    const effect = ITEMS[id].effect;
    if (effect.kind !== 'enchant') continue;
    const rate = enchantMultiplier({ ...stats, enchant: { element: effect.element, hits: effect.hits } }, def);
    if (rate > 1 && (!best || rate > best.rate)) best = { id, rate };
  }
  return best?.id;
}

/** 見えている（または一度見た場所にいる）強敵の隣のマス。近づくと背後から確実に攻撃されるので避ける。ボスは倒しに行くので除く */
function eliteZone(state: ExploreState): Set<string> {
  const zone = new Set<string>();
  for (const e of state.enemies) {
    if (!e.elite || enemyDef(e).boss || !state.seen[e.pos.y * state.map.width + e.pos.x]) continue;
    zone.add(key(e.pos));
    for (const d of DIRS) zone.add(key({ x: e.pos.x + d.x, y: e.pos.y + d.y }));
  }
  return zone;
}

/** 隣に、まだ霧に覆われたマスがあるか */
function touchesFog(state: ExploreState, p: Pos): boolean {
  return DIRS.some((d) => {
    const n = { x: p.x + d.x, y: p.y + d.y };
    if (n.x < 0 || n.y < 0 || n.x >= state.map.width || n.y >= state.map.height) return false;
    return !state.seen[n.y * state.map.width + n.x];
  });
}

/** 一度見た通路だけを通って、goal を満たす最も近いマスへ向かう最初の1歩 */
function firstStep(state: ExploreState, goal: (p: Pos) => boolean, avoid: ReadonlySet<string>): Pos | null {
  return findPath(state, goal, avoid)?.[0] ?? null;
}

/** AIに最後まで遊ばせた結果 */
export function autoPlay(seed: number, options: ExploreOptions = {}): ExploreResult & { turns: number } {
  let state = startExplore(seed, options);
  while (state.outcome === 'ongoing' && state.turn < AUTOPLAY_CONFIG.maxTurns) {
    const r = step(state, autoAction(state));
    if (!r.ok) throw new Error(`AIが不正な行動を選んだ：${r.error}`); // AIのバグ
    state = r.value;
  }
  return { ...toResult(state), turns: state.turn };
}

/** 多数のシードで自動プレイしたときのクリア率 */
export function clearRate(
  loadout: readonly ItemId[],
  trait: TraitId,
  trials = 100,
  options: ExploreOptions = {},
): number {
  let cleared = 0;
  for (let i = 0; i < trials; i++) {
    if (autoPlay((i * 2654435761) >>> 0, { ...options, trait, loadout }).outcome === 'cleared') cleared++;
  }
  return cleared / trials;
}
