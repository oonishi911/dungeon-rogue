// 敵の個性：見張り（alarm）。docs/combat-spec.md の1
import { afterEach, describe, expect, it } from 'vitest';
import { ENEMIES } from './data';
import { ENEMY_CONFIG, type MapEnemy } from './enemies';
import { alarmTargets } from './enemyBehavior';
import type { ExploreState } from './exploreTypes';
import type { EnemyDef } from './types';
import { act, arena, foe, WAIT } from './testArena';

// 見張り役はゴブリン（テストデータでは個性なし）に一時的に付ける。仲間は大ネズミ
const SCOUT = 'goblin';
const PAL = 'giant_rat';
const saved = new Map<string, EnemyDef['behaviors']>();
const give = (id: string, behaviors: EnemyDef['behaviors']) => {
  const def = ENEMIES[id]!;
  if (!saved.has(id)) saved.set(id, def.behaviors);
  def.behaviors = behaviors;
};
afterEach(() => {
  for (const [id, b] of saved) {
    if (b === undefined) delete ENEMIES[id]!.behaviors;
    else ENEMIES[id]!.behaviors = b;
  }
  saved.clear();
});

// 横20マスの部屋を、真ん中の壁で2つに分けたもの（x=8 が壁で、いちばん下の段だけ通れる。主人公は左、仲間の一部は壁の向こう）
const HALLS = ['######################', '#.......#............#', '#.......#............#', '#....................#', '######################'];
const sleeper = (id: string, x: number, y: number, extra: Partial<MapEnemy> = {}) => foe(id, { x, y }, { mode: 'wander', lastSeen: null, hp: 999, ...extra });
const stand = (s: ExploreState): ExploreState => ({ ...s, stats: { ...s.stats, hp: 500, maxHp: 500 } });

