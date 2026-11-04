import { describe, expect, it } from 'vitest';
import { enemyHitDamage, playerHitDamage } from './combat';
import { ENEMIES, TREASURE_CONFIG } from './data';
import { ENEMY_CONFIG, enemyDef, key, spawnBoss, type MapEnemy } from './enemies';
import { startExplore, step, type ExploreAction, type ExploreState } from './explore';
import { tileAt, type FloorMap, type Pos } from './map';
import type { Result } from './types';

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function act(state: ExploreState, ...actions: ExploreAction[]): ExploreState {
  return actions.reduce((s, a) => unwrap(step(s, a)), state);
}

const WAIT: ExploreAction = { kind: 'wait' };

function enemy(pos: Pos, overrides: Partial<MapEnemy> = {}): MapEnemy {
  const elite = overrides.elite ?? false;
  return {
    uid: 0,
    id: 'goblin',
    elite,
    pos,
    hp: enemyDef({ id: 'goblin', elite }).hp,
    mode: 'wander',
    justNoticed: false,
    lastSeen: null,
    searchTurns: 0,
    ...overrides,
  };
}

/** 手書きのマップに、プレイヤーと敵を置いた状態を作る */
function arena(rows: string[], player: Pos, enemies: MapEnemy[]): ExploreState {
  const base = startExplore(1, { enemyDensity: 0 });
  const map: FloorMap = {
    width: rows[0]!.length,
    height: rows.length,
    tiles: rows.join('').split('').map((c) => (c === '#' ? 'wall' : 'floor')),
    rooms: [],
    start: player,
    stairs: { x: 1, y: 1 },
    boss: null,
    mainPath: [],
    features: [],
  };
  return {
    ...base,
    map,
    player,
    enemies: enemies.map((e, i) => ({ ...e, uid: i })),
    seen: new Array<boolean>(map.tiles.length).fill(true),
  };
}

// 横11マス×縦3マスの部屋
const ROOM = ['###########', '#.........#', '#.........#', '#.........#', '###########'];
// 壁で左右に分かれた部屋（互いに見えない）
const SPLIT = ['#############', '#.....#.....#', '#.....#.....#', '#.....#.....#', '#############'];

describe('敵の配置', () => {
  it('通常の敵は入口から離れた通路に、強敵は「強敵」の行き止まりに置かれる', () => {
    for (let seed = 0; seed < 20; seed++) {
      const s = startExplore(seed * 7919);
      const normals = s.enemies.filter((e) => !e.elite);
      const elites = s.enemies.filter((e) => e.elite);
      expect(normals.length).toBeGreaterThan(0);
      for (const e of normals) {
        expect(tileAt(s.map, e.pos)).toBe('floor');
        expect(Math.abs(e.pos.x - s.map.start.x) + Math.abs(e.pos.y - s.map.start.y)).toBeGreaterThan(
          ENEMY_CONFIG.safeDistance,
        );
      }
      const eliteSpots = s.map.features.filter((f) => f.kind === 'elite').map((f) => key(f.pos));
      expect(elites.map((e) => key(e.pos)).sort()).toEqual(eliteSpots.sort());
      expect(new Set(s.enemies.map((e) => key(e.pos))).size).toBe(s.enemies.length);
      expect(s.enemies.every((e) => e.mode === 'wander')).toBe(true);
    }
  });
});

