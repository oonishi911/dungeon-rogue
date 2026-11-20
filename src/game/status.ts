// 状態異常の働き（毒・鈍足・空腹）。設計は docs/status-spec.md、数字は src/game/statuses.json（管理画面の「状態異常」タブ）。
// ・敵の攻撃でダメージが入ると、その敵に持たせた個性（poison・chill・hunger）の状態異常に、確率でかかる。
//   確率 ＝ 設定の確率 × その敵の攻撃が受けるダメージの倍率（指輪の耐性・弱点。combat.ts の elementRate）。上限は100%
// ・同じ状態異常にもう一度かかると、残りが設定の長さまで延びる（重なって強くはならない）。ちがう種類は、同時にかかる
// ・毒：毎ターン、守りに関係なくダメージ（explore.ts の applyPoison）。鈍足：歩くのに2ターンかかる（explore.ts の step）。空腹：その場で満腹度が減る
// ・万能薬で、毒と鈍足がすべて治る。階を移っても続き、中断データにも保存する。ボスは今のところ与えない

import { elementRate } from './combat';
import { STATUS_MASTER } from './data';
import { behaviorsOf } from './enemies';
import { nextRandom } from './rng';
import { STATUS_IDS, STATUS_LABELS, type StatusId } from './statusMaster';
import type { EnemyDef, PlayerStats } from './types';

/** 状態異常にかかっているか（空腹はその場で終わるので、毒と鈍足だけ） */
export const isAfflicted = (stats: Pick<PlayerStats, 'poisonTurns' | 'chillSteps'>): boolean => stats.poisonTurns > 0 || (stats.chillSteps ?? 0) > 0;

/** 今かかっている状態異常（画面の表示用）。remain は残りのターン数・歩数 */
export function activeStatuses(stats: Pick<PlayerStats, 'poisonTurns' | 'chillSteps'>): { id: StatusId; remain: number }[] {
  const out: { id: StatusId; remain: number }[] = [];
  if (stats.poisonTurns > 0) out.push({ id: 'poison', remain: stats.poisonTurns });
  if ((stats.chillSteps ?? 0) > 0) out.push({ id: 'chill', remain: stats.chillSteps! });
  return out;
}

/** その敵の攻撃で、状態異常にかかる確率（0〜1）。指輪の耐性で下がり、弱点で上がる */
export function statusChance(player: PlayerStats, enemy: EnemyDef, id: StatusId): number {
  return Math.min(1, Math.max(0, (STATUS_MASTER[id].chance / 100) * elementRate(player, enemy)));
}

export interface Affliction {
  stats: PlayerStats;
  satiety: number;
  rngState: number;
  log: string[]; // 増えたログ
}

/**
 * 敵の攻撃が当たったあとの状態異常。その敵の個性にある状態異常ごとに、確率を引く（個性がなければ何も引かない＝乱数も使わない）。
 * ボスは与えない
 */
export function afflict(from: { stats: PlayerStats; satiety: number; rngState: number }, def: EnemyDef): Affliction {
  let { stats, satiety, rngState } = from;
  const log: string[] = [];
  if (def.boss) return { stats, satiety, rngState, log };
  const behaviors = behaviorsOf(def);
  for (const id of STATUS_IDS) {
    if (!behaviors.includes(id)) continue;
    const roll = nextRandom(rngState);
    rngState = roll.state;
    if (roll.value >= statusChance(stats, def, id)) continue;
    if (id === 'poison') {
      const { turns } = STATUS_MASTER.poison;
      log.push(stats.poisonTurns > 0 ? `${def.name}の攻撃で、毒が長引く` : `${def.name}の攻撃で、毒にかかった`);
      stats = { ...stats, poisonTurns: Math.max(stats.poisonTurns, turns) };
    } else if (id === 'chill') {
      const { steps } = STATUS_MASTER.chill;
      log.push((stats.chillSteps ?? 0) > 0 ? `${def.name}の攻撃で、足が重いまま` : `${def.name}の攻撃で、足が重くなった（鈍足）`);
      stats = { ...stats, chillSteps: Math.max(stats.chillSteps ?? 0, steps) };
    } else {
      const lost = Math.min(satiety, STATUS_MASTER.hunger.amount);
      satiety -= lost;
      log.push(`${def.name}の攻撃で、お腹が空いた（満腹度が${lost}減った）`);
    }
  }
  return { stats, satiety, rngState, log };
}

/** 万能薬：毒と鈍足をすべて治す。治すものがなければ null */
export function cureAll(stats: PlayerStats): { stats: PlayerStats; cured: StatusId[] } | null {
  const cured = activeStatuses(stats).map((s) => s.id);
  if (!cured.length) return null;
  const { chillSteps: _chill, ...rest } = stats;
  return { stats: { ...rest, poisonTurns: 0 }, cured };
}

export const statusNames = (ids: readonly StatusId[]): string => ids.map((id) => STATUS_LABELS[id]).join('と');
