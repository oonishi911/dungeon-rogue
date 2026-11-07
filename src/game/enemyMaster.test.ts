import { describe, expect, it } from 'vitest';
import { ENEMIES, ENEMY_MASTER, TRAIT_ENEMIES } from './data';
// ファイルの中身そのもの（書き出した文字列と比べる）
import json from './enemies.json?raw';
import { masterProblems, parseEnemyMaster, serializeEnemyMaster, setWeight, weightOf, type EnemyMaster } from './enemyMaster';

const clone = (): EnemyMaster => JSON.parse(json) as EnemyMaster;

describe('敵のマスターデータ（enemies.json）', () => {
  it('正しい形になっている', () => {
    expect(masterProblems(JSON.parse(json))).toEqual([]);
  });

  it('ゲームで使う形に、id 付きで読める', () => {
    expect(ENEMIES.goblin).toEqual({ id: 'goblin', name: 'ゴブリン', hp: 14, atk: 8, def: 1, element: 'neutral', body: 'normal' });
    expect(ENEMIES.dark_lord.boss).toBe(true);
    expect(TRAIT_ENEMIES.neutral.boss).toBe('ogre_chief');
  });

  it('書き出すと、今のファイルと同じ文字列になる（管理画面で変えていないところは変わらない）', () => {
    expect(serializeEnemyMaster(ENEMY_MASTER)).toBe(json);
  });

  it('おかしい値を見つける', () => {
    const m = clone();
    m.enemies.goblin.hp = 0;
    m.enemies.goblin.name = '';
    m.dungeons.fire.boss = 'goblin';
    m.dungeons.ice.pool = [];
    m.dungeons.neutral.pool.push('ogre_chief');
    const problems = masterProblems(m);
    expect(problems).toContain('goblin：名前がない');
    expect(problems.some((p) => p.includes('HPは1〜999の整数'))).toBe(true);
    expect(problems.some((p) => p.includes('炎のダンジョン：ボスに選んだ敵が、ボスになっていない'))).toBe(true);
    expect(problems.some((p) => p.includes('氷のダンジョン：道中に出る敵が1体もいない'))).toBe(true);
    expect(problems.some((p) => p.includes('無属性のダンジョン：ボスは道中に出せない'))).toBe(true);
    expect(() => parseEnemyMaster(m)).toThrow();
  });

  it('出やすさを変えても、ほかの敵の並び順は変わらない', () => {
    const pool = TRAIT_ENEMIES.fire.pool;
    expect(weightOf(pool, 'flame_hound')).toBe(3);
    const less = setWeight(pool, 'flame_hound', 1);
    expect(less).toEqual(['fire_imp', 'fire_imp', 'flame_hound', 'lava_lizard', 'goblin']);
    const more = setWeight(pool, 'fire_imp', 3);
    expect(more).toEqual(['fire_imp', 'fire_imp', 'fire_imp', 'flame_hound', 'flame_hound', 'flame_hound', 'lava_lizard', 'goblin']);
    expect(setWeight(pool, 'stone_golem', 2)).toEqual([...pool, 'stone_golem', 'stone_golem']);
    expect(setWeight(pool, 'goblin', 0)).not.toContain('goblin');
  });
});