describe('プレイヤーの攻撃', () => {
  it('敵のいるマスへ進むと攻撃になり、移動はしない', () => {
    const s = act(arena(ROOM, { x: 1, y: 2 }, [enemy({ x: 2, y: 2 }, { mode: 'chase' })]), {
      kind: 'move',
      dir: 'right',
    });
    expect(s.player).toEqual({ x: 1, y: 2 });
    expect(s.enemies[0]!.hp).toBe(enemyDef({ id: 'goblin', elite: false }).hp - playerHitDamage(s.stats, enemyDef(s.enemies[0]!)));
  });

  it('気付いていない敵への攻撃は不意打ちになり、ダメージが増える', () => {
    const s0 = arena(ROOM, { x: 1, y: 2 }, [enemy({ x: 2, y: 2 })]);
    const s = act(s0, { kind: 'move', dir: 'right' });
    const normal = playerHitDamage(s0.stats, enemyDef(s0.enemies[0]!));
    expect(s0.enemies[0]!.hp - s.enemies[0]!.hp).toBe(normal * ENEMY_CONFIG.surpriseMultiplier);
    expect(s.log.some((l) => l.includes('不意打ち'))).toBe(true);
    expect(s.enemies[0]!.mode).toBe('chase'); // 攻撃された敵は気付く
  });

  it('HPが0になった敵はいなくなる', () => {
    const s = act(arena(ROOM, { x: 1, y: 2 }, [enemy({ x: 2, y: 2 }, { hp: 1 })]), { kind: 'move', dir: 'right' });
    expect(s.enemies).toHaveLength(0);
    expect(s.defeated).toBe(1);
  });
});

describe('敵の動き', () => {
  it('プレイヤーに気付いたターンは動かず、次のターンから追ってくる', () => {
    let s = act(arena(ROOM, { x: 1, y: 2 }, [enemy({ x: 6, y: 2 })]), WAIT);
    expect(s.enemies[0]).toMatchObject({ mode: 'chase', justNoticed: true, pos: { x: 6, y: 2 } });
    expect(s.log.at(-1)).toContain('気付いた');
    s = act(s, WAIT);
    expect(s.enemies[0]).toMatchObject({ mode: 'chase', justNoticed: false, pos: { x: 5, y: 2 } });
  });

  it('追跡中の敵が隣にいれば攻撃してくる', () => {
    const s0 = arena(ROOM, { x: 1, y: 2 }, [enemy({ x: 2, y: 2 }, { mode: 'chase' })]);
    const s = act(s0, WAIT);
    expect(s.stats.hp).toBe(s0.stats.hp - enemyHitDamage(s0.stats, enemyDef(s0.enemies[0]!)));
  });

  it('HPが0になると探索は終わる', () => {
    const s0 = arena(ROOM, { x: 1, y: 2 }, [enemy({ x: 2, y: 2 }, { mode: 'chase' })]);
    const s = act({ ...s0, stats: { ...s0.stats, hp: 1 } }, WAIT);
    expect(s.outcome).toBe('defeated');
    expect(step(s, WAIT).ok).toBe(false);
  });

  it('見失うと探し始め、一定ターンでうろつきに戻る', () => {
    // 壁の向こうにいる追跡中の敵
    const s0 = arena(SPLIT, { x: 1, y: 2 }, [enemy({ x: 9, y: 2 }, { mode: 'chase', lastSeen: { x: 9, y: 2 } })]);
    let s = act(s0, WAIT);
    expect(s.enemies[0]!.mode).toBe('search');
    for (let i = 0; i < ENEMY_CONFIG.loseTurns; i++) s = act(s, WAIT);
    expect(s.enemies[0]!.mode).toBe('wander');
    expect(s.log.some((l) => l.includes('見失った'))).toBe(true);
  });

  it('強敵は動かない', () => {
    // 視界の内側に置き、気付いて追跡状態になっても動かないことを確かめる
    let s = arena(ROOM, { x: 1, y: 2 }, [enemy({ x: 5, y: 2 }, { elite: true })]);
    for (let i = 0; i < 10; i++) s = act(s, WAIT);
    expect(s.enemies[0]!.pos).toEqual({ x: 5, y: 2 });
    expect(s.enemies[0]!.mode).toBe('chase');
  });

  it('うろつく敵は通路の上だけを動き、ほかの敵やプレイヤーと重ならない', () => {
    for (let seed = 0; seed < 5; seed++) {
      let s = startExplore(seed * 104729, { enemyDensity: 0.03 });
      for (let i = 0; i < 40 && s.outcome === 'ongoing'; i++) {
        s = act(s, WAIT);
        const spots = s.enemies.map((e) => key(e.pos));
        expect(s.enemies.every((e) => tileAt(s.map, e.pos) === 'floor')).toBe(true);
        expect(new Set(spots).size).toBe(spots.length);
        expect(spots).not.toContain(key(s.player));
      }
    }
  });
});