describe('見張り（alarm）', () => {
  it('合図が届くのは、縦横斜め alarmRange マス以内の、まだ追っていない敵（本人・ボス・動けない敵・もう追っている敵は除く）', () => {
    const r = ENEMY_CONFIG.alarmRange;
    expect(ENEMY_CONFIG.alarmMax).toBeGreaterThanOrEqual(2);
    const from = { ...sleeper(SCOUT, 5, 5), uid: 0 };
    const list: MapEnemy[] = [
      from,
      { ...sleeper(PAL, 5 + r, 5 + r), uid: 1 }, // ちょうど届く（斜め）
      { ...sleeper(PAL, 5 + r + 1, 5), uid: 2 }, // 届かない
      { ...sleeper(PAL, 4, 5, { mode: 'search', searchTurns: 3 }), uid: 3 }, // 探している敵にも届く
      { ...sleeper(PAL, 6, 5, { mode: 'chase' }), uid: 4 }, // もう追っている
      { ...sleeper(PAL, 5, 6, { stun: 2 }), uid: 5 }, // 動けない
      { ...sleeper('flame_beast', 5, 4), uid: 6 }, // ボス
    ];
    expect(alarmTargets(list, from, r, 9)).toEqual([1, 3]);
  });

  it('届くのは、近い順に上限の数まで（同じ近さなら、並びの先のほう）', () => {
    const from = { ...sleeper(SCOUT, 5, 5), uid: 0 };
    const list: MapEnemy[] = [from, ...[4, 1, 2, 2, 3].map((d, k) => ({ ...sleeper(PAL, 5 + d, 5), uid: k + 1 }))];
    expect(alarmTargets(list, from, 5, 3)).toEqual([2, 3, 4]);
    expect(alarmTargets(list, from, 5, 1)).toEqual([2]);
  });

  it('見張りが気付くと、叫んで、近くの仲間も（壁ごしでも）一斉に気付く。記録と演出が出る', () => {
    give(SCOUT, ['alarm']);
    const s0 = stand(arena(HALLS, { x: 2, y: 2 }, [sleeper(SCOUT, 6, 2), sleeper(PAL, 11, 2), sleeper(PAL, 19, 2)]));
    const s = act(s0, WAIT);
    const [scout, near, far] = s.enemies;
    expect(scout!.mode).toBe('chase');
    expect(near!.mode).toBe('chase'); // 壁の向こう（見えていない）でも気付く
    expect(near!.justNoticed).toBe(true);
    expect(near!.lastSeen).toEqual(s0.player);
    expect(far!.mode).toBe('wander'); // 遠すぎる
    expect(s.log.some((l) => l.includes('叫んで、仲間を呼んだ'))).toBe(true);
    expect(s.foes).toContainEqual({ kind: 'alarm', at: { x: 6, y: 2 }, to: [{ x: 11, y: 2 }] });
  });

  it('気付かされた仲間は、そのターンは動かず、次のターンから、叫ばれたときに主人公がいた所へ向かう（自分で見つけるのを待たない）', () => {
    give(SCOUT, ['alarm']);
    const s0 = stand(arena(HALLS, { x: 2, y: 2 }, [sleeper(SCOUT, 6, 2), sleeper(PAL, 10, 1)]));
    const s1 = act(s0, WAIT);
    expect(s1.enemies[1]!.pos).toEqual({ x: 10, y: 1 });
    const s3 = act(s1, WAIT, WAIT, WAIT); // 壁の切れ目を回ってくる
    const d = (p: { x: number; y: number }) => Math.abs(p.x - 2) + Math.abs(p.y - 2);
    expect(d(s3.enemies[1]!.pos)).toBeLessThan(d({ x: 10, y: 1 }));
  });

  it('並びで先に動いた仲間も、あとに動く仲間も、同じに気付く（あとの仲間は、そのターンは動かない）', () => {
    give(SCOUT, ['alarm']);
    const s0 = stand(arena(HALLS, { x: 2, y: 2 }, [sleeper(PAL, 10, 3), sleeper(SCOUT, 6, 2), sleeper(PAL, 10, 1)]));
    const s = act(s0, WAIT);
    expect(s.enemies.map((e) => e.mode)).toEqual(['chase', 'chase', 'chase']);
    expect(s.enemies[2]!.pos).toEqual({ x: 10, y: 1 });
  });

  it('見張りでない敵は、気付いても仲間を呼ばない。見張りも、一度気付いたら、くり返し叫ばない', () => {
    const plain = act(stand(arena(HALLS, { x: 2, y: 2 }, [sleeper(SCOUT, 6, 2), sleeper(PAL, 11, 2)])), WAIT);
    expect(plain.enemies[1]!.mode).toBe('wander');
    give(SCOUT, ['alarm']);
    const s1 = act(stand(arena(HALLS, { x: 2, y: 2 }, [sleeper(SCOUT, 6, 2)])), WAIT);
    const s2 = act(s1, WAIT);
    expect(s2.foes.some((f) => f.kind === 'alarm')).toBe(false);
  });

  it('不意打ちで先に殴れば、叫ばれない（殴られて気付いた見張りは、合図を出さない）', () => {
    give(SCOUT, ['alarm']);
    const s0 = stand(arena(HALLS, { x: 2, y: 2 }, [sleeper(SCOUT, 3, 2), sleeper(PAL, 11, 2)]));
    const s = act(s0, { kind: 'move', dir: 'right' });
    expect(s.enemies[0]!.mode).toBe('chase');
    expect(s.enemies[1]!.mode).toBe('wander');
    expect(s.log.some((l) => l.includes('叫'))).toBe(false);
  });
});

describe('見張り（alarm）の上限', () => {
  it('1回の叫びで気付くのは、近い順に alarmMax 体まで', () => {
    give(SCOUT, ['alarm']);
    const pals = [sleeper(PAL, 9, 1), sleeper(PAL, 10, 1), sleeper(PAL, 9, 3), sleeper(PAL, 11, 1)]; // 叫ぶ敵から 3・4・3・5 マス（どれも届く範囲）
    const s = act(stand(arena(HALLS, { x: 2, y: 2 }, [sleeper(SCOUT, 6, 2), ...pals])), WAIT);
    expect(s.enemies.slice(1).filter((e) => e.mode === 'chase')).toHaveLength(Math.min(ENEMY_CONFIG.alarmMax, 4));
    expect(s.enemies[4]!.mode).toBe('wander'); // いちばん遠い（範囲の中でも、上限からあふれる）
  });
});
