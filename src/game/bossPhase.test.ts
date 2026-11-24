import { describe, expect, it } from 'vitest';
import { BOSS_CONFIG, phaseAtkRate, phaseBehaviors, phaseOf, phaseSow, PHASE_RULES } from './bossPhase';
import { enemyBase } from './data';
import { behaviorsOf, enemyDef } from './enemies';
import { fieldAt } from './fields';
import type { ExploreState } from './exploreTypes';
import { act, arena, foe, WAIT } from './testArena';

// テストデータ（src/game/testdata/）のボスは、HP500〜600。HPの段階の境目は、元のHP（enemyBase）の 2/3・1/3

const BIG = ['#############', '#...........#', '#...........#', '#...........#', '#...........#', '#...........#', '#############'];
const strong = (s: ExploreState): ExploreState => ({ ...s, stats: { ...s.stats, hp: 99999, maxHp: 99999 } });
// 主人公は (3,3)、ボスは gap マス右（見える距離）
const fight = (id: string, hp: number, extra = {}, gap = 4) => strong(arena(BIG, { x: 3, y: 3 }, [foe(id, { x: 3 + gap, y: 3 }, { elite: true, hp, ...extra })]));
const maxHp = (id: string) => enemyBase(id).hp;

describe('ボスの段階（bossPhase.ts）', () => {
  it('HPが 2/3 以下で第2段階、1/3 以下で第3段階', () => {
    expect([100, 67, 66, 34, 33, 1].map((hp) => phaseOf(hp, 100))).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it('攻撃力は段階ごとに25%ずつ上がる', () => {
    expect([1, 2, 3].map(phaseAtkRate)).toEqual([1, 1.25, 1.5]);
    const atk = enemyBase('flame_beast').atk;
    expect([1, 2, 3].map((phase) => enemyDef({ id: 'flame_beast', elite: true, phase }).atk)).toEqual([atk, Math.round(atk * 1.25), Math.round(atk * 1.5)]);
  });

  it('行動は、前の段階のものが続いたまま増える', () => {
    expect(phaseBehaviors('ogre_chief', 1)).toEqual([]);
    expect(phaseBehaviors('ogre_chief', 2)).toEqual(['summoner']);
    expect(phaseBehaviors('ogre_chief', 3)).toEqual(['summoner', 'charger']);
    expect(phaseBehaviors('light_guardian', 3)).toEqual(['shield', 'ranged']);
    expect(behaviorsOf(enemyDef({ id: 'dark_lord', elite: true, phase: 3 }))).toEqual(['summoner', 'ranged']);
    expect(behaviorsOf(enemyDef({ id: 'dark_lord', elite: true }))).toEqual([]);
  });

  it('炎の魔獣と氷の巨像だけが、床をまく（第2段階から、第3段階も続く）', () => {
    expect([1, 2, 3].map((p) => phaseSow('flame_beast', p))).toEqual([null, 'fire', 'fire']);
    expect([1, 2, 3].map((p) => phaseSow('ice_colossus', p))).toEqual([null, 'frost', 'frost']);
    expect(phaseSow('ogre_chief', 3)).toBeNull();
  });

  it('5体のボスすべてに、第2・第3段階の決まりがある', () => {
    expect(Object.keys(PHASE_RULES).sort()).toEqual(['dark_lord', 'flame_beast', 'ice_colossus', 'light_guardian', 'ogre_chief']);
  });
});

describe('ボスの手番', () => {
  it('HPが 2/3 以下に減ると段階が上がり、そのターンは咆哮して攻撃しない', () => {
    // 隣にいるボスを殴って、HPが境目（元のHPの 2/3）以下へ。ダメージが入ったあとで段階が上がる
    const edge = Math.floor((maxHp('ogre_chief') * 2) / 3);
    const s0 = strong(arena(BIG, { x: 3, y: 3 }, [foe('ogre_chief', { x: 4, y: 3 }, { elite: true, hp: edge + 1 })]));
    const s1 = act(s0, { kind: 'move', dir: 'right' });
    const boss = s1.enemies[0]!;
    expect(boss.hp).toBeLessThanOrEqual(edge);
    expect(boss.phase).toBe(2);
    expect(s1.foes).toContainEqual({ kind: 'roar', at: boss.pos, phase: 2 });
    expect(s1.stats.hp).toBe(s0.stats.hp); // 咆哮のターンは殴られない
    expect(boss.stun ?? 0).toBe(0); // 次のターンから動く
    const s2 = act(s1, WAIT);
    expect(s2.stats.hp).toBeLessThan(s1.stats.hp);
  });

  it('段階は下がらない', () => {
    const s = act(fight('ogre_chief', maxHp('ogre_chief'), { phase: 2 }), WAIT);
    expect(s.enemies[0]!.phase).toBe(2);
  });

  it('第2段階の炎の魔獣は、4ターンごとに主人公のまわりへ燃える床をまく', () => {
    let s = fight('flame_beast', 300, { phase: 2 });
    let sown = false;
    for (let i = 0; i < 8 && !sown; i++) {
      s = act({ ...s, enemies: s.enemies.map((e) => ({ ...e, pos: { x: 7, y: 3 }, mode: 'chase' as const, lastSeen: s.player })) }, WAIT);
      sown = s.foes.some((f) => f.kind === 'sow');
    }
    expect(sown).toBe(true);
    const sow = s.foes.find((f) => f.kind === 'sow')!;
    if (sow.kind !== 'sow') throw new Error();
    expect(sow.field).toBe('fire');
    expect(sow.to).toHaveLength(BOSS_CONFIG.sowCount);
    for (const p of sow.to) {
      expect(Math.abs(p.x - s.player.x)).toBeLessThanOrEqual(BOSS_CONFIG.sowRadius);
      expect(Math.abs(p.y - s.player.y)).toBeLessThanOrEqual(BOSS_CONFIG.sowRadius);
      expect(fieldAt(s.fields, p)?.kind).toBe('fire');
    }
    expect(fieldAt(s.fields, s.player)).toBeUndefined(); // 主人公のいるマスにはまかない
  });

  it('第1段階のボスは床をまかない', () => {
    let s = fight('flame_beast', maxHp('flame_beast'));
    for (let i = 0; i < 8; i++) s = act(s, WAIT);
    expect(s.fields).toEqual([]);
  });

  it('第2段階の鬼の首領は手下を呼び、第3段階では突進の構えもとる', () => {
    let s = fight('ogre_chief', 300, { phase: 2 });
    for (let i = 0; i < ENEMY_WAIT; i++) s = act(s, WAIT);
    expect(s.enemies.some((e) => e.summoned)).toBe(true);
    const third = act(fight('ogre_chief', 100, { phase: 3 }, 3), WAIT);
    expect(third.foes.some((f) => f.kind === 'windup' || f.kind === 'charge')).toBe(true);
  });

  it('第3段階の闇の王は、離れたところから撃ってくる', () => {
    const s = act(fight('dark_lord', 100, { phase: 3 }, 3), WAIT);
    expect(s.foes.some((f) => f.kind === 'shot')).toBe(true);
  });

  it('第2段階の光の守護者は、正面からの攻撃を盾で防ぐ', () => {
    const base = strong(arena(BIG, { x: 3, y: 3 }, [foe('light_guardian', { x: 4, y: 3 }, { elite: true, hp: maxHp('light_guardian'), facing: 'left', stun: 9 })]));
    const plain = act(base, { kind: 'move', dir: 'right' }).enemies[0]!.hp;
    const guarded = act({ ...base, enemies: base.enemies.map((e) => ({ ...e, phase: 2 })) }, { kind: 'move', dir: 'right' }).enemies[0]!.hp;
    expect(guarded).toBeGreaterThan(plain);
  });
});

const ENEMY_WAIT = 6;
