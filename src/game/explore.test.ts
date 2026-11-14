import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_DUNGEON, DEFAULT_DUNGEON_ID, DUNGEONS } from './dungeons';
import { enemyDef } from './enemies';
import { BOSS_ENEMY, FIELD_ENEMY } from './enemies.fixtures';
import {
  canSee,
  dirBetween,
  EXPLORE_CONFIG,
  isBossFloor,
  toResult,
  startExplore,
  step,
  visibleTiles,
  type ExploreAction,
  type ExploreState,
} from './explore';
import { PREP_CONFIG, TREASURE_CONFIG } from './data';
import type { DungeonFile } from './genMaster';
import { tileAt, type FloorMap } from './map';
import { RANK_CONFIG, rankParams } from './rank';
import type { ItemId } from './types';
import type { Result } from './types';

// 標準のダンジョンの設定（startExplore でダンジョンを指定しないと、標準のダンジョンになる）
const GEN = DEFAULT_DUNGEON;

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function act(state: ExploreState, ...actions: ExploreAction[]): ExploreState {
  return actions.reduce((s, a) => unwrap(step(s, a)), state);
}

/**
 * 本道をたどって階段まで歩く。
 * その階の敵は、歩く前に取り除く（歩く道のりを確かめるためのもので、敵に道をふさがれると確かめられない。
 * 敵の密度を0にしても、設定によっては群れ部屋の敵が本道の上に置かれる）
 */
function walkMainPath(state: ExploreState): ExploreState {
  const path = state.map.mainPath;
  let s: ExploreState = { ...state, enemies: [] };
  for (let i = 1; i < path.length; i++) s = act(s, { kind: 'move', dir: dirBetween(path[i - 1]!, path[i]!) });
  return s;
}

/** 条件に合う探索が始まるシードを、from から順に探す（マップの形は設定で変わるので、シードを決め打ちしない） */
function seedWhere(test: (state: ExploreState) => boolean, options: Parameters<typeof startExplore>[1] = {}, from = 1): number {
  for (let seed = from; seed < from + 500; seed++) if (test(startExplore(seed, options))) return seed;
  throw new Error('条件に合うシードが見つからない');
}

/** 壁の隣の床に主人公を置いた状態（入口が部屋の中にあると、入口の隣に壁がないことがある） */
function besideWall(state: ExploreState): ExploreState {
  const { map } = state;
  for (let y = 1; y < map.height - 1; y++) {
    for (let x = 1; x < map.width - 1; x++) {
      const s = { ...state, player: { x, y }, enemies: [] };
      if (tileAt(map, { x, y }) === 'floor' && neighbors(s).wall) return s;
    }
  }
  throw new Error('壁の隣の床がない');
}

/** 主人公の隣の通路と、壁の方向（なければ undefined） */
function neighbors(state: ExploreState) {
  const dirs = ['up', 'down', 'left', 'right'] as const;
  const delta = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;
  const kind = (d: (typeof dirs)[number]) =>
    tileAt(state.map, { x: state.player.x + delta[d][0], y: state.player.y + delta[d][1] });
  return { open: dirs.find((d) => kind(d) === 'floor')!, wall: dirs.find((d) => kind(d) === 'wall') };
}

describe('startExplore', () => {
  it('地下1階の入口から、満腹度とHPが満タンで始まる', () => {
    const s = startExplore(1);
    expect(s.floor).toBe(0);
    expect(s.player).toEqual(s.map.start);
    expect(s.satiety).toBe(rankParams(1, GEN.floors).maxSatiety);
    expect(s.stats.hp).toBe(s.stats.maxHp);
    expect(s.seen[s.player.y * s.map.width + s.player.x]).toBe(true);
  });

  it('同じシードなら同じ階層', () => {
    expect(startExplore(5)).toEqual(startExplore(5));
  });

  it('最初は周りしか見えていない（入口から視界の半径以内だけ）', () => {
    const s = startExplore(2);
    const r = EXPLORE_CONFIG.sightRadius;
    const seen = s.seen.flatMap((v, i) => (v ? [{ x: i % s.map.width, y: Math.floor(i / s.map.width) }] : []));
    expect(seen.length).toBeGreaterThan(0);
    for (const p of seen) expect((p.x - s.player.x) ** 2 + (p.y - s.player.y) ** 2).toBeLessThanOrEqual(r * r);
  });
});

