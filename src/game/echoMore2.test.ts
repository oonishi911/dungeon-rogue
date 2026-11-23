// 2026-11-23 に足した残響（貫き・不意・霜踏み・満ち足り・残り火・絆・背水・吸魔・追憶・学び）の効果（docs/echo-spec.md）
import { describe, expect, it } from 'vitest';
import { ECHO_MASTER, ENEMIES } from './data';
import { backwaterAtk, echoesFor, echoRate, frostwalkChance, piercedCut } from './echo';
import { FIELD_ENEMY } from './enemies.fixtures';
import { type MapEnemy } from './enemies';
import { startExplore, step } from './explore';
import type { ExploreAction, ExploreState } from './exploreTypes';
import type { FloorMap, Pos } from './map';
import { statusChance } from './status';
import type { EchoId, EnemyDef, EnemyId, ItemId, Result } from './types';

const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const v = (id: EchoId) => ECHO_MASTER.effects[id].weapon;
const many = (id: EchoId, n: number): EchoId[] => Array.from({ length: n }, () => id);
const foe = (change: Partial<EnemyDef> = {}): EnemyDef => ({ id: 'x', name: 'x', hp: 10, atk: 5, def: 2, element: 'neutral', body: 'normal', ...change });

const ROOM = ['###########', '#.........#', '#.........#', '#.........#', '###########'];
const RIGHT: ExploreAction = { kind: 'move', dir: 'right' };

function enemy(pos: Pos, overrides: Partial<MapEnemy> = {}): MapEnemy {
  return { uid: 0, id: FIELD_ENEMY, elite: false, pos, hp: 999, mode: 'chase', justNoticed: false, lastSeen: null, searchTurns: 0, ...overrides };
}

/** 手書きの部屋に、武器（はめた残響つき）を持った主人公と敵を置く */
function arena(echoes: EchoId[], enemies: MapEnemy[], weapon: ItemId = 'hammer'): ExploreState {
  const player = { x: 2, y: 2 };
  const base = startExplore(1, { enemyDensity: 0, loadout: [weapon], echoes });
  const map: FloorMap = {
    width: ROOM[0]!.length,
    height: ROOM.length,
    tiles: ROOM.join('').split('').map((c) => (c === '#' ? 'wall' : 'floor')),
    rooms: [],
    start: player,
    stairs: { x: 9, y: 3 },
    boss: null,
    mainPath: [],
    features: [],
  };
  return { ...base, map, player, fields: [], enemies: enemies.map((e, i) => ({ ...e, uid: i + 1 })), seen: new Array<boolean>(map.tiles.length).fill(true) };
}

/** 右隣の敵を1回殴ったときの、与えたダメージ */
const dealt = (s: ExploreState) => s.hits.find((h) => h.kind === 'dealt')!.amount;
const hitOnce = (echoes: EchoId[], change: Partial<MapEnemy> = {}, from: (s: ExploreState) => ExploreState = (s) => s) =>
  must(step(from(arena(echoes, [enemy({ x: 3, y: 2 }, change)])), RIGHT));

describe('攻撃の残響', () => {
  it('貫き：盾に防がれる分が減る（100%なら、防がれない）', () => {
    expect(piercedCut(0.7, ['pierce'])).toBeCloseTo(0.7 * (1 - v('pierce') / 100));
    expect(piercedCut(0.7, many('pierce', 10))).toBe(0);
    const shield = (Object.keys(ENEMIES) as EnemyId[]).find((id) => !ENEMIES[id]!.boss && (ENEMIES[id]!.behaviors ?? []).includes('shield'));
    if (!shield) return;
    const front = (echoes: EchoId[]) => dealt(hitOnce(echoes, { id: shield, facing: 'left' }));
    const side = dealt(hitOnce([], { id: shield, facing: 'up' }));
    expect(front([])).toBeLessThan(side);
    expect(front(['pierce'])).toBeGreaterThan(front([]));
    expect(front(many('pierce', Math.ceil(100 / v('pierce'))))).toBe(side);
  });

  it('不意：不意打ちのダメージだけが増える', () => {
    const sneak = (echoes: EchoId[]) => dealt(hitOnce(echoes, { mode: 'wander' }));
    expect(sneak(['sneak'])).toBeGreaterThan(sneak([]));
    const aware = (echoes: EchoId[]) => dealt(hitOnce(echoes));
    expect(aware(['sneak'])).toBe(aware([]));
  });

  it('残り火：燃えている敵へのダメージだけが増える', () => {
    const burning = (echoes: EchoId[]) => dealt(hitOnce(echoes, { burn: { turns: 3, amount: 1 } }));
    expect(burning(['ember'])).toBeGreaterThan(burning([]));
    expect(dealt(hitOnce(['ember']))).toBe(dealt(hitOnce([])));
  });

  it('背水：HPが半分以下のときだけ、攻撃力が上がる', () => {
    expect(backwaterAtk({ hp: 5, maxHp: 10, echoes: ['backwater'] })).toBe(v('backwater'));
    expect(backwaterAtk({ hp: 6, maxHp: 10, echoes: ['backwater'] })).toBe(0);
    const low = (s: ExploreState) => ({ ...s, stats: { ...s.stats, hp: Math.floor(s.stats.maxHp / 2) } });
    expect(dealt(hitOnce(['backwater'], {}, low))).toBeGreaterThan(dealt(hitOnce([], {}, low)));
    expect(dealt(hitOnce(['backwater']))).toBe(dealt(hitOnce([])));
  });

  it('追憶：前の通常攻撃と同じ敵を殴ると、ダメージが増える', () => {
    const twice = (echoes: EchoId[]) => {
      const first = hitOnce(echoes);
      return [dealt(first), dealt(must(step(first, RIGHT)))] as const;
    };
    const [a, b] = twice(['recall']);
    expect(b).toBeGreaterThan(a);
    const [c, d] = twice([]);
    expect(d).toBe(c);
  });
});

