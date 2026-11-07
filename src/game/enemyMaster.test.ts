import { describe, expect, it } from 'vitest';
import { ENEMIES, ENEMY_MASTER, TRAIT_ENEMIES } from './data';
// ファイルの中身そのもの（書き出した文字列と比べる）
import json from './enemies.json?raw';
import {
  addEnemy,
  describeChanges,
  dungeonsWithBoss,
  masterProblems,
  parseEnemyMaster,
  removeEnemy,
  serializeEnemyMaster,
  setWeight,
  weightOf,
  type EnemyMaster,
} from './enemyMaster';
// 関数を確かめるための、決まった中身のデータ（管理画面で enemies.json を変えても、こちらは変わらない）
import sample from './enemyMaster.sample.json';

const clone = (): EnemyMaster => JSON.parse(JSON.stringify(sample)) as EnemyMaster;

describe('敵のマスターデータ（enemies.json）', () => {
  it('正しい形になっている', () => {
    expect(masterProblems(JSON.parse(json))).toEqual([]);
  });

  it('ゲームで使う形に、id 付きで読める（見た目は含めない）', () => {
    for (const [id, def] of Object.entries(ENEMIES)) {
      expect(def.id).toBe(id);
      expect(def).not.toHaveProperty('look');
    }
    for (const d of Object.values(TRAIT_ENEMIES)) expect(ENEMIES[d.boss]?.boss).toBe(true);
  });

  it('書き出すと、今のファイルと同じ文字列になる（管理画面で変えていないところは変わらない）', () => {
    expect(serializeEnemyMaster(ENEMY_MASTER)).toBe(json);
  });
});

describe('敵のマスターデータを扱う関数', () => {
  it('おかしい値を見つける', () => {
    const m = clone();
    m.enemies.goblin!.hp = 0;
    m.enemies.goblin!.name = '';
    m.enemies.giant_rat!.name = '石ゴーレム';
    m.enemies.fire_imp!.look = { sprite: 'hero' as never };
    m.dungeons.fire.boss = 'goblin';
    m.dungeons.ice.pool = [];
    m.dungeons.neutral.pool.push('ogre_chief', 'nobody');
    const problems = masterProblems(m);
    expect(problems).toContain('goblin：名前がない');
    expect(problems.some((p) => p.includes('HPは1〜999の整数'))).toBe(true);
    expect(problems.some((p) => p.includes('同じ名前の敵がほかにもいる'))).toBe(true);
    expect(problems.some((p) => p.includes('見た目のもとの絵が正しくない'))).toBe(true);
    expect(problems.some((p) => p.includes('炎のダンジョン：ボスに選んだ敵が、ボスになっていない'))).toBe(true);
    expect(problems.some((p) => p.includes('氷のダンジョン：道中に出る敵が1体もいない'))).toBe(true);
    expect(problems.some((p) => p.includes('無属性のダンジョン：ボスは道中に出せない'))).toBe(true);
    expect(problems.some((p) => p.includes('いない敵が入っている（nobody）'))).toBe(true);
    expect(() => parseEnemyMaster(m)).toThrow();
  });

  it('敵の ID は、英小文字で始まり英小文字・数字・_ だけ', () => {
    const m = addEnemy(clone(), 'Bad-Id', { ...clone().enemies.goblin!, name: '新しい敵' });
    expect(masterProblems(m).some((p) => p.startsWith('ID「Bad-Id」'))).toBe(true);
  });

  it('敵を足すと、データの最後に入り、まだどのダンジョンにも出ない', () => {
    const m = addEnemy(clone(), 'cave_bat', { ...clone().enemies.giant_rat!, name: '洞窟コウモリ' });
    expect(Object.keys(m.enemies).at(-1)).toBe('cave_bat');
    expect(masterProblems(m)).toEqual([]);
    expect(describeChanges(clone(), m)).toEqual(['洞窟コウモリ（cave_bat）を足す']);
  });

  it('敵を消すと、道中の敵からも外れる。ボスにしている敵を消すと、ボスがいなくなる', () => {
    const m = removeEnemy(clone(), 'goblin');
    expect(m.enemies).not.toHaveProperty('goblin');
    for (const d of Object.values(m.dungeons)) expect(d.pool).not.toContain('goblin');
    expect(masterProblems(m)).toEqual([]);
    expect(describeChanges(clone(), m)).toEqual(['ゴブリン（goblin）を消す']);
    expect(dungeonsWithBoss(clone(), 'ogre_chief')).toEqual(['neutral']);
    expect(masterProblems(removeEnemy(clone(), 'ogre_chief'))).toContain('無属性のダンジョン：ボスがいない');
  });

  it('変えた内容を、日本語で並べる', () => {
    const m = clone();
    m.enemies.goblin!.hp = 20;
    m.dungeons.fire.pool = setWeight(m.dungeons.fire.pool, 'goblin', 2);
    expect(describeChanges(clone(), m)).toEqual(['ゴブリン：HP 14 → 20', '炎のダンジョン：ゴブリンの出やすさ 1 → 2']);
  });

  it('出やすさを変えても、ほかの敵の並び順は変わらない', () => {
    const pool = clone().dungeons.fire.pool;
    expect(weightOf(pool, 'flame_hound')).toBe(3);
    expect(setWeight(pool, 'flame_hound', 1)).toEqual(['fire_imp', 'fire_imp', 'flame_hound', 'lava_lizard', 'goblin']);
    expect(setWeight(pool, 'fire_imp', 3)).toEqual(['fire_imp', 'fire_imp', 'fire_imp', 'flame_hound', 'flame_hound', 'flame_hound', 'lava_lizard', 'goblin']);
    expect(setWeight(pool, 'stone_golem', 2)).toEqual([...pool, 'stone_golem', 'stone_golem']);
    expect(setWeight(pool, 'goblin', 0)).not.toContain('goblin');
  });

  it('見た目の色を空にしたときは、書き出さない', () => {
    const m = clone();
    m.enemies.goblin!.look = { sprite: 'goblin', recolor: {} };
    expect(serializeEnemyMaster(m)).toContain('"look": {\n        "sprite": "goblin"\n      }');
  });
});