describe('step', () => {
  it('通路へ動くと1歩進み、満腹度が1減る', () => {
    const s = startExplore(3);
    const next = act(s, { kind: 'move', dir: neighbors(s).open });
    expect(next.player).not.toEqual(s.player);
    expect(next.satiety).toBe(s.satiety - 1);
    expect(next.turn).toBe(1);
  });

  it('壁へは動けず、行動も消費しない', () => {
    const s = besideWall(startExplore(3));
    const r = step(s, { kind: 'move', dir: neighbors(s).wall! });
    expect(r.ok).toBe(false);
  });

  it('足踏みも1行動', () => {
    const s = act(startExplore(3), { kind: 'wait' });
    expect(s.turn).toBe(1);
    expect(s.satiety).toBe(rankParams(1, GEN.floors).maxSatiety - 1);
  });

  it('階段の上でなければ降りられない', () => {
    expect(step(startExplore(4), { kind: 'descend' }).ok).toBe(false);
  });

  it('階段で降りると次の階の入口に出て、霧も新しくなる', () => {
    const s = walkMainPath(startExplore(4, { enemyDensity: 0, floors: 3 }));
    const next = act(s, { kind: 'descend' });
    expect(next.floor).toBe(1);
    expect(next.map).not.toEqual(s.map);
    expect(next.player).toEqual(next.map.start);
    // 前の階の記憶は消え、入口から見える範囲だけが晴れている
    const visible = visibleTiles(next.map, next.player, EXPLORE_CONFIG.sightRadius);
    expect(next.seen.filter(Boolean).length).toBe(visible.size);
  });

  it('1階目の入口からは上れない', () => {
    expect(step(startExplore(4), { kind: 'ascend' }).ok).toBe(false);
  });

  it('2階目からは入口が上り階段になり、上ると前の階の下り階段の上に、離れたときの様子のまま戻る', () => {
    const before = walkMainPath(startExplore(4, { enemyDensity: 0, floors: 3 }));
    const below = act(before, { kind: 'descend' });
    expect(step(below, { kind: 'ascend' }).ok).toBe(true);
    const back = act(below, { kind: 'ascend' });
    expect(back.floor).toBe(0);
    expect(back.map).toBe(before.map);
    expect(back.player).toEqual(before.map.stairs);
    // 晴れた霧は覚えている（歩いた本道は見えたまま）
    for (const p of before.map.mainPath) expect(back.seen[p.y * back.map.width + p.x]).toBe(true);
    // もう一度降りると、さっきの階の入口に、離れたときの様子のまま出る
    const again = act(back, { kind: 'descend' });
    expect(again.floor).toBe(1);
    expect(again.map).toBe(below.map);
    expect(again.player).toEqual(below.map.start);
    expect(again.seen.filter(Boolean).length).toBeGreaterThanOrEqual(below.seen.filter(Boolean).length);
  });

  it('上の階に戻っても、倒した敵は戻ってこない', () => {
    // 1階目の敵をすべて倒した状態にする
    const before = walkMainPath({ ...startExplore(4), enemies: [] });
    const back = act(act(before, { kind: 'descend' }), { kind: 'ascend' });
    expect(back.enemies).toHaveLength(0);
  });

  it('階段の上でなければ上れない', () => {
    const below = act(walkMainPath(startExplore(4, { enemyDensity: 0, floors: 3 })), { kind: 'descend' });
    const off = neighbors(below).open;
    expect(step(act(below, { kind: 'move', dir: off }), { kind: 'ascend' }).ok).toBe(false);
  });

  it('最後の階の階段を降りるとボス階に出る。ボス階に階段はなく、ボスが1体だけいる', () => {
    let s = startExplore(6, { enemyDensity: 0 });
    expect(s.floors).toBe(GEN.floors.count);
    for (let f = 0; f < s.floors; f++) s = act(walkMainPath(s), { kind: 'descend' });
    expect(isBossFloor(s)).toBe(true);
    expect(s.outcome).toBe('ongoing');
    expect(s.map.stairs).toBeNull();
    expect(s.enemies).toHaveLength(1);
    expect(enemyDef(s.enemies[0]!).boss).toBe(true);
    expect(s.enemies[0]!.id).toBe(GEN.encounters[s.trait].boss);
    expect(s.chests).toEqual([]);
  });

  it('満腹度が0になると、行動のたびにHPが減り、0で力尽きる', () => {
    let s = startExplore(7, { maxSatiety: 2, enemyDensity: 0 });
    s = act(s, { kind: 'wait' }, { kind: 'wait' });
    expect(s.satiety).toBe(0);
    expect(s.stats.hp).toBe(s.stats.maxHp);
    s = act(s, { kind: 'wait' });
    expect(s.stats.hp).toBe(s.stats.maxHp - EXPLORE_CONFIG.starveDamage);
    while (s.outcome === 'ongoing') s = act(s, { kind: 'wait' });
    expect(s.outcome).toBe('defeated');
    expect(s.stats.hp).toBe(0);
  });

  // 満腹度が足りるか（バランス）は、balance.test.ts で確かめる。ここでは、本道をたどれば必ず次の階に降りられることだけを確かめる
  it('どのランクでも、本道だけを歩けばボス階まで着ける', { timeout: 30_000 }, () => {
    for (let rank = 1; rank <= RANK_CONFIG.maxRank; rank++) {
      for (let i = 0; i < 3; i++) {
        let s = startExplore(i * 2654435761, { enemyDensity: 0, rank, maxSatiety: 100000 });
        for (let f = 0; f < s.floors; f++) s = act(walkMainPath(s), { kind: 'descend' });
        expect(isBossFloor(s)).toBe(true);
        expect(s.outcome).toBe('ongoing');
      }
    }
  });
});

