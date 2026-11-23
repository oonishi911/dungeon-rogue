// 敵の図鑑（docs/enemy-weakness.md）。どれかのダンジョンに出る敵（道中の敵とボス）を、属性ごとに並べる。
// 出会ったことのある敵（SaveData.met）は、体質・属性・強さ・弱点・効きにくいもの・行動の個性がわかる。まだ出会っていない敵は「？？？」

import { ENEMIES } from './data';
import { DUNGEON_IDS, dungeonOf } from './dungeons';
import { BEHAVIOR_LABELS } from './enemyMaster';
import type { EnemyDef, EnemyId, TraitId } from './types';
import { weaknessOf, type FoeWeakness } from './weakness';

export interface BestiaryEntry {
  id: EnemyId;
  met: boolean;
  def: EnemyDef; // 敵の設定（強さは、ダンジョンの倍率を掛ける前）
  weakness: FoeWeakness;
  behaviors: string[]; // 行動の個性の名前
}

export interface BestiaryGroup {
  id: TraitId | 'boss';
  title: string;
  entries: BestiaryEntry[];
}

/** 図鑑の並び：道中の敵を属性ごとに、最後にボス */
const GROUPS: { id: TraitId | 'boss'; title: string }[] = [
  { id: 'fire', title: '炎の魔物' },
  { id: 'ice', title: '氷の魔物' },
  { id: 'light', title: '光の魔物' },
  { id: 'dark', title: '闇の魔物' },
  { id: 'neutral', title: '無属性の魔物' },
  { id: 'boss', title: '最深部の主' },
];

/** どれかのダンジョンに出る敵（道中の敵とボス。敵の設定に今もいるものだけ）。敵の設定の並び順 */
export function appearingEnemies(): EnemyId[] {
  const ids = new Set<EnemyId>();
  for (const d of DUNGEON_IDS) {
    for (const e of Object.values(dungeonOf(d).encounters)) {
      for (const id of e.pool) ids.add(id);
      ids.add(e.boss);
    }
  }
  return (Object.keys(ENEMIES) as EnemyId[]).filter((id) => ids.has(id));
}

/** 図鑑の中身（属性ごと。空の組は出さない） */
export function bestiary(met: readonly EnemyId[]): BestiaryGroup[] {
  const known = new Set(met);
  const entries = appearingEnemies().map((id): BestiaryEntry => {
    const def = ENEMIES[id]!;
    return { id, met: known.has(id), def, weakness: weaknessOf(def), behaviors: (def.behaviors ?? []).map((b) => BEHAVIOR_LABELS[b]) };
  });
  return GROUPS.map((g) => ({
    ...g,
    entries: entries.filter((e) => (g.id === 'boss' ? e.def.boss === true : e.def.boss !== true && e.def.element === g.id)),
  })).filter((g) => g.entries.length > 0);
}

/** 図鑑の埋まり具合（出会った数・全部の数） */
export function bestiaryProgress(met: readonly EnemyId[]): { met: number; total: number } {
  const all = appearingEnemies();
  const known = new Set(met);
  return { met: all.filter((id) => known.has(id)).length, total: all.length };
}
