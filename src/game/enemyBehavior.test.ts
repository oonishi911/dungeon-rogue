import { describe, expect, it } from 'vitest';
import { enemyHitDamage, playerHitDamage } from './combat';
import { ENEMY_CONFIG, enemyDef, key } from './enemies';
import { chargeRun, guardsAgainst, minionTile, retreatStep, stepDir, straightLine, weakestOf } from './enemyBehavior';
import type { ExploreState } from './exploreTypes';
import { act, arena, foe, mapOf, ROOM, WAIT } from './testArena';

// テストデータ（src/game/testdata/）で、遠距離は火の小鬼、突進は炎の猟犬、盾持ちは聖騎士、召喚は呪術師（遠距離と召喚の両方）

describe('判定の計算（enemyBehavior.ts）', () => {
  const map = mapOf(ROOM);
  const none = new Set<string>();

  it('隣り合う2マスの向き', () => {
    expect(stepDir({ x: 2, y: 2 }, { x: 3, y: 2 })).toBe('right');
    expect(stepDir({ x: 2, y: 2 }, { x: 2, y: 1 })).toBe('up');
    expect(stepDir({ x: 2, y: 2 }, { x: 3, y: 3 })).toBeNull();
    expect(stepDir({ x: 2, y: 2 }, { x: 2, y: 2 })).toBeNull();
  });

  it('まっすぐ見通せるときだけ、向きと距離が出る（斜め・壁・ほかの敵があると出ない）', () => {
    expect(straightLine(map, { x: 5, y: 2 }, { x: 1, y: 2 }, none)).toEqual({ dir: 'left', dist: 4 });
    expect(straightLine(map, { x: 5, y: 1 }, { x: 5, y: 3 }, none)).toEqual({ dir: 'down', dist: 2 });
    expect(straightLine(map, { x: 5, y: 1 }, { x: 4, y: 3 }, none)).toBeNull();
    expect(straightLine(map, { x: 5, y: 2 }, { x: 1, y: 2 }, new Set([key({ x: 3, y: 2 })]))).toBeNull();
    const wall = mapOf(['#######', '#..#..#', '#######']);
    expect(straightLine(wall, { x: 1, y: 1 }, { x: 5, y: 1 }, none)).toBeNull();
  });

  it('盾は、向いている正面からの攻撃だけを受ける', () => {
    const at = { pos: { x: 5, y: 2 } };
    expect(guardsAgainst({ ...at, facing: 'left' }, { x: 4, y: 2 })).toBe(true);
    expect(guardsAgainst({ ...at, facing: 'left' }, { x: 6, y: 2 })).toBe(false);
    expect(guardsAgainst({ ...at, facing: 'left' }, { x: 5, y: 1 })).toBe(false);
    expect(guardsAgainst(at, { x: 5, y: 3 })).toBe(true); // 向きがなければ下向き
  });

  it('突進は、最大の距離まで走り、主人公・壁・敵の手前で止まる', () => {
    const player = { x: 9, y: 3 };
    expect(chargeRun(map, { x: 1, y: 2 }, 'right', player, none)).toEqual({ to: { x: 1 + ENEMY_CONFIG.chargeRun, y: 2 }, hit: false, wall: false });
    expect(chargeRun(map, { x: 7, y: 2 }, 'right', player, none)).toEqual({ to: { x: 9, y: 2 }, hit: false, wall: true });
    expect(chargeRun(map, { x: 9, y: 1 }, 'down', player, none)).toEqual({ to: { x: 9, y: 2 }, hit: true, wall: false });
    expect(chargeRun(map, { x: 1, y: 2 }, 'right', player, new Set([key({ x: 3, y: 2 })]))).toEqual({ to: { x: 2, y: 2 }, hit: false, wall: false });
  });

  it('下がる先は、主人公から2マス以上離れ、できれば縦か横にそろうマス', () => {
    expect(retreatStep(map, { x: 5, y: 2 }, { x: 4, y: 2 }, none)).toEqual({ x: 6, y: 2 });
    const cage = mapOf(['###', '#.#', '###']);
    expect(retreatStep(cage, { x: 1, y: 1 }, { x: 1, y: 1 }, none)).toBeNull();
  });

  it('召喚した敵を置くマスと、呼ぶ敵', () => {
    expect(minionTile(map, { x: 5, y: 2 }, { x: 1, y: 2 }, none)).not.toBeNull();
    const cage = mapOf(['###', '#.#', '###']);
    expect(minionTile(cage, { x: 1, y: 1 }, { x: 5, y: 5 }, none)).toBeNull();
    expect(weakestOf(['stone_golem', 'giant_rat', 'goblin'])).toBe('giant_rat');
  });
});

