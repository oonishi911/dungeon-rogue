import { type Field } from './exploreTypes';
import { isAdjacent } from './enemies';
import type { FloorMap, Pos } from './map';
import { tileAt } from './map';
import { samePos } from './exploreSight';
import type { EnemyDef } from './types';

/** 床に残る魔法の跡の数値（仮。遊んでみて調整する） */
export const FIELD_CONFIG = {
  fireTurns: 3, // 燃える床が残るターン数
  fireDamage: 2, // 燃える床に乗っているあいだ、毎ターン受けるダメージ（主人公にも敵にも）
  frostTurns: 4, // 霜の床が残るターン数
} as const;

export type FieldKind = Field['kind'];

export const fieldAt = (fields: readonly Field[], pos: Pos): Field | undefined => fields.find((f) => samePos(f.pos, pos));

/** 中心と、そのまわり8マス */
export function around9(center: Pos): Pos[] {
  const out: Pos[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out.push({ x: center.x + dx, y: center.y + dy });
  return out;
}

/** 炎の敵は燃える床に、氷の敵は霜の床に、影響を受けない */
export const immuneToField = (def: Pick<EnemyDef, 'element'>, kind: FieldKind): boolean => def.element === (kind === 'fire' ? 'fire' : 'ice');

/**
 * pos に床を置く。壁と keepOff（主人公のいるマス）には置かない。
 * 逆の床（同じマスか、縦横に隣り合うマス）があると、両方消えて水蒸気になる（steam に、水蒸気の出たマスを返す）。同じ床なら、残りターンを延ばす
 */
export function placeField(fields: readonly Field[], map: FloorMap, pos: Pos, kind: FieldKind, keepOff: Pos): { fields: Field[]; steam: Pos[] } {
  if (tileAt(map, pos) === 'wall' || samePos(pos, keepOff)) return { fields: [...fields], steam: [] };
  const opposite = kind === 'fire' ? 'frost' : 'fire';
  const clash = fields.filter((f) => f.kind === opposite && (samePos(f.pos, pos) || isAdjacent(f.pos, pos)));
  if (clash.length > 0) {
    return { fields: fields.filter((f) => !clash.includes(f)), steam: [pos, ...clash.map((f) => f.pos)] };
  }
  const turns = kind === 'fire' ? FIELD_CONFIG.fireTurns : FIELD_CONFIG.frostTurns;
  if (fields.some((f) => samePos(f.pos, pos))) return { fields: fields.map((f) => (samePos(f.pos, pos) ? { ...f, turns: Math.max(f.turns, turns) } : f)), steam: [] };
  return { fields: [...fields, { pos, kind, turns }], steam: [] };
}

/** 1ターン進める。残りのターンが0になった床は消える */
export const tickFields = (fields: readonly Field[]): Field[] => fields.map((f) => ({ ...f, turns: f.turns - 1 })).filter((f) => f.turns > 0);
