// 残響の組み合わせ「共鳴」の効果（src/game/resonance.ts、docs/echo-resonance.md）
import { describe, expect, it } from 'vitest';
import { eclipseHeal, echoAtk, echoSum, lingerDamage, satedFeed, shareHeal, steamRate, bodyDamageRate } from './echo';
import { ECHO_MASTER } from './data';
import { FIELD_ENEMY } from './enemies.fixtures';
import { type MapEnemy } from './enemies';
import { startExplore, step } from './explore';
import type { ExploreAction, ExploreState } from './exploreTypes';
import type { FloorMap, Pos } from './map';
import { activeResonances, almostResonances, RESONANCE, resonates, trioEchoes } from './resonance';
import type { EchoId, ItemId, Result } from './types';

const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const v = (id: EchoId) => ECHO_MASTER.effects[id].weapon;
const many = (id: EchoId, n: number): EchoId[] => Array.from({ length: n }, () => id);

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

const dealt = (s: ExploreState) => s.hits.find((h) => h.kind === 'dealt')!.amount;
const hitOnce = (echoes: EchoId[], change: Partial<MapEnemy> = {}, from: (s: ExploreState) => ExploreState = (s) => s) =>
  must(step(from(arena(echoes, [enemy({ x: 3, y: 2 }, change)])), RIGHT));

describe('共鳴が起きる条件', () => {
  it('決まった残響が全部そろうと起きる（順番は関係なく、1つ足りなければ起きない）', () => {
    expect(resonates(['fire', 'ice'], 'steam')).toBe(true);
    expect(resonates(['ice', 'plain', 'fire'], 'steam')).toBe(true);
    expect(resonates(['fire'], 'steam')).toBe(false);
    expect(resonates(['soft', 'hard'], 'myriad')).toBe(false);
    expect(resonates(['hard', 'spirit', 'soft'], 'myriad')).toBe(true);
    expect(resonates(undefined, 'steam')).toBe(false);
  });

  it('起きている共鳴の一覧と、あと1つで起きる共鳴', () => {
    expect(activeResonances(['fire', 'ice', 'light', 'dark'])).toEqual(['steam', 'eclipse']);
    expect(activeResonances(['plain'])).toEqual([]);
    expect(activeResonances(many('plain', 3))).toEqual(['trio']);
    expect(trioEchoes([...many('plain', 3), 'fire', ...many('lamp', 2)])).toEqual(['plain']);
    expect(almostResonances(['fire'])).toEqual([{ id: 'steam', missing: 'ice' }]);
    expect(almostResonances(['soft', 'hard'])).toEqual([{ id: 'myriad', missing: 'spirit' }]);
    expect(almostResonances([])).toEqual([]);
  });
});

describe('三重奏：同じ残響を3つ', () => {
  it('その残響の効果の合計が、半分増える（2つまでは足し算のまま）', () => {
    expect(echoAtk(many('plain', 2))).toBe(2 * v('plain'));
    expect(echoAtk(many('plain', 3))).toBe(3 * v('plain') + Math.round((3 * v('plain') * RESONANCE.trioShare) / 100));
    expect(echoSum(many('linger', 4), 'linger')).toBe(4 * v('linger') + Math.round((4 * v('linger') * RESONANCE.trioShare) / 100));
    // 別の残響が混ざっても、そろっているものだけが増える
    expect(echoAtk([...many('plain', 3), 'whisper', 'lamp'])).toBe(echoAtk(many('plain', 3)));
  });

  it('数字のない炎・氷・光・闇の残響は、変わらない', () => {
    expect(echoSum(many('fire', 3), 'fire')).toBe(0);
  });
});

describe('蒸気（炎＋氷）', () => {
  it('通常攻撃のダメージが増える。片方だけなら増えない', () => {
    expect(steamRate(['fire', 'ice'])).toBeCloseTo(1 + RESONANCE.steamDamage / 100);
    expect(steamRate(['fire'])).toBe(1);
    expect(dealt(hitOnce(['fire', 'ice']))).toBeGreaterThan(dealt(hitOnce(['fire'])));
  });
});

