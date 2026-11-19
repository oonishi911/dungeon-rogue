import { ITEMS } from './data';
import { gaugeWithPulse } from './echo';
import { gearOf } from './itemMaster';
import type { EchoId, ItemId, WeaponType } from './types';

/** 武器の固有技（技ゲージ）の数値（仮。遊んでみて調整する） */
export const SKILL_CONFIG = {
  gauge: [
    { upTo: 3, max: 4 }, // 1〜3段の武器は、通常攻撃を4回当てると満タン
    { upTo: 7, max: 3 }, // 4〜7段は3回
    { upTo: 10, max: 2 }, // 8〜10段は2回
  ],
  slashRate: 1.6, // 剣「連斬り」：合計で、通常の何倍のダメージか（2回に分けて当てる）
  slashHits: 2,
  bleedTurns: 3, // 連斬りで当たった敵の出血のターン数
  bleedRate: 0.2, // 出血で毎ターン受けるダメージは、1回に与えたダメージの何割か
  slamStun: 1, // 槌「地響き」：当たった敵が動けなくなるターン数
  boltRate: 1.5, // 杖「魔力弾」：魔法の強さの何倍のダメージか
  boltRange: 5, // 魔力弾が届くマス数
} as const;

export const SKILL_NAMES: Record<WeaponType, string> = { sword: '連斬り', hammer: '地響き', staff: '魔力弾' };

export const SKILL_TEXTS: Record<WeaponType, string> = {
  sword: '向いた方向の敵に2回斬りつける（合計で通常の1.6倍）。当たった敵は3ターン出血する',
  hammer: 'まわり8マスの敵すべてに通常のダメージを与え、1ターン動けなくする',
  staff: '向いた方向の最初の敵に、魔法の強さの1.5倍のダメージ（敵の防御は無視）',
};

/** 技ゲージが満タンになるまでの、通常攻撃の回数（武器の段階で決まる） */
export function gaugeMax(tier: number): number {
  return (SKILL_CONFIG.gauge.find((g) => tier <= g.upTo) ?? SKILL_CONFIG.gauge[SKILL_CONFIG.gauge.length - 1]!).max;
}

/** 持っている武器の固有技。武器がなければ null（素手には技がない）。echoes：刻印武器にはめた残響（鼓動の残響で、満タンまでの回数が減る） */
export function skillOf(weapon: ItemId | null, echoes?: readonly EchoId[]): { weapon: WeaponType; name: string; max: number } | null {
  const effect = weapon ? ITEMS[weapon].effect : null;
  if (!weapon || effect?.kind !== 'weapon') return null;
  return { weapon: effect.weapon, name: SKILL_NAMES[effect.weapon], max: gaugeWithPulse(gaugeMax(gearOf(weapon)?.tier ?? 1), echoes) };
}
