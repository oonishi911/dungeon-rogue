import { describe, expect, it } from 'vitest';
import { enemyHitDamage, playerHitDamage } from './combat';
import { CHEST_ITEMS, enemyBase, enemyReward, expToNext, LOADOUT_CONFIG, REWARD_CONFIG, TREASURE_CONFIG } from './data';
import { DEFAULT_DUNGEON } from './dungeons';
import { BOSS_ENEMY, FIELD_ENEMY } from './enemies.fixtures';
import { ENEMY_CONFIG, enemyDef, key, spawnBoss, type MapEnemy } from './enemies';
import { startExplore, step } from './explore';
import { type ExploreAction, type ExploreState } from './exploreTypes';
import { tileAt, type FloorMap, type Pos } from './map';
import type { Result } from './types';

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function act(state: ExploreState, ...actions: ExploreAction[]): ExploreState {
  return actions.reduce((s, a) => unwrap(step(s, a)), state);
}

// 標準のダンジョンの設定（startExplore でダンジョンを指定しないと、標準のダンジョンになる）
const GEN = DEFAULT_DUNGEON;

const WAIT: ExploreAction = { kind: 'wait' };

function enemy(pos: Pos, overrides: Partial<MapEnemy> = {}): MapEnemy {
  const elite = overrides.elite ?? false;
  return {
    uid: 0,
    id: FIELD_ENEMY,
    elite,
    pos,
    hp: enemyDef({ id: FIELD_ENEMY, elite }).hp,
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
    expect(s.enemies[0]!.hp).toBe(enemyDef({ id: FIELD_ENEMY, elite: false }).hp - playerHitDamage(s.stats, enemyDef(s.enemies[0]!)));
  });

  it('与えたダメージは、敵のいたマスと量を hits に記録する（画面に数字を出すため）', () => {
    const s0 = arena(ROOM, { x: 1, y: 2 }, [enemy({ x: 2, y: 2 }, { mode: 'chase', hp: 99 })]);
    const s = act(s0, { kind: 'move', dir: 'right' });
    const dealt = s.hits.filter((h) => h.kind === 'dealt');
    expect(dealt).toEqual([{ kind: 'dealt', at: { x: 2, y: 2 }, amount: 99 - s.enemies[0]!.hp }]);
    // 追っている敵はそのまま反撃してくるので、受けたダメージも記録される
    const taken = s.hits.filter((h) => h.kind === 'taken');
    expect(taken.reduce((sum, h) => sum + h.amount, 0)).toBe(s0.stats.hp - s.stats.hp);
  });

  it('敵に攻撃されたときは、攻撃してきた敵を hits に記録する（敵ごとの攻撃の音を鳴らすため）', () => {
    const s0 = arena(ROOM, { x: 1, y: 2 }, [enemy({ x: 2, y: 2 }, { mode: 'chase', hp: 99 })]);
    const s = act(s0, { kind: 'wait' });
    const taken = s.hits.filter((h) => h.kind === 'taken');
    expect(taken.length).toBeGreaterThan(0);
    for (const h of taken) expect(h.by).toBe(FIELD_ENEMY);
  });

  it('次の行動では hits は空からやり直す', () => {
    const s0 = arena(ROOM, { x: 1, y: 2 }, [enemy({ x: 6, y: 2 }, { hp: 99 })]);
    const s = act(s0, { kind: 'move', dir: 'right' }, { kind: 'wait' });
    expect(s.hits).toEqual([]);
  });

  it('気付いていない敵への攻撃は不意打ちになり、ダメージが増える', () => {
    // 1発で倒れないよう、HPの多い敵にする
    const s0 = arena(ROOM, { x: 1, y: 2 }, [enemy({ x: 2, y: 2 }, { hp: 99 })]);
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
  it('通常の敵を倒すと、敵ごとの金貨と経験値が入る', () => {
    const s = act(arena(ROOM, { x: 1, y: 2 }, [enemy({ x: 2, y: 2 }, { hp: 1 })]), { kind: 'move', dir: 'right' });
    const reward = enemyReward(FIELD_ENEMY);
    expect(s.gold).toBe(reward.gold);
    expect(s.exp).toBe(reward.exp);
    expect(s.level).toBe(1);
  });

  it('経験値がたまるとレベルが上がり、最大HPと攻撃力が上がる（上がった分だけHPも回復する）', () => {
    const s0 = arena(ROOM, { x: 1, y: 2 }, [enemy({ x: 2, y: 2 }, { hp: 1 })]);
    const before = { ...s0, exp: expToNext(1, GEN.growth) - 1, stats: { ...s0.stats, hp: 10 } };
    const s = act(before, { kind: 'move', dir: 'right' });
    expect(s.level).toBe(2);
    expect(s.stats.maxHp).toBe(s0.stats.maxHp + GEN.growth.hpPerLevel);
    expect(s.stats.atk).toBe(s0.stats.atk + GEN.growth.atkPerLevel);
    expect(s.stats.hp).toBe(10 + GEN.growth.hpPerLevel);
    expect(s.log.some((l) => l.includes('レベル2に上がった'))).toBe(true);
  });

  it('通常の敵は、ときどき回復薬か食料を落とし、持ち物に入る。持ち物がいっぱいなら宝箱で残す', () => {
    // 落とすかどうかは乱数なので、落とすまでシードを変えて試す
    let dropped: ExploreState | null = null;
    let full: ExploreState | null = null;
    for (let seed = 0; seed < 400 && !(dropped && full); seed++) {
      const s0 = { ...arena(ROOM, { x: 1, y: 2 }, [enemy({ x: 2, y: 2 }, { hp: 1 })]), rngState: seed };
      const s = act(s0, { kind: 'move', dir: 'right' });
      if (!dropped && s.stats.items.length > s0.stats.items.length) dropped = s;
      const packed = { ...s0, stats: { ...s0.stats, items: new Array(LOADOUT_CONFIG.maxItems).fill('potion') } };
      const f = act(packed, { kind: 'move', dir: 'right' });
      if (!full && f.chests.some((c) => c.pos.x === 2 && c.pos.y === 2)) full = f;
    }
    expect(dropped).not.toBeNull();
    expect(REWARD_CONFIG.dropItems).toContain(dropped!.stats.items.at(-1));
    expect(full).not.toBeNull();
    const left = full!.chests.find((c) => c.pos.x === 2 && c.pos.y === 2)!;
    expect(left.opened).toBe(false);
    expect(REWARD_CONFIG.dropItems).toContain(left.item);
  });

  it('強敵を倒すと、金貨と経験値が多く入り、必ず宝箱（金貨と良い道具）を落とす', () => {
    const s = act(arena(ROOM, { x: 1, y: 2 }, [enemy({ x: 2, y: 2 }, { elite: true, hp: 1 })]), {
      kind: 'move',
      dir: 'right',
    });
    const reward = enemyReward(FIELD_ENEMY);
    expect(s.gold).toBe(Math.round(reward.gold * GEN.growth.eliteRate));
    const chest = s.chests.find((c) => c.pos.x === 2 && c.pos.y === 2);
    expect(chest).toMatchObject({ gold: TREASURE_CONFIG.eliteGold, opened: false });
    expect(REWARD_CONFIG.eliteItems).toContain(chest!.item);
    // 宝箱に乗ると中身を取る
    const opened = act(s, { kind: 'move', dir: 'right' });
    expect(opened.gold).toBe(s.gold + TREASURE_CONFIG.eliteGold);
    expect(opened.stats.items).toContain(chest!.item);
  });

  it('ボスを倒すと報酬が出て、ダンジョンを踏破する', () => {
    const boss = { ...spawnBoss({ x: 2, y: 2 }, GEN.encounters.fire.boss, 0), hp: 1 };
    const s = act(arena(ROOM, { x: 1, y: 2 }, [boss]), { kind: 'move', dir: 'right' });
    expect(s.outcome).toBe('cleared');
    expect(s.gold).toBe(TREASURE_CONFIG.bossGold);
    // 踏破したあとは、もう動けない
    expect(step(s, WAIT).ok).toBe(false);
  });

  it('ボスは、離れようとすると必ず背後から攻撃してきて、そのあと歩いて追ってくる', () => {
    const boss = { ...spawnBoss({ x: 2, y: 2 }, GEN.encounters.ice.boss, 0), mode: 'chase' as const };
    const s0 = arena(ROOM, { x: 1, y: 2 }, [boss]);
    const s = act(s0, { kind: 'move', dir: 'up' });
    expect(s.enemies[0]!.pos).toEqual({ x: 2, y: 1 });
    expect(s.stats.hp).toBe(s0.stats.hp - enemyHitDamage(s0.stats, enemyDef(boss)));
  });

  it('ボスは強敵とちがって歩き、気付いたら追ってくる（強敵はその場から動かない）', () => {
    const boss = { ...spawnBoss({ x: 5, y: 2 }, GEN.encounters.ice.boss, 0), mode: 'chase' as const, lastSeen: { x: 1, y: 2 } };
    const s = act(arena(ROOM, { x: 1, y: 2 }, [boss]), WAIT);
    expect(s.enemies[0]!.pos).toEqual({ x: 4, y: 2 });
    const elite = { ...boss, id: FIELD_ENEMY, mode: 'chase' as const };
    expect(act(arena(ROOM, { x: 1, y: 2 }, [elite]), WAIT).enemies[0]!.pos).toEqual({ x: 5, y: 2 });
  });

  it('ボスの能力は強敵の倍率で上がらない', () => {
    const boss = spawnBoss({ x: 0, y: 0 }, GEN.encounters.dark.boss, 0);
    expect(enemyDef(boss)).toEqual(enemyBase(GEN.encounters.dark.boss));
  });
});