describe('倒したときの残響', () => {
  /** 右隣の敵（HP1）を倒したあとの状態。主人公の満腹度・魔力は減らしておく */
  const kill = (echoes: EchoId[]) =>
    hitOnce(echoes, { hp: 1 }, (s) => ({ ...s, satiety: Math.floor(s.maxSatiety / 2), mp: 0, stats: { ...s.stats, hp: s.stats.maxHp } }));

  it('満ち足り：満腹度が戻る', () => {
    expect(kill(['sated']).satiety - kill([]).satiety).toBe(v('sated'));
  });

  it('吸魔：魔力が戻る', () => {
    const with_ = kill(['siphon']);
    const without = kill([]);
    if (with_.maxMp > 0) expect(with_.mp - without.mp).toBe(Math.min(v('siphon'), with_.maxMp));
  });

  it('絆：倒したあとの次の通常攻撃だけ、ダメージが増える', () => {
    const run = (echoes: EchoId[]) => {
      // 右に2体（1体目はHP1）。1体目を倒し、1歩進んで2体目を2回殴る
      let s = arena(echoes, [enemy({ x: 3, y: 2 }, { hp: 1 }), enemy({ x: 5, y: 2 })]);
      s = must(step(s, RIGHT));
      s = must(step(s, RIGHT));
      const first = must(step(s, RIGHT));
      const second = must(step(first, RIGHT));
      return [dealt(first), dealt(second), first.stats.rally] as const;
    };
    const [a, b, rally] = run(['bond']);
    expect(a).toBeGreaterThan(b);
    expect(rally).toBeUndefined();
    const [c, d] = run([]);
    expect(c).toBe(d);
  });

  it('学び：経験値が増える', () => {
    expect(echoRate(['learn', 'learn'], 'learn')).toBeCloseTo(1 + (2 * v('learn')) / 100);
    const score = (s: ExploreState) => s.level * 100000 + s.exp;
    expect(score(kill(many('learn', 5)))).toBeGreaterThan(score(kill([])));
  });
});

describe('守りの残響', () => {
  it('霜踏み：鈍足になる確率が下がる（100%なら、ならない）', () => {
    expect(frostwalkChance(0.4, ['frostwalk'])).toBeCloseTo(0.4 * (1 - v('frostwalk') / 100));
    const chill = (Object.keys(ENEMIES) as EnemyId[]).find((id) => (ENEMIES[id]!.behaviors ?? []).includes('chill'));
    if (!chill) return;
    const stats = startExplore(1, { loadout: ['sword'], echoes: many('frostwalk', Math.ceil(100 / v('frostwalk'))) }).stats;
    expect(statusChance(stats, ENEMIES[chill]!, 'chill')).toBe(0);
  });
});

describe('落とす敵', () => {
  it('行動の個性・体質・魔法の弱さ・ボスに合わせて、新しい残響も候補に入る', () => {
    expect(echoesFor(foe({ behaviors: ['shield', 'ambush', 'chill', 'hunger', 'trail', 'summoner'] }))).toEqual(['plain', 'plain', 'pierce', 'sneak', 'frostwalk', 'sated', 'ember', 'bond']);
    expect(echoesFor(foe({ body: 'hard' }))).toContain('recall');
    expect(echoesFor(foe({ magic: 1.25 }))).toContain('siphon');
    expect(echoesFor(foe(), { rank: 'boss' })).toEqual(['plain', 'plain', 'linger', 'backwater']);
    expect(echoesFor(foe(), { rank: 'elite' })).not.toContain('backwater');
  });
});