describe('遠距離', () => {
  it('まっすぐ4マス以内で撃つ（動かず、通常の0.8倍のダメージ、ranged の印がつく）', () => {
    const s0 = arena(ROOM, { x: 1, y: 2 }, [foe('fire_imp', { x: 5, y: 2 })]);
    const s = act(s0, WAIT);
    expect(s.enemies[0]!.pos).toEqual({ x: 5, y: 2 });
    const dmg = Math.max(1, Math.ceil(enemyHitDamage(s0.stats, enemyDef(s0.enemies[0]!)) * ENEMY_CONFIG.rangedRate));
    expect(s.stats.hp).toBe(s0.stats.hp - dmg);
    expect(s.hits.find((h) => h.kind === 'taken')).toMatchObject({ amount: dmg, by: 'fire_imp', ranged: true });
    expect(s.foes).toEqual([{ kind: 'shot', from: { x: 5, y: 2 }, to: { x: 1, y: 2 }, by: 'fire_imp' }]);
  });

  it('5マス以上離れていると撃たず、斜めや壁ごしにも撃たない', () => {
    const far = act(arena(ROOM, { x: 1, y: 2 }, [foe('fire_imp', { x: 7, y: 2 })]), WAIT);
    expect(far.foes).toEqual([]);
    const diagonal = act(arena(ROOM, { x: 1, y: 1 }, [foe('fire_imp', { x: 4, y: 3 })]), WAIT);
    expect(diagonal.foes.some((f) => f.kind === 'shot')).toBe(false);
    const wall = arena(['###########', '#...#.....#', '###########'], { x: 1, y: 1 }, [foe('fire_imp', { x: 6, y: 1 })]);
    expect(act(wall, WAIT).foes.some((f) => f.kind === 'shot')).toBe(false);
  });

  it('隣り合うと撃てず、1歩下がる', () => {
    const s = act(arena(ROOM, { x: 4, y: 2 }, [foe('fire_imp', { x: 5, y: 2 })]), WAIT);
    expect(s.enemies[0]!.pos).toEqual({ x: 6, y: 2 });
    expect(s.hits.some((h) => h.kind === 'taken')).toBe(false);
  });

  it('下がれないときは、ふつうに殴る', () => {
    const s0 = arena(['####', '#..#', '####'], { x: 1, y: 1 }, [foe('fire_imp', { x: 2, y: 1 })]);
    const s = act(s0, WAIT);
    expect(s.enemies[0]!.pos).toEqual({ x: 2, y: 1 });
    expect(s.hits.find((h) => h.kind === 'taken')).toMatchObject({ by: 'fire_imp' });
  });
});

describe('突進', () => {
  it('まっすぐ3マス以内で1ターン構え、次のターンに走って当たる（通常の1.5倍）', () => {
    const s0 = arena(ROOM, { x: 1, y: 2 }, [foe('flame_hound', { x: 4, y: 2 })]);
    const s1 = act(s0, WAIT);
    expect(s1.enemies[0]!.charge).toBe('left');
    expect(s1.enemies[0]!.pos).toEqual({ x: 4, y: 2 });
    expect(s1.stats.hp).toBe(s0.stats.hp);
    expect(s1.foes).toEqual([{ kind: 'windup', at: { x: 4, y: 2 } }]);

    const s2 = act(s1, WAIT);
    const dmg = Math.max(1, Math.ceil(enemyHitDamage(s0.stats, enemyDef(s0.enemies[0]!)) * ENEMY_CONFIG.chargeRate));
    expect(s2.enemies[0]!.pos).toEqual({ x: 2, y: 2 });
    expect(s2.enemies[0]!.charge).toBeUndefined();
    expect(s2.stats.hp).toBe(s0.stats.hp - dmg);
    expect(s2.foes).toEqual([{ kind: 'charge', from: { x: 4, y: 2 }, to: { x: 2, y: 2 }, hit: true }]);
  });

  it('避けられて壁にぶつかると、自分が気絶する', () => {
    const s1 = act(arena(ROOM, { x: 1, y: 2 }, [foe('flame_hound', { x: 4, y: 2 })]), WAIT);
    const s2 = act(s1, { kind: 'move', dir: 'up' });
    expect(s2.stats.hp).toBe(s1.stats.hp);
    expect(s2.enemies[0]!.pos).toEqual({ x: 1, y: 2 });
    expect(s2.enemies[0]!.stun).toBe(ENEMY_CONFIG.chargeStun);
    expect(s2.foes.map((f) => f.kind)).toEqual(['charge', 'bump']);
    // 気絶しているあいだは動かない（次のターンの終わりに解ける）
    const s3 = act(s2, WAIT);
    expect(s3.enemies[0]!.pos).toEqual({ x: 1, y: 2 });
    expect(s3.stats.hp).toBe(s2.stats.hp);
  });

  it('走ったあとは、しばらく構えない', () => {
    const s = act(arena(ROOM, { x: 1, y: 2 }, [foe('flame_hound', { x: 4, y: 2 })]), WAIT, { kind: 'move', dir: 'up' });
    expect(s.enemies[0]!.cool).toBe(ENEMY_CONFIG.chargeCool);
  });

  it('隣り合っているときや、遠すぎるときは構えない', () => {
    expect(act(arena(ROOM, { x: 1, y: 2 }, [foe('flame_hound', { x: 2, y: 2 })]), WAIT).foes).toEqual([]);
    expect(act(arena(ROOM, { x: 1, y: 2 }, [foe('flame_hound', { x: 7, y: 2 })]), WAIT).foes).toEqual([]);
  });

  it('構えているあいだに気絶させられると、構えが解ける', () => {
    const s0 = arena(ROOM, { x: 1, y: 2 }, [foe('flame_hound', { x: 4, y: 2 }, { charge: 'left', stun: 1 })]);
    const s = act(s0, WAIT);
    expect(s.enemies[0]!.charge).toBeUndefined();
    expect(s.stats.hp).toBe(s0.stats.hp);
  });
});

