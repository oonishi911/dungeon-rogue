// 管理画面の「敵」の表の、見せ方の決まり：強さの目安、属性ごとのまとまり、探す・絞る・並べ替える。
// 敵のデータそのものは変えない（見る順番と見る範囲だけ）。画面の部品は EnemyPanels.tsx

import { TRAIT_LABELS, type EnemyMaster, type EnemyRecord } from './enemyMaster';
import type { EnemyId } from './types';

/**
 * 強さの目安：HP × 攻撃。道中でいちばんこの数字が大きい敵が、そのダンジョンの強敵の元になる（enemies.ts の strongestOf）。
 * 防御や物理・魔法の倍率は入れていない（目安）
 */
export const enemyStrength = (e: Pick<EnemyRecord, 'hp' | 'atk'>): number => e.hp * e.atk;

/** まとまりの種類。ボスは属性と別にまとめる */
export type EnemyGroup = 'boss' | 'neutral' | 'fire' | 'ice' | 'light' | 'dark';

/** まとまりの並び順と名前 */
export const ENEMY_GROUPS: readonly { id: EnemyGroup; label: string }[] = [
  { id: 'boss', label: 'ボス' },
  { id: 'neutral', label: `${TRAIT_LABELS.neutral}の敵` },
  { id: 'fire', label: `${TRAIT_LABELS.fire}の敵` },
  { id: 'ice', label: `${TRAIT_LABELS.ice}の敵` },
  { id: 'light', label: `${TRAIT_LABELS.light}の敵` },
  { id: 'dark', label: `${TRAIT_LABELS.dark}の敵` },
];

export const groupOf = (e: Pick<EnemyRecord, 'boss' | 'element'>): EnemyGroup => (e.boss ? 'boss' : e.element);

/** 並べ替えの種類。master：今のデータの順（属性ごとにまとめて出す）。それ以外は、まとめずに1つの列で出す */
export type EnemySort = 'master' | 'strength' | 'hp' | 'atk' | 'name';

export const ENEMY_SORTS: readonly { id: EnemySort; label: string }[] = [
  { id: 'master', label: '属性ごと' },
  { id: 'strength', label: '強さの目安（強い順）' },
  { id: 'hp', label: 'HP（多い順）' },
  { id: 'atk', label: '攻撃（高い順）' },
  { id: 'name', label: '名前' },
];

export interface EnemyFilter {
  query: string; // 名前か ID の一部（大文字小文字は区別しない）
  changedOnly: boolean; // 公開版から変えた敵（足した敵も）だけ
}

const stable = (e: EnemyRecord): string => JSON.stringify(e);

/** 公開版から変えた敵か（公開版にない、足した敵も） */
export function enemyChanged(base: EnemyMaster, draft: EnemyMaster, id: EnemyId): boolean {
  const b = base.enemies[id];
  const d = draft.enemies[id];
  return !b || !d || stable(b) !== stable(d);
}

/** 絞り込んだ敵の ID（今のデータの順のまま） */
export function filterEnemies(base: EnemyMaster, draft: EnemyMaster, ids: readonly EnemyId[], filter: EnemyFilter): EnemyId[] {
  const q = filter.query.trim().toLowerCase();
  return ids.filter((id) => {
    const e = draft.enemies[id];
    if (!e) return false;
    if (q && !e.name.toLowerCase().includes(q) && !id.toLowerCase().includes(q)) return false;
    return !filter.changedOnly || enemyChanged(base, draft, id);
  });
}

/** 並べ替えた敵の ID。同じ値のときは、今のデータの順を保つ */
export function sortEnemies(draft: EnemyMaster, ids: readonly EnemyId[], sort: EnemySort): EnemyId[] {
  const e = (id: EnemyId) => draft.enemies[id]!;
  const key: Record<EnemySort, (id: EnemyId) => number> = {
    master: () => 0,
    strength: (id) => -enemyStrength(e(id)),
    hp: (id) => -e(id).hp,
    atk: (id) => -e(id).atk,
    name: () => 0,
  };
  if (sort === 'name') return [...ids].sort((a, b) => e(a).name.localeCompare(e(b).name, 'ja'));
  return ids.map((id, i) => ({ id, i })).sort((a, b) => key[sort](a.id) - key[sort](b.id) || a.i - b.i).map((x) => x.id);
}

/** 属性ごとにまとめる（並び順は ENEMY_GROUPS。敵のいないまとまりは出さない。まとまりの中は、渡した順のまま） */
export function groupEnemies(draft: EnemyMaster, ids: readonly EnemyId[]): { group: EnemyGroup; label: string; ids: EnemyId[] }[] {
  return ENEMY_GROUPS.map((g) => ({ group: g.id, label: g.label, ids: ids.filter((id) => groupOf(draft.enemies[id]!) === g.id) })).filter((g) => g.ids.length > 0);
}
