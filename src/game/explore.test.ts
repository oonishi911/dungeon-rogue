import { describe, expect, it } from 'vitest';
import {
  dirBetween,
  EXPLORE_CONFIG,
  startExplore,
  step,
  visibleTiles,
  type ExploreAction,
  type ExploreState,
} from './explore';
import { tileAt, type FloorMap } from './map';
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
    expect(s.satiety).toBe(EXPLORE_CONFIG.maxSatiety);
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
    expect(s.satiety).toBe(EXPLORE_CONFIG.maxSatiety - 1);
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

  it('最下層の階段で降りると探索を終え、それ以上は行動できない', () => {
    let s = startExplore(6, { enemyDensity: 0 });
    for (let f = 0; f < EXPLORE_CONFIG.floors; f++) s = act(walkMainPath(s), { kind: 'descend' });
    expect(s.outcome).toBe('reached_bottom');
    expect(step(s, { kind: 'wait' }).ok).toBe(false);
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

  it('強化していなくても、本道だけを歩けば満腹度が0にならずに最下層まで着ける', () => {
    for (let i = 0; i < 100; i++) {
      let s = startExplore(i * 2654435761, { enemyDensity: 0 });
      for (let f = 0; f < EXPLORE_CONFIG.floors; f++) s = act(walkMainPath(s), { kind: 'descend' });
      expect(s.outcome).toBe('reached_bottom');
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
