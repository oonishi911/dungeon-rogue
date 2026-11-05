import { describe, expect, it } from 'vitest';
import { enemyDef, type MapEnemy } from './enemies';
import { startExplore, type ExploreState } from './explore';
import type { FloorMap, Pos } from './map';
import { findPath, walkPath, walkToward } from './path';

// 横9マス×縦3マスの部屋。左下に霧の残ったマスを1つ作る
const ROWS = ['###########', '#.........#', '#.........#', '#.........#', '###########'];

function room(player: Pos, enemies: Pos[] = [], fog: Pos[] = []): ExploreState {
  const base = startExplore(1, { enemyDensity: 0 });
  const map: FloorMap = {
    width: ROWS[0]!.length,
    height: ROWS.length,
    tiles: ROWS.join('').split('').map((c) => (c === '#' ? 'wall' : 'floor')),
    rooms: [],
    start: player,
    stairs: null,
    boss: null,
    mainPath: [],
    features: [],
  };
  const seen = new Array<boolean>(map.tiles.length).fill(true);
  for (const p of fog) seen[p.y * map.width + p.x] = false;
  const list: MapEnemy[] = enemies.map((pos, uid) => ({
    uid,
    id: 'goblin',
    elite: false,
    pos,
    hp: enemyDef({ id: 'goblin', elite: false }).hp,
    mode: 'wander',
    justNoticed: false,
    lastSeen: null,
    searchTurns: 0,
  }));
  return { ...base, map, player, enemies: list, seen };
}

describe('findPath', () => {
  it('最短路を、今いるマスを除き目的のマスを含めて返す', () => {
    const path = findPath(room({ x: 1, y: 2 }), (p) => p.x === 4 && p.y === 2);
    expect(path).toEqual([
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 4, y: 2 },
    ]);
  });

  it('霧に覆われたマスは通らず、目的地にもできない', () => {
    const s = room({ x: 1, y: 2 }, [], [{ x: 5, y: 2 }]);
    expect(findPath(s, (p) => p.x === 5 && p.y === 2)).toBeNull();
    // 霧のマスをよけて回り込む
    expect(findPath(s, (p) => p.x === 6 && p.y === 2)!.some((p) => p.x === 5 && p.y === 2)).toBe(false);
  });
});

describe('walkToward', () => {
  it('目的地へ向かう1歩を返し、着いたら止まる', () => {
    expect(walkToward(room({ x: 1, y: 2 }), { x: 3, y: 2 })).toEqual({ kind: 'move', dir: 'right' });
    expect(walkToward(room({ x: 3, y: 2 }), { x: 3, y: 2 })).toBeNull();
  });

  it('道の途中に敵がいたら、勝手に攻撃せずに止まる', () => {
    // 1行目と3行目を壁にして、迂回できない通路にする
    const s = room({ x: 1, y: 2 }, [{ x: 2, y: 2 }]);
    const corridor = { ...s, map: { ...s.map, tiles: s.map.tiles.map((t, i) => (Math.floor(i / 11) === 2 ? t : 'wall' as const)) } };
    expect(walkToward(corridor, { x: 5, y: 2 })).toBeNull();
  });

  it('敵そのものを目的地に選んだときは、隣に着いたら攻撃する', () => {
    expect(walkToward(room({ x: 1, y: 2 }, [{ x: 2, y: 2 }]), { x: 2, y: 2 })).toEqual({ kind: 'move', dir: 'right' });
  });

  it('届かない場所なら止まる', () => {
    expect(walkToward(room({ x: 1, y: 2 }), { x: 0, y: 0 })).toBeNull();
  });
});

describe('walkPath', () => {
  it('避けたいマスがあれば、遠回りしてでも避ける', () => {
    const state = room({ x: 1, y: 2 });
    const path = walkPath(state, { x: 5, y: 2 }, new Set(['3,2']))!;
    expect(path.some((p) => p.x === 3 && p.y === 2)).toBe(false);
    expect(path.at(-1)).toEqual({ x: 5, y: 2 });
  });

  it('避けたいマスが行き先そのものなら、そこへ向かう', () => {
    const state = room({ x: 1, y: 2 });
    expect(walkPath(state, { x: 3, y: 2 }, new Set(['3,2']))!.at(-1)).toEqual({ x: 3, y: 2 });
  });

  it('避けたいマスを通らないと届かないときは、通る', () => {
    // 上下を霧でふさぎ、(3,2) を通る道しかないようにする
    const fog = [
      { x: 3, y: 1 },
      { x: 3, y: 3 },
    ];
    const state = room({ x: 1, y: 2 }, [], fog);
    const path = walkPath(state, { x: 5, y: 2 }, new Set(['3,2']))!;
    expect(path.some((p) => p.x === 3 && p.y === 2)).toBe(true);
  });
});
