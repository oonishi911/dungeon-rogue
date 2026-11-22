// ボスの3段階の変化。HPが 2/3 以下になると第2段階、1/3 以下になると第3段階になる。
// 段階が上がるたびに攻撃力が上がり、新しい行動が加わる（前の段階の行動は、そのまま続く）。
// 段階が上がったターンは、咆哮して動かない（攻撃も、移動もしない）。
//
// 段階ごとの行動は、ここ（コード）で決める。敵のマスター（enemies.json）や管理画面の「敵」の表では変えられない。
// 行動の個性（遠距離・突進・盾持ち・召喚）は、敵の個性と同じ仕組みで動く。床をまく（sow）だけは、ボスだけの行動

import type { EnemyBehavior, EnemyId } from './types';

export const BOSS_CONFIG = {
  atkStep: 0.25, // 段階が1つ上がるごとに、攻撃力がこの割合ずつ増える（第2段階 ×1.25、第3段階 ×1.5）
  sowEvery: 4, // 床をまく：何ターンごとか
  sowCount: 5, // 床をまく：一度にまく数
  sowRadius: 2, // 床をまく：主人公からこのマス数以内（縦横それぞれ）にまく
} as const;

export const PHASE_MAX = 3;

interface PhaseRule {
  behaviors: readonly EnemyBehavior[]; // この段階で加わる行動の個性
  sow?: 'fire' | 'frost'; // この段階から、主人公のまわりにこの床をまく
}

/** ボスごとの、第2段階・第3段階で加わる行動 */
export const PHASE_RULES: Readonly<Record<EnemyId, readonly [PhaseRule, PhaseRule]>> = {
  flame_beast: [{ behaviors: [], sow: 'fire' }, { behaviors: ['charger'] }], // 炎の魔獣：燃える床をまく → 突進
  ice_colossus: [{ behaviors: [], sow: 'frost' }, { behaviors: ['shield'] }], // 氷の巨像：霜の床をまく → 盾
  ogre_chief: [{ behaviors: ['summoner'] }, { behaviors: ['charger'] }], // 鬼の首領：手下を呼ぶ → 突進
  light_guardian: [{ behaviors: ['shield'] }, { behaviors: ['ranged'] }], // 光の守護者：盾 → 遠距離
  dark_lord: [{ behaviors: ['summoner'] }, { behaviors: ['ranged'] }], // 闇の王：手下を呼ぶ → 遠距離
};

/** HPから決まる段階（1〜3）。maxHp は元のHP */
export function phaseOf(hp: number, maxHp: number): number {
  return 1 + (hp * 3 <= maxHp * 2 ? 1 : 0) + (hp * 3 <= maxHp ? 1 : 0);
}

/** その段階までに加わった行動の個性（段階1は空） */
export function phaseBehaviors(id: EnemyId, phase: number): EnemyBehavior[] {
  const rules = PHASE_RULES[id] ?? [];
  return rules.slice(0, Math.max(0, phase - 1)).flatMap((r) => r.behaviors);
}

/** その段階でまいている床の種類（まかないときは null） */
export function phaseSow(id: EnemyId, phase: number): 'fire' | 'frost' | null {
  const rules = PHASE_RULES[id] ?? [];
  return rules.slice(0, Math.max(0, phase - 1)).reduce<'fire' | 'frost' | null>((sow, r) => r.sow ?? sow, null);
}

/** 段階による攻撃力の倍率 */
export const phaseAtkRate = (phase: number): number => 1 + BOSS_CONFIG.atkStep * (Math.max(1, phase) - 1);