describe('万象（柔らかい＋硬い＋霊体）', () => {
  it('どの体質の敵にも、ダメージが増える。2種類だけなら、増えない体質がある', () => {
    for (const body of ['normal', 'soft', 'hard', 'spirit'] as const) {
      const all = bodyDamageRate(['soft', 'hard', 'spirit'], body);
      const one = bodyDamageRate(['soft', 'hard'], body);
      expect(all).toBeGreaterThan(one - 1e-9);
    }
    expect(bodyDamageRate(['soft', 'hard', 'spirit'], 'normal')).toBeCloseTo(1 + RESONANCE.myriadDamage / 100);
    expect(bodyDamageRate(['soft', 'hard'], 'normal')).toBe(1);
  });
});

describe('深い余韻（余韻＋追憶）', () => {
  it('余韻の追加ダメージが2倍になる', () => {
    const plain = lingerDamage(['linger'], 100);
    expect(lingerDamage(['linger', 'recall'], 100)).toBe(plain * RESONANCE.afterglowTimes);
    expect(lingerDamage(['recall'], 100)).toBe(0);
  });
});

describe('命綱（背水＋分け合い）', () => {
  it('HPが半分以下のときだけ、分け合いの回復が3倍になる', () => {
    const normal = shareHeal(['share'], 1000);
    expect(shareHeal(['share', 'backwater'], 1000, true)).toBe(normal * RESONANCE.lifelineTimes);
    expect(shareHeal(['share', 'backwater'], 1000, false)).toBe(normal);
    expect(shareHeal(['share'], 1000, true)).toBe(normal);
  });
});

describe('満腹（満ち足り＋ぬくもり）', () => {
  it('満ち足りで戻る満腹度が2倍になる', () => {
    expect(satedFeed(['sated'])).toBe(v('sated'));
    expect(satedFeed(['sated', 'warmth'])).toBe(v('sated') * RESONANCE.feastTimes);
    expect(satedFeed(['warmth'])).toBe(0);
    const kill = (echoes: EchoId[]) =>
      hitOnce(echoes, { hp: 1 }, (s) => ({ ...s, satiety: Math.floor(s.maxSatiety / 2), stats: { ...s.stats, hp: s.stats.maxHp } })).satiety;
    expect(kill(['sated', 'warmth']) - kill(['warmth'])).toBe(v('sated') * RESONANCE.feastTimes);
  });
});

describe('日蝕（光＋闇）', () => {
  it('敵を倒すと、最大HPの一部が戻る。片方だけなら戻らない', () => {
    expect(eclipseHeal(['light', 'dark'], 600)).toBe(Math.round((600 * RESONANCE.eclipseHeal) / 100));
    expect(eclipseHeal(['light'], 600)).toBe(0);
    expect(eclipseHeal(['light', 'dark'], 10)).toBe(1); // 1より減らない
    const kill = (echoes: EchoId[]) => hitOnce(echoes, { hp: 1 }, (s) => ({ ...s, stats: { ...s.stats, hp: Math.floor(s.stats.maxHp / 2) } })).stats.hp;
    expect(kill(['light', 'dark']) - kill(['light'])).toBe(eclipseHeal(['light', 'dark'], startExplore(1, { enemyDensity: 0, loadout: ['hammer'] }).stats.maxHp));
  });
});

describe('忍び足（不意＋ひそやか）', () => {
  it('不意打ちを決めた敵が、そのターン動けなくなる。気付いている敵・共鳴がないときは、ならない', () => {
    const stunned = (echoes: EchoId[], change: Partial<MapEnemy>) => {
      const s = hitOnce(echoes, change);
      return { logged: s.log.some((l) => l.includes('不意をつかれて動けない')), struck: s.hits.some((h) => h.kind === 'taken') };
    };
    expect(stunned(['sneak', 'hush'], { mode: 'wander' })).toEqual({ logged: true, struck: false });
    expect(stunned(['sneak'], { mode: 'wander' }).logged).toBe(false);
    expect(stunned(['sneak', 'hush'], { mode: 'chase' }).logged).toBe(false);
  });
});
