// テストで使う敵。敵の種類は管理画面（?view=enemies）で足す・消すことができるので、
// テストは特定の敵（ゴブリンなど）に頼らず、データにある敵から選ぶ
import { ENEMIES } from './data';
import type { EnemyDef, EnemyId } from './types';

const all = Object.values(ENEMIES);

/** ボスでない敵（データの最初の1体） */
export const FIELD_ENEMY: EnemyId = (all.find((e) => !e.boss) ?? fail('ボスでない敵がいない')).id;

/** ボスの敵（データの最初の1体） */
export const BOSS_ENEMY: EnemyId = (all.find((e) => e.boss) ?? fail('ボスがいない')).id;

/** 防御が0より大きい、ボスでない敵（いなければ、最初のボスでない敵の防御を上げたもの） */
export const ARMORED_ENEMY: EnemyDef = all.find((e) => !e.boss && e.def > 0) ?? { ...ENEMIES[FIELD_ENEMY]!, def: 3 };

function fail(message: string): never {
  throw new Error(message);
}