describe('盾持ち', () => {
  it('向いている正面からの攻撃は、7割防がれる', () => {
    const s0 = arena(ROOM, { x: 1, y: 2 }, [foe('holy_knight', { x: 2, y: 2 }, { facing: 'left' })]);
    const raw = playerHitDamage(s0.stats, enemyDef(s0.enemies[0]!));
    const s = act(s0, { kind: 'move', dir: 'right' });
    const cut = Math.max(1, Math.round(raw * (1 - ENEMY_CONFIG.shieldCut)));
    expect(s.enemies[0]!.hp).toBe(s0.enemies[0]!.hp - cut);
    expect(s.hits.find((h) => h.kind === 'dealt')).toMatchObject({ amount: cut, blocked: true });
    expect(s.foes).toEqual([{ kind: 'block', at: { x: 2, y: 2 } }]);
  });

  it('背中や側面からなら、そのまま通る', () => {
    const s0 = arena(ROOM, { x: 1, y: 2 }, [foe('holy_knight', { x: 2, y: 2 }, { facing: 'right' })]);
    const raw = playerHitDamage(s0.stats, enemyDef(s0.enemies[0]!));
    const s = act(s0, { kind: 'move', dir: 'right' });
    expect(s.enemies[0]!.hp).toBe(s0.enemies[0]!.hp - raw);
    expect(s.hits.find((h) => h.kind === 'dealt')).not.toHaveProperty('blocked');
    expect(s.foes).toEqual([]);
  });

  it('歩くと、歩いた向きが正面になる', () => {
    const s = act(arena(ROOM, { x: 1, y: 1 }, [foe('holy_knight', { x: 5, y: 1 })]), WAIT);
    expect(s.enemies[0]!.pos).toEqual({ x: 4, y: 1 });
    expect(s.enemies[0]!.facing).toBe('left');
  });
});

describe('召喚', () => {
  const room = ['#############', '#...........#', '#...........#', '#...........#', '#############'];
  const wait = (s: ExploreState, n: number) => Array.from({ length: n }).reduce<ExploreState>((acc) => act(acc, WAIT), s);

  it('決まったターンごとに、近くに弱い敵を呼ぶ（同時に出せるのは決まった数まで）', () => {
    // 斜めの位置で、撃たれないようにする
    const s00 = arena(room, { x: 1, y: 1 }, [foe('cultist', { x: 5, y: 3 })]);
    const s0 = { ...s00, stats: { ...s00.stats, hp: 999, maxHp: 999 } };
    const s5 = wait(s0, ENEMY_CONFIG.summonEvery);
    const minions = s5.enemies.filter((e) => e.summoned);
    expect(minions).toHaveLength(1);
    expect(minions[0]).toMatchObject({ summonedBy: 0, elite: false });
    expect(s5.foes.some((f) => f.kind === 'summon')).toBe(true); // 呼んだターンの記録
    const many = wait(s5, ENEMY_CONFIG.summonEvery * 4);
    expect(many.enemies.filter((e) => e.summoned).length).toBeLessThanOrEqual(ENEMY_CONFIG.summonMax);
  });

  it('呼ばれた敵を倒しても、倒した数にも報酬にもならない', () => {
    const base = arena(room, { x: 1, y: 2 }, [foe('giant_rat', { x: 2, y: 2 }, { hp: 1, summoned: true, summonedBy: 99 })]);
    const s = act(base, { kind: 'move', dir: 'right' });
    expect(s.enemies).toHaveLength(0);
    expect(s.defeated).toBe(base.defeated);
    expect(s.exp).toBe(base.exp);
    expect(s.gold).toBe(base.gold);
  });

  it('ふつうの敵を倒すと、倒した数が増える', () => {
    const base = arena(room, { x: 1, y: 2 }, [foe('giant_rat', { x: 2, y: 2 }, { hp: 1 })]);
    expect(act(base, { kind: 'move', dir: 'right' }).defeated).toBe(base.defeated + 1);
  });
});