describe('visibleTiles', () => {
  // 7×7 の小さなマップを手で作る。中央に縦の壁があり、その向こうは見えない
  const rows = ['#######', '#..#..#', '#..#..#', '#..#..#', '#.....#', '#..#..#', '#######'];
  const map: FloorMap = {
    width: 7,
    height: 7,
    tiles: rows.join('').split('').map((c) => (c === '#' ? 'wall' : 'floor')),
    rooms: [],
    start: { x: 1, y: 1 },
    stairs: { x: 5, y: 1 },
    boss: null,
    mainPath: [],
    features: [],
  };
  const i = (x: number, y: number) => y * 7 + x;

  it('半径以内なら、壁の向こうも見える（主人公の視界は壁にさえぎられない）', () => {
    const v = visibleTiles(map, { x: 1, y: 1 }, 6);
    expect(v.has(i(3, 1))).toBe(true);
    expect(v.has(i(5, 1))).toBe(true);
  });

  it('敵の視界（canSee）は、今までどおり壁にさえぎられる', () => {
    expect(canSee(map, { x: 1, y: 1 }, { x: 5, y: 1 }, 6)).toBe(false);
    expect(canSee(map, { x: 1, y: 4 }, { x: 5, y: 4 }, 6)).toBe(true);
  });

  it('視界の半径より遠くは見えない', () => {
    const v = visibleTiles(map, { x: 1, y: 4 }, 2);
    expect(v.has(i(3, 4))).toBe(true);
    expect(v.has(i(5, 4))).toBe(false);
  });
});

describe('道具', () => {
  it('回復薬はHPを回復し、なくなる。HPが満タンなら使えない', () => {
    const s0 = startExplore(8, { loadout: ['potion'], enemyDensity: 0 });
    expect(step(s0, { kind: 'use_item', item: 'potion' }).ok).toBe(false);
    const hurt = { ...s0, stats: { ...s0.stats, hp: 30 } };
    const s = act(hurt, { kind: 'use_item', item: 'potion' });
    expect(s.stats.hp).toBe(45);
    expect(s.stats.items).toEqual([]);
    expect(s.turn).toBe(1);
  });

  it('食料は満腹度を回復する', () => {
    const s0 = startExplore(8, { loadout: ['food'], enemyDensity: 0 });
    const s = act({ ...s0, satiety: 100 }, { kind: 'use_item', item: 'food' });
    expect(s.satiety).toBe(300 - EXPLORE_CONFIG.satietyPerAction);
  });

  it('属性付与は武器に属性を付け、新しく付けると上書きする', () => {
    const s0 = startExplore(8, { loadout: ['sword', 'fire_whetstone', 'ice_whetstone'], enemyDensity: 0 });
    let s = act(s0, { kind: 'use_item', item: 'fire_whetstone' });
    expect(s.stats.enchant).toEqual({ element: 'fire', hits: 5 });
    s = act(s, { kind: 'use_item', item: 'ice_whetstone' });
    expect(s.stats.enchant).toEqual({ element: 'ice', hits: 5 });
  });

  it('持っていない道具は使えない', () => {
    expect(step(startExplore(8), { kind: 'use_item', item: 'potion' }).ok).toBe(false);
  });
});

