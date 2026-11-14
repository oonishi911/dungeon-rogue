import { describe, expect, it } from 'vitest';
import { ENEMIES } from './data';
import {
  addEnemy,
  describeChanges,
  describeEncounterChanges,
  encounterProblems,
  encountersWithout,
  masterProblems,
  parseEnemyMaster,
  removeEnemy,
  serializeEnemyMaster,
  setWeight,
  traitsWithBoss,
  weightOf,
  type Encounters,
  type EnemyMaster,
} from './enemyMaster';
// 関数を確かめるための、決まった中身のデータ（管理画面で enemies.json やダンジョンの設定を変えても、こちらは変わらない）
import sample from './enemyMaster.sample.json';

const clone = (): EnemyMaster => ({ enemies: JSON.parse(JSON.stringify(sample.enemies)) as EnemyMaster['enemies'] });
const encounters = (): Encounters => JSON.parse(JSON.stringify(sample.encounters)) as Encounters;
const nameOf = (id: string) => sample.enemies[id as keyof typeof sample.enemies]?.name ?? id;

describe('敵のマスターデータ（enemies.json）', () => {
  it('ゲームで使う形に、id 付きで読める（見た目は含めない）', () => {
    for (const [id, def] of Object.entries(ENEMIES)) {
      expect(def.id).toBe(id);
      expect(def).not.toHaveProperty('look');
    }
  });
});

describe('敵のマスターデータを扱う関数', () => {
  it('おかしい値を見つける', () => {
    const m = clone();
    m.enemies.goblin!.hp = 0;
    m.enemies.goblin!.name = '';
    m.enemies.giant_rat!.name = '石ゴーレム';
    m.enemies.fire_imp!.look = { sprite: 'hero' as never };
    const problems = masterProblems(m);
    expect(problems).toContain('goblin：名前がない');
    expect(problems.some((p) => p.includes('HPは1〜999の整数'))).toBe(true);
    expect(problems.some((p) => p.includes('同じ名前の敵がほかにもいる'))).toBe(true);
    expect(problems.some((p) => p.includes('見た目のもとの絵が正しくない'))).toBe(true);
    expect(() => parseEnemyMaster(m)).toThrow();
  });

  it('敵の ID は、英小文字で始まり英小文字・数字・_ だけ', () => {
    const m = addEnemy(clone(), 'Bad-Id', { ...clone().enemies.goblin!, name: '新しい敵' });
    expect(masterProblems(m).some((p) => p.startsWith('ID「Bad-Id」'))).toBe(true);
  });

  it('敵を足すと、データの最後に入る（どのダンジョンに出るかは、ダンジョンの設定で決める）', () => {
    const m = addEnemy(clone(), 'cave_bat', { ...clone().enemies.giant_rat!, name: '洞窟コウモリ' });
    expect(Object.keys(m.enemies).at(-1)).toBe('cave_bat');
    expect(masterProblems(m)).toEqual([]);
    expect(describeChanges(clone(), m)).toEqual(['洞窟コウモリ（cave_bat）を足す']);
  });

  it('敵を消すと、マスターからいなくなる', () => {
    const m = removeEnemy(clone(), 'goblin');
    expect(m.enemies).not.toHaveProperty('goblin');
    expect(masterProblems(m)).toEqual([]);
    expect(describeChanges(clone(), m)).toEqual(['ゴブリン（goblin）を消す']);
  });

  it('変えた内容を、日本語で並べる', () => {
    const m = clone();
    m.enemies.goblin!.hp = 20;
    expect(describeChanges(clone(), m)).toEqual(['ゴブリン：HP 14 → 20']);
  });

  it('見た目の色を空にしたときは、書き出さない', () => {
    const m = clone();
    m.enemies.goblin!.look = { sprite: 'goblin', recolor: {} };
    expect(serializeEnemyMaster(m)).toContain('"look": {\n        "sprite": "goblin"\n      }');
  });
});

describe('ダンジョンの属性ごとに出る敵（ダンジョンの設定の encounters）', () => {
  it('マスターにいる敵から選んでいれば、問題はない', () => {
    expect(encounterProblems(encounters(), clone())).toEqual([]);
  });

  it('おかしい選び方を見つける（ボスでない敵をボスに、道中が空、道中にボス、マスターにいない敵）', () => {
    const e = encounters();
    e.fire.boss = 'goblin';
    e.ice.pool = [];
    e.neutral.pool.push('ogre_chief', 'nobody');
    const problems = encounterProblems(e, clone());
    expect(problems).toContain('炎の属性：ボスに選んだ敵が、ボスになっていない（goblin）');
    expect(problems).toContain('氷の属性：道中に出る敵が1体もいない');
    expect(problems).toContain('無属性の属性：ボスは道中に出せない（ogre_chief）');
    expect(problems).toContain('無属性の属性：敵のデータにいない敵が入っている（nobody）');
    expect(encounterProblems(undefined, clone())).toEqual(['属性ごとに出る敵（encounters）がない']);
  });

  it('マスターから敵を消すと、その敵を選んでいるところが問題になる', () => {
    expect(encounterProblems(encounters(), removeEnemy(clone(), 'ogre_chief'))).toContain('無属性の属性：ボスがいない');
  });

  it('道中から外す・ボスにしている属性を調べる', () => {
    const e = encountersWithout(encounters(), 'goblin');
    for (const d of Object.values(e)) expect(d.pool).not.toContain('goblin');
    expect(traitsWithBoss(encounters(), 'ogre_chief')).toEqual(['neutral']);
    expect(traitsWithBoss(encounters(), 'goblin')).toEqual([]);
  });

  it('変えた内容を、日本語で並べる（消した敵が道中から外れるのは書かない）', () => {
    const e = encounters();
    e.fire.pool = setWeight(e.fire.pool, 'goblin', 2);
    e.ice.boss = 'ogre_chief';
    expect(describeEncounterChanges(encounters(), e, nameOf, () => true)).toEqual([
      '炎の属性：ゴブリンの出やすさ 1 → 2',
      '氷の属性：ボス 氷の巨像 → 鬼の首領',
    ]);
    expect(describeEncounterChanges(encounters(), encountersWithout(encounters(), 'goblin'), nameOf, (id) => id !== 'goblin')).toEqual([]);
  });

  it('出やすさを変えても、ほかの敵の並び順は変わらない', () => {
    const pool = encounters().fire.pool;
    expect(weightOf(pool, 'flame_hound')).toBe(3);
    expect(setWeight(pool, 'flame_hound', 1)).toEqual(['fire_imp', 'fire_imp', 'flame_hound', 'lava_lizard', 'goblin']);
    expect(setWeight(pool, 'fire_imp', 3)).toEqual(['fire_imp', 'fire_imp', 'fire_imp', 'flame_hound', 'flame_hound', 'flame_hound', 'lava_lizard', 'goblin']);
    expect(setWeight(pool, 'stone_golem', 2)).toEqual([...pool, 'stone_golem', 'stone_golem']);
    expect(setWeight(pool, 'goblin', 0)).not.toContain('goblin');
  });
});
