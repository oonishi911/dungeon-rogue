// テスト用の小さな部屋（敵の個性・床の跡のテストで使う）
import { type MapEnemy, enemyDef } from './enemies';
import { startExplore, step } from './explore';
import { type ExploreAction, type ExploreState } from './exploreTypes';
import type { FloorMap, Pos } from './map';
import type { EnemyId, Result } from './types';

export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

export function act(state: ExploreState, ...actions: ExploreAction[]): ExploreState {
  return actions.reduce((s, a) => unwrap(step(s, a)), state);
}

export const WAIT: ExploreAction = { kind: 'wait' };

export function foe(id: EnemyId, pos: Pos, overrides: Partial<MapEnemy> = {}): MapEnemy {
  return { uid: 0, id, elite: false, pos, hp: enemyDef({ id, elite: false }).hp, mode: 'chase', justNoticed: false, lastSeen: pos, searchTurns: 0, ...overrides };
}

export function mapOf(rows: string[]): FloorMap {
  return {
    width: rows[0]!.length,
    height: rows.length,
    tiles: rows.join('').split('').map((c) => (c === '#' ? 'wall' : 'floor')),
    rooms: [],
    start: { x: 1, y: 1 },
    stairs: { x: 1, y: 1 },
    boss: null,
    mainPath: [],
    features: [],
  };
}

export function arena(rows: string[], player: Pos, enemies: MapEnemy[]): ExploreState {
  const base = startExplore(1, { enemyDensity: 0 });
  const map = mapOf(rows);
  return { ...base, map, player, enemies: enemies.map((e, i) => ({ ...e, uid: i })), seen: new Array<boolean>(map.tiles.length).fill(true) };
}

// 横11マス×縦3マスの部屋
export const ROOM = ['###########', '#.........#', '#.........#', '#.........#', '###########'];

