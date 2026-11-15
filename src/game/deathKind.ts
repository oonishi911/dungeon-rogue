// 倒れた敵の、倒れ方の種類（画面の演出で使う。ルールには関係しない）。
// 氷の敵は砕け、霊体は霧のように消え、スライムは弾け、硬い敵は崩れる。それ以外は、つぶれて倒れる

import type { EnemyDef, EnemyId } from './types';

export type DeathKind = 'shatter' | 'vanish' | 'burst' | 'crumble' | 'collapse';

export function deathKindOf(id: EnemyId, def: Pick<EnemyDef, 'element' | 'body'>): DeathKind {
  if (def.element === 'ice') return 'shatter';
  if (def.body === 'spirit') return 'vanish';
  if (id.includes('slime')) return 'burst';
  if (def.body === 'hard') return 'crumble';
  return 'collapse';
}