describe('宝箱と金貨', () => {
  // 宝箱のある階から始まるシード（部屋の多い設定では、宝箱を置く行き止まりのない階もある）
  const CHEST_SEED = seedWhere((s) => s.chests.length > 0, { enemyDensity: 0 }, 11);

  /** 宝箱の隣まで本道と脇道をたどる代わりに、宝箱の上へ直接動かす状態を作る */
  function besideChest(seed: number, items: ItemId[] = []) {
    const s0 = startExplore(seed, { enemyDensity: 0, loadout: items });
    const chest = s0.chests[0]!;
    const from = [
      { x: chest.pos.x, y: chest.pos.y + 1 },
      { x: chest.pos.x, y: chest.pos.y - 1 },
      { x: chest.pos.x + 1, y: chest.pos.y },
      { x: chest.pos.x - 1, y: chest.pos.y },
    ].find((p) => tileAt(s0.map, p) === 'floor')!;
    return { state: { ...s0, player: from, enemies: [] }, chest, dir: dirBetween(from, chest.pos) };
  }

  it('宝箱は「宝箱」の行き止まりに置かれ、金貨は本道から遠いほど多い', () => {
    const s = startExplore(CHEST_SEED, { enemyDensity: 0 });
    const spots = s.map.features.filter((f) => f.kind === 'treasure');
    expect(s.chests.map((c) => c.pos)).toEqual(spots.map((f) => f.pos));
    for (const c of s.chests) {
      const depth = spots.find((f) => f.pos.x === c.pos.x && f.pos.y === c.pos.y)!.depth;
      expect(c.gold).toBe(depth * TREASURE_CONFIG.goldPerDepth);
    }
  });

  it('宝箱の上に乗ると中身を手に入れ、宝箱は開いて空のまま残る。もう一度乗っても何も起きない', () => {
    const { state, chest, dir } = besideChest(CHEST_SEED);
    const s = act(state, { kind: 'move', dir });
    expect(s.gold).toBe(chest.gold);
    if (chest.item) expect(s.stats.items).toContain(chest.item);
    expect(s.chests).toHaveLength(state.chests.length);
    const opened = s.chests.find((c) => c.pos.x === chest.pos.x && c.pos.y === chest.pos.y)!;
    expect(opened).toEqual({ ...chest, gold: 0, item: null, opened: true });
    // 降りて、また乗る
    const back = { up: 'down', down: 'up', left: 'right', right: 'left' } as const;
    const again = act(act(s, { kind: 'move', dir: back[dir] }), { kind: 'move', dir });
    expect(again.gold).toBe(s.gold);
    expect(again.log.filter((l) => l.includes('宝箱'))).toEqual(s.log.filter((l) => l.includes('宝箱')));
  });

  it('持ち物がいっぱいなら、道具は宝箱に残る', () => {
    // 道具の入った宝箱があるシードを探す
    let seed = 1;
    while (!startExplore(seed, { enemyDensity: 0 }).chests[0]?.item) seed++;
    const full: ItemId[] = Array.from({ length: PREP_CONFIG.maxItems }, () => 'potion');
    const { state, chest, dir } = besideChest(seed, full);
    const s = act(state, { kind: 'move', dir });
    expect(s.gold).toBe(chest.gold);
    expect(s.stats.items).toHaveLength(PREP_CONFIG.maxItems);
    expect(s.chests.find((c) => c.pos.x === chest.pos.x && c.pos.y === chest.pos.y)).toEqual({ ...chest, gold: 0, opened: true });
  });

  it('踏破すれば金貨を全額、力尽きたら半分持ち帰る', () => {
    const s = { ...startExplore(1), gold: 81 };
    expect(toResult({ ...s, outcome: 'cleared' }).goldBrought).toBe(81);
    expect(toResult({ ...s, outcome: 'defeated' }).goldBrought).toBe(40);
  });
});

describe('地図', () => {
  it('地図があると、各階の入口から階段までの道筋が最初から見えている', () => {
    const s = startExplore(12, { hasMap: true, enemyDensity: 0 });
    for (const p of s.map.mainPath) expect(s.seen[p.y * s.map.width + p.x]).toBe(true);
    const next = act(walkMainPath(s), { kind: 'descend' });
    for (const p of next.map.mainPath) expect(next.seen[p.y * next.map.width + p.x]).toBe(true);
  });

  it('地図がなければ、階段は最初は見えていない', () => {
    const s = startExplore(12, { enemyDensity: 0 });
    expect(s.seen[s.map.stairs!.y * s.map.width + s.map.stairs!.x]).toBe(false);
  });
});

