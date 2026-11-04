import { describe, expect, it } from 'vitest';
import { enemyDef } from './enemies';
import {
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
import { PREP_CONFIG, TRAIT_ENEMIES, TREASURE_CONFIG } from './data';
import { tileAt, type FloorMap } from './map';
import { RANK_CONFIG, rankParams } from './rank';
import type { ItemId } from './types';
import type { Result } from './types';

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function act(state: ExploreState, ...actions: ExploreAction[]): ExploreState {
  return actions.reduce((s, a) => unwrap(step(s, a)), state);
}

/** 本道をたどって階段まで歩く */
function walkMainPath(state: ExploreState): ExploreState {
  const path = state.map.mainPath;
  let s = state;
  for (let i = 1; i < path.length; i++) s = act(s, { kind: 'move', dir: dirBetween(path[i - 1]!, path[i]!) });
  return s;
}

/** 入口の隣の通路と、壁の方向 */
function neighbors(state: ExploreState) {
  const dirs = ['up', 'down', 'left', 'right'] as const;
  const delta = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;
  const kind = (d: (typeof dirs)[number]) =>
    tileAt(state.map, { x: state.player.x + delta[d][0], y: state.player.y + delta[d][1] });
  return { open: dirs.find((d) => kind(d) === 'floor')!, wall: dirs.find((d) => kind(d) === 'wall')! };
}

describe('startExplore', () => {
  it('地下1階の入口から、満腹度とHPが満タンで始まる', () => {
    const s = startExplore(1);
    expect(s.floor).toBe(0);
    expect(s.player).toEqual(s.map.start);
    expect(s.satiety).toBe(rankParams(1).maxSatiety);
    expect(s.stats.hp).toBe(s.stats.maxHp);
    expect(s.seen[s.player.y * s.map.width + s.player.x]).toBe(true);
  });

  it('同じシードなら同じ階層', () => {
    expect(startExplore(5)).toEqual(startExplore(5));
  });

  it('最初は周りしか見えていない', () => {
    const s = startExplore(2);
    const seen = s.seen.filter(Boolean).length;
    expect(seen).toBeGreaterThan(0);
    expect(seen).toBeLessThan(s.seen.length / 4);
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
    const s = startExplore(3);
    const r = step(s, { kind: 'move', dir: neighbors(s).wall });
    expect(r.ok).toBe(false);
  });

  it('足踏みも1行動', () => {
    const s = act(startExplore(3), { kind: 'wait' });
    expect(s.turn).toBe(1);
    expect(s.satiety).toBe(rankParams(1).maxSatiety - 1);
  });

  it('階段の上でなければ降りられない', () => {
    expect(step(startExplore(4), { kind: 'descend' }).ok).toBe(false);
  });

  it('階段で降りると次の階の入口に出て、霧も新しくなる', () => {
    const s = walkMainPath(startExplore(4, { enemyDensity: 0 }));
    const next = act(s, { kind: 'descend' });
    expect(next.floor).toBe(1);
    expect(next.map).not.toEqual(s.map);
    expect(next.player).toEqual(next.map.start);
    // 前の階の記憶は消え、入口から見える範囲だけが晴れている
    const visible = visibleTiles(next.map, next.player, EXPLORE_CONFIG.sightRadius);
    expect(next.seen.filter(Boolean).length).toBe(visible.size);
  });

  it('最後の階の階段を降りるとボス階に出る。ボス階に階段はなく、ボスが1体だけいる', () => {
    let s = startExplore(6, { enemyDensity: 0 });
    for (let f = 0; f < EXPLORE_CONFIG.floors; f++) s = act(walkMainPath(s), { kind: 'descend' });
    expect(isBossFloor(s)).toBe(true);
    expect(s.outcome).toBe('ongoing');
    expect(s.map.stairs).toBeNull();
    expect(s.enemies).toHaveLength(1);
    expect(enemyDef(s.enemies[0]!).boss).toBe(true);
    expect(s.enemies[0]!.id).toBe(TRAIT_ENEMIES[s.trait].boss);
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

  it('どのランクでも、本道だけを歩けば満腹度が0にならずにボス階まで着ける', () => {
    for (let rank = 2; rank <= RANK_CONFIG.maxRank; rank++) {
      for (let i = 0; i < 10; i++) {
        let s = startExplore(i * 2654435761, { enemyDensity: 0, rank });
        for (let f = 0; f < EXPLORE_CONFIG.floors; f++) s = act(walkMainPath(s), { kind: 'descend' });
        expect(isBossFloor(s)).toBe(true);
        expect(s.satiety).toBeGreaterThan(0);
      }
    }
  });

  it('強化していなくても、本道だけを歩けば満腹度が0にならずにボス階まで着ける', () => {
    for (let i = 0; i < 100; i++) {
      let s = startExplore(i * 2654435761, { enemyDensity: 0 });
      for (let f = 0; f < EXPLORE_CONFIG.floors; f++) s = act(walkMainPath(s), { kind: 'descend' });
      expect(isBossFloor(s)).toBe(true);
      expect(s.satiety).toBeGreaterThan(0);
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

  it('壁そのものは見えるが、壁の向こうは見えない', () => {
    const v = visibleTiles(map, { x: 1, y: 1 }, 6);
    expect(v.has(i(3, 1))).toBe(true);
    expect(v.has(i(5, 1))).toBe(false);
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
    const s = startExplore(11, { enemyDensity: 0 });
    const spots = s.map.features.filter((f) => f.kind === 'treasure');
    expect(s.chests.map((c) => c.pos)).toEqual(spots.map((f) => f.pos));
    for (const c of s.chests) {
      const depth = spots.find((f) => f.pos.x === c.pos.x && f.pos.y === c.pos.y)!.depth;
      expect(c.gold).toBe(depth * TREASURE_CONFIG.goldPerDepth);
    }
  });

  it('宝箱の上に乗ると中身を手に入れ、宝箱はなくなる', () => {
    const { state, chest, dir } = besideChest(11);
    const s = act(state, { kind: 'move', dir });
    expect(s.gold).toBe(chest.gold);
    if (chest.item) expect(s.stats.items).toContain(chest.item);
    expect(s.chests).toHaveLength(state.chests.length - 1);
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
    expect(s.chests.find((c) => c.pos.x === chest.pos.x && c.pos.y === chest.pos.y)).toEqual({ ...chest, gold: 0 });
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
    expect(s.map.width).toBe(rankParams(3).mapSize);
    expect(s.maxSatiety).toBe(rankParams(3).maxSatiety);
  });

  it('ランクが高いほど宝箱の金貨が多い', () => {
    // 同じシード・同じ広さで比べ、ランクの倍率だけを変える
    const low = startExplore(5, { rank: 1, mapSize: 50 });
    const high = startExplore(5, { rank: 3, mapSize: 50 });
    expect(high.chests.map((c) => c.pos)).toEqual(low.chests.map((c) => c.pos));
    high.chests.forEach((c, i) => expect(c.gold).toBe(Math.round(low.chests[i]!.gold * rankParams(3).chestGoldRate)));
  });
});