describe('敵の強さ', () => {
  it('通常の敵の HP・攻撃力は data.ts の値の半分（四捨五入）、防御力はそのまま', () => {
    const def = enemyDef({ id: FIELD_ENEMY, elite: false });
    const base = enemyBase(FIELD_ENEMY);
    expect(def.hp).toBe(Math.round(base.hp * ENEMY_CONFIG.strengthRate));
    expect(def.atk).toBe(Math.round(base.atk * ENEMY_CONFIG.strengthRate));
    expect(def.def).toBe(base.def);
  });

  it('強敵は、半分にした通常の敵の能力から上げる', () => {
    const normal = enemyDef({ id: FIELD_ENEMY, elite: false });
    const elite = enemyDef({ id: FIELD_ENEMY, elite: true });
    expect(elite.hp).toBe(Math.round(normal.hp * ENEMY_CONFIG.eliteHpRate));
    expect(elite.atk).toBe(Math.round(normal.atk * ENEMY_CONFIG.eliteAtkRate));
  });

  it('ボスは data.ts の能力のまま', () => {
    expect(enemyDef({ id: BOSS_ENEMY, elite: true })).toEqual(enemyBase(BOSS_ENEMY));
  });
});

describe('宝箱の道具の出やすさ', () => {
  const share = (id: string) => CHEST_ITEMS.filter((x) => x === id).length / CHEST_ITEMS.length;
  it('食料は1/2、回復薬は1/18、ほかの4つは各1/9（マップの宝箱と強敵の宝箱で同じ）', () => {
    expect(share('food')).toBeCloseTo(1 / 2);
    expect(share('potion')).toBeCloseTo(1 / 18);
    for (const id of ['fire_whetstone', 'ice_whetstone', 'holy_water', 'dark_oil']) expect(share(id)).toBeCloseTo(1 / 9);
    expect(TREASURE_CONFIG.items).toBe(CHEST_ITEMS);
    expect(REWARD_CONFIG.eliteItems).toBe(CHEST_ITEMS);
  });
});
