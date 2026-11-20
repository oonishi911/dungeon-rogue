// 敵にかける状態異常（燃焼・凍結）と、そのコンボ。設計は docs/combat-fun-spec.md ①、数字は statuses.json の foe（管理画面の「状態異常」タブ）。
// ・燃焼：数ターン、毎ターン決まったダメージ（守りは関係ない）。炎の呪文は必ず、炎の砥石で殴ったときは確率でかかる
// ・凍結：数ターン動けない（強衝撃の stun と同じ。切れると解ける）。氷の呪文は必ず、氷の砥石で殴ったときは確率でかかる
// ・炎の敵は燃えない、氷の敵は凍らない（ボスも凍らない）。弱点の属性（炎→氷の敵、氷→炎の敵）なら、ターンが延びる
// ・燃焼と凍結が出会うと、蒸気になって打ち消し合う（どちらも消えて、新しい状態もかからない）
// ・コンボ：ハンマー × 凍結 ＝ 砕く（ダメージ増、凍結が解ける）／ 剣 × 燃焼 ＝ 焼き斬り（残りの燃焼のダメージを一度に与え、火が消える）／ 杖の呪文 × 燃焼・凍結 ＝ ダメージ増

import { ENCHANT_VS_ELEMENT, STATUS_MASTER } from './data';
import { enemyDef, type MapEnemy } from './enemies';
import type { Element } from './types';

export type FoeStatusKind = 'burn' | 'freeze';
export type ComboKind = 'smash' | 'sear' | 'arcane';

/** 状態異常にかける属性（炎→燃焼、氷→凍結。ほかの属性はかけない） */
export const foeKindOf = (element: Element | null | undefined): FoeStatusKind | null => (element === 'fire' ? 'burn' : element === 'ice' ? 'freeze' : null);

/** その敵に、その状態異常がかからないか（炎の敵は燃えない、氷の敵と、ボスは凍らない） */
export function foeImmune(enemy: Pick<MapEnemy, 'id' | 'elite' | 'phase'>, kind: FoeStatusKind): boolean {
  const def = enemyDef(enemy);
  return kind === 'burn' ? def.element === 'fire' : def.element === 'ice' || def.boss === true;
}

/** 砥石で殴ったときに、かかる確率（0〜1） */
export const whetstoneChance = (kind: FoeStatusKind): number => STATUS_MASTER.foe[kind === 'burn' ? 'burn' : 'freeze'].chance / 100;

/** かけたときのターン数（弱点の属性なら延びる） */
export function foeTurns(enemy: Pick<MapEnemy, 'id' | 'elite' | 'phase'>, element: Element, kind: FoeStatusKind): number {
  const weak = (ENCHANT_VS_ELEMENT[element][enemyDef(enemy).element] ?? 1) > 1;
  return STATUS_MASTER.foe[kind].turns + (weak ? STATUS_MASTER.foe.weakBonus : 0);
}

export interface FoeApplied {
  enemy: MapEnemy;
  log: string;
  steam: boolean; // 燃焼と凍結が打ち消し合った（蒸気の演出）
}

/** 敵に燃焼・凍結をかける。かからない（免疫）ときは null */
export function applyFoeStatus(enemy: MapEnemy, element: Element, kind: FoeStatusKind): FoeApplied | null {
  if (foeImmune(enemy, kind)) return null;
  const name = enemyDef(enemy).name;
  if (kind === 'burn') {
    if (enemy.frozen) {
      const { frozen: _f, stun: _s, ...rest } = enemy;
      return { enemy: rest, log: `蒸気が上がり、${name}の氷が溶けた`, steam: true };
    }
    const turns = Math.max(enemy.burn?.turns ?? 0, foeTurns(enemy, element, 'burn'));
    return { enemy: { ...enemy, burn: { turns, amount: STATUS_MASTER.foe.burn.damage } }, log: `${name}は燃え上がった（${turns}ターン）`, steam: false };
  }
  if (enemy.burn) {
    const { burn: _b, ...rest } = enemy;
    return { enemy: rest, log: `蒸気が上がり、${name}の炎が消えた`, steam: true };
  }
  const turns = Math.max(enemy.frozen ? (enemy.stun ?? 0) : 0, foeTurns(enemy, element, 'freeze'));
  return { enemy: { ...enemy, frozen: true, stun: Math.max(enemy.stun ?? 0, turns) }, log: `${name}は凍りついた（${turns}ターン）`, steam: false };
}

/** 凍結だけ取り除く（砕いた・溶けたとき）。stun も一緒に外す */
export function thaw(enemy: MapEnemy): MapEnemy {
  const { frozen: _f, stun: _s, ...rest } = enemy;
  return rest;
}

/** 燃焼を消す（焼き斬りで火が消えた） */
export function extinguish(enemy: MapEnemy): MapEnemy {
  const { burn: _b, ...rest } = enemy;
  return rest;
}

/** 燃焼の残りのダメージの合計（焼き斬りで、一度に与える分） */
export const burnRemaining = (enemy: Pick<MapEnemy, 'burn'>): number => (enemy.burn ? enemy.burn.turns * enemy.burn.amount : 0);

/** 倍率（%）をかけて、四捨五入する */
export const scaled = (dmg: number, percent: number): number => Math.max(1, Math.round((dmg * percent) / 100));