describe('ランク', () => {
  it('ランクで広さと満腹度の上限が決まる', () => {
    const s = startExplore(3, { rank: 3 });
    expect(s.rank).toBe(3);
    expect(s.map.width).toBe(rankParams(3, GEN.floors).mapSize);
    expect(s.maxSatiety).toBe(rankParams(3, GEN.floors).maxSatiety);
  });

  it('ランクが高いほど宝箱の金貨が多い', () => {
    // 同じシード・同じ広さで比べ、ランクの倍率だけを変える
    const low = startExplore(5, { rank: 1, mapSize: 50 });
    const high = startExplore(5, { rank: 3, mapSize: 50 });
    expect(high.chests.map((c) => c.pos)).toEqual(low.chests.map((c) => c.pos));
    high.chests.forEach((c, i) => expect(c.gold).toBe(Math.round(low.chests[i]!.gold * rankParams(3, GEN.floors).chestGoldRate)));
  });
});

describe('リタイア', () => {
  it('リタイアすると、ターンを使わず、敵も動かないまま探索が終わる', () => {
    const s0 = startExplore(3);
    const s = act(s0, { kind: 'retire' });
    expect(s.outcome).toBe('retired');
    expect(s.turn).toBe(s0.turn);
    expect(s.enemies).toEqual(s0.enemies);
    expect(s.log.at(-1)).toBe('リタイアして、ダンジョンを出た');
    // 終わったあとは、もう動けない
    expect(step(s, { kind: 'wait' }).ok).toBe(false);
  });

  it('結果は踏破しなかった扱いで、金貨は力尽きたときと同じだけ持ち帰る', () => {
    const s = act({ ...startExplore(3), gold: 101 }, { kind: 'retire' });
    const r = toResult(s);
    expect(r.outcome).toBe('retired');
    expect(r.gold).toBe(101);
    expect(r.goldBrought).toBe(Math.floor(101 * TREASURE_CONFIG.keepOnDefeat));
  });
});

describe('遊ぶダンジョン', () => {
  // テストのためだけのダンジョンを、一覧に一時的に足す（ファイルは作らない。管理画面でダンジョンを足したり消したりしても、テストは変わらない）
  const TEST_ID = 'test_only';
  const registry = DUNGEONS as Record<string, DungeonFile>;
  const one = { pool: [FIELD_ENEMY], boss: BOSS_ENEMY };
  const testDungeon: DungeonFile = {
    ...(JSON.parse(JSON.stringify(GEN)) as DungeonFile),
    name: 'テスト用',
    floors: { count: 2, sizes: GEN.floors.sizes.map(() => 30), satiety: GEN.floors.satiety.map(() => 777) },
    encounters: { fire: one, ice: one, neutral: one, light: one, dark: one },
  };
  afterEach(() => {
    delete registry[TEST_ID];
  });

  it('指定しなければ、標準のダンジョンで遊ぶ', () => {
    const s = startExplore(1);
    expect(s.dungeon).toBe(DEFAULT_DUNGEON_ID);
    expect(s.floors).toBe(GEN.floors.count);
  });

  it('選んだダンジョンの設定（階の数・広さ・満腹度・出る敵・ボス）で遊ぶ', () => {
    registry[TEST_ID] = testDungeon;
    let s = startExplore(4, { dungeon: TEST_ID, rank: 2 });
    expect(s.dungeon).toBe(TEST_ID);
    expect(s.floors).toBe(2);
    expect(s.mapSize).toBe(30);
    expect(s.maxSatiety).toBe(777);
    expect(s.enemies.length).toBeGreaterThan(0);
    expect(s.enemies.every((e) => e.id === FIELD_ENEMY)).toBe(true);
    for (let f = 0; f < s.floors; f++) s = act(walkMainPath(s), { kind: 'descend' });
    expect(isBossFloor(s)).toBe(true);
    expect(s.enemies.map((e) => e.id)).toEqual([BOSS_ENEMY]);
  });

  it('ないダンジョンを指定すると、エラーになる', () => {
    expect(() => startExplore(1, { dungeon: 'nothing_here' })).toThrow();
  });
});