describe('背後からの攻撃', () => {
  it('強敵の隣から離れると、必ず背後から攻撃される', () => {
    const s0 = arena(ROOM, { x: 1, y: 2 }, [enemy({ x: 2, y: 2 }, { elite: true, mode: 'chase' })]);
    const s = act(s0, { kind: 'move', dir: 'up' });
    expect(s.player).toEqual({ x: 1, y: 1 });
    expect(s.stats.hp).toBe(s0.stats.hp - enemyHitDamage(s0.stats, enemyDef(s0.enemies[0]!)));
    expect(s.log.some((l) => l.includes('背後'))).toBe(true);
  });

  it('気付いていない敵からは、離れても攻撃されない', () => {
    const s0 = arena(ROOM, { x: 1, y: 2 }, [enemy({ x: 2, y: 2 })]);
    const s = act(s0, { kind: 'move', dir: 'up' });
    expect(s.stats.hp).toBe(s0.stats.hp);
  });
});

describe('属性付与と攻撃', () => {
  it('攻撃するたびに付与の残り回数が減り、0回で消える', () => {
    const s0 = arena(ROOM, { x: 1, y: 2 }, [enemy({ x: 2, y: 2 }, { mode: 'chase', hp: 999 })]);
    let s: ExploreState = { ...s0, stats: { ...s0.stats, enchant: { element: 'fire', hits: 2 } } };
    s = act(s, { kind: 'move', dir: 'right' });
    expect(s.stats.enchant).toEqual({ element: 'fire', hits: 1 });
    s = act(s, { kind: 'move', dir: 'right' });
    expect(s.stats.enchant).toBeNull();
    expect(s.log.some((l) => l.includes('力が消えた'))).toBe(true);
  });
});

describe('報酬とボス', () => {
  it('強敵を倒すと金貨を落とす', () => {
    const s = act(arena(ROOM, { x: 1, y: 2 }, [enemy({ x: 2, y: 2 }, { elite: true, hp: 1 })]), {
      kind: 'move',
      dir: 'right',
    });
    expect(s.gold).toBe(TREASURE_CONFIG.eliteGold);
  });

  it('ボスを倒すと報酬が出て、ダンジョンを踏破する', () => {
    const boss = { ...spawnBoss({ x: 2, y: 2 }, 'fire', 0), hp: 1 };
    const s = act(arena(ROOM, { x: 1, y: 2 }, [boss]), { kind: 'move', dir: 'right' });
    expect(s.outcome).toBe('cleared');
    expect(s.gold).toBe(TREASURE_CONFIG.bossGold);
    expect(step(s, WAIT).ok).toBe(false);
  });

  it('ボスは動かず、離れようとすると必ず背後から攻撃してくる', () => {
    const boss = { ...spawnBoss({ x: 2, y: 2 }, 'ice', 0), mode: 'chase' as const };
    const s0 = arena(ROOM, { x: 1, y: 2 }, [boss]);
    const s = act(s0, { kind: 'move', dir: 'up' });
    expect(s.enemies[0]!.pos).toEqual({ x: 2, y: 2 });
    expect(s.stats.hp).toBe(s0.stats.hp - enemyHitDamage(s0.stats, enemyDef(boss)));
  });

  it('ボスの能力は強敵の倍率で上がらない', () => {
    const boss = spawnBoss({ x: 0, y: 0 }, 'dark', 0);
    expect(enemyDef(boss)).toEqual(ENEMIES.dark_lord);
  });
});
