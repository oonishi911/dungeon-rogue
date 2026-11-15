import { describe, expect, it } from 'vitest';
import { copyJson } from './adminScreen';
import { ENEMY_GROUPS, enemyChanged, enemyStrength, filterEnemies, groupEnemies, groupOf, sortEnemies } from './enemyView';
import { enemyIds, type EnemyMaster } from './enemyMaster';
// 決まった中身のデータ（enemies.json を管理画面で変えても、こちらは変わらない）
import sample from './enemyMaster.sample.json';

const BASE = { enemies: copyJson(sample.enemies) } as EnemyMaster;
const ids = enemyIds(BASE);

describe('管理画面の敵の表の見せ方', () => {
  it('強さの目安は HP × 攻撃', () => {
    expect(enemyStrength({ hp: 14, atk: 8 })).toBe(112);
  });

  it('属性ごとにまとめる：ボスは別、並びは ENEMY_GROUPS の順、敵のいないまとまりは出さない', () => {
    const groups = groupEnemies(BASE, ids);
    const order = ENEMY_GROUPS.map((g) => g.id);
    expect(groups.map((g) => g.group)).toEqual(order.filter((g) => groups.some((x) => x.group === g)));
    expect(groups.flatMap((g) => g.ids).sort()).toEqual([...ids].sort());
    for (const g of groups) for (const id of g.ids) expect(groupOf(BASE.enemies[id]!)).toBe(g.group);
    expect(groups.find((g) => g.group === 'boss')?.ids.every((id) => BASE.enemies[id]!.boss)).toBe(true);
  });

  it('名前か ID の一部で探す（大文字小文字は区別しない）', () => {
    const by = (query: string) => filterEnemies(BASE, BASE, ids, { query, changedOnly: false });
    expect(by('ゴブ')).toContain('goblin');
    expect(by('GOBLIN')).toContain('goblin');
    expect(by('  ')).toEqual(ids);
    expect(by('ありえない名前')).toEqual([]);
  });

  it('変えた敵（足した敵も）だけに絞る', () => {
    const draft = copyJson(BASE);
    draft.enemies.goblin!.hp += 1;
    draft.enemies.fresh = { ...copyJson(draft.enemies.goblin!), name: '新入り' };
    const changed = filterEnemies(BASE, draft, enemyIds(draft), { query: '', changedOnly: true });
    expect(changed.sort()).toEqual(['fresh', 'goblin']);
    expect(enemyChanged(BASE, draft, 'giant_rat')).toBe(false);
    expect(enemyChanged(BASE, draft, 'fresh')).toBe(true);
  });

  it('並べ替え：強さ・HP・攻撃は大きい順（同じ値は今の順のまま）、名前は五十音順', () => {
    const strong = sortEnemies(BASE, ids, 'strength');
    const s = strong.map((id) => enemyStrength(BASE.enemies[id]!));
    expect(s).toEqual([...s].sort((a, b) => b - a));
    const hp = sortEnemies(BASE, ids, 'hp').map((id) => BASE.enemies[id]!.hp);
    expect(hp).toEqual([...hp].sort((a, b) => b - a));
    expect(sortEnemies(BASE, ids, 'master')).toEqual(ids);
    const names = sortEnemies(BASE, ids, 'name').map((id) => BASE.enemies[id]!.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'ja')));
    // 同じ値のとき、元の順を保つ
    const tie = copyJson(BASE);
    for (const id of ids) tie.enemies[id]!.hp = 5;
    expect(sortEnemies(tie, ids, 'hp')).toEqual(ids);
  });
});
