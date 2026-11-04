import { describe, expect, it } from 'vitest';
import { bfs, findDeadEnds, generateFloor, MAP_CONFIG, tileAt, type FloorMap, type Pos } from './map';

const SEEDS = Array.from({ length: 30 }, (_, i) => i * 2654435761);
const SIZES = [
  { width: 30, height: 30 },
  { width: 57, height: 41 },
  { width: 100, height: 100 },
];

const key = (p: Pos) => `${p.x},${p.y}`;

function forEachMap(fn: (map: FloorMap) => void) {
  for (const size of SIZES) for (const seed of SEEDS) fn(generateFloor(seed, size));
}

describe('generateFloor', () => {
  it('同じシードなら同じマップ', () => {
    expect(generateFloor(7, { width: 40, height: 40 })).toEqual(generateFloor(7, { width: 40, height: 40 }));
  });

  it('シードが違えば形が変わる', () => {
    expect(generateFloor(1, { width: 40, height: 40 }).tiles).not.toEqual(
      generateFloor(2, { width: 40, height: 40 }).tiles,
    );
  });

  it('指定した広さで、外周はすべて壁', () => {
    for (const size of SIZES) {
      const map = generateFloor(3, size);
      expect(map.tiles).toHaveLength(size.width * size.height);
      for (let x = 0; x < map.width; x++) {
        expect(tileAt(map, { x, y: 0 })).toBe('wall');
        expect(tileAt(map, { x, y: map.height - 1 })).toBe('wall');
      }
      for (let y = 0; y < map.height; y++) {
        expect(tileAt(map, { x: 0, y })).toBe('wall');
        expect(tileAt(map, { x: map.width - 1, y })).toBe('wall');
      }
    }
  });

  it('範囲外の広さはエラー', () => {
    expect(() => generateFloor(1, { width: 29, height: 30 })).toThrow(RangeError);
    expect(() => generateFloor(1, { width: 30, height: 101 })).toThrow(RangeError);
    expect(() => generateFloor(1, { width: 30.5, height: 30 })).toThrow(RangeError);
  });

  it('すべての通路は入口からたどり着ける', () => {
    forEachMap((map) => {
      const { dist } = bfs(map, [map.start]);
      const unreachable = map.tiles.filter((t, i) => t === 'floor' && dist[i] === -1).length;
      expect(unreachable).toBe(0);
    });
  });

  it('本道は入口から階段まで、通路を1マスずつ進む最短路', () => {
    forEachMap((map) => {
      const path = map.mainPath;
      expect(path[0]).toEqual(map.start);
      expect(path.at(-1)).toEqual(map.stairs);
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1]!;
        const b = path[i]!;
        expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
        expect(tileAt(map, b)).toBe('floor');
      }
      const { dist } = bfs(map, [map.start]);
      expect(path.length - 1).toBe(dist[map.stairs.y * map.width + map.stairs.x]);
    });
  });

  it('階段は入口からほどよく遠い通路にある', () => {
    forEachMap((map) => {
      const { dist } = bfs(map, [map.start]);
      const farthest = Math.max(...dist);
      const d = dist[map.stairs.y * map.width + map.stairs.x]!;
      expect(d).toBeGreaterThanOrEqual(Math.ceil(farthest * MAP_CONFIG.stairsMinRatio));
      expect(d).toBeLessThanOrEqual(Math.floor(farthest * MAP_CONFIG.stairsMaxRatio));
    });
  });

  it('小部屋はマップの内側にあり、重ならず、中はすべて通路', () => {
    forEachMap((map) => {
      expect(map.rooms.length).toBeGreaterThan(0);
      const cells = new Set<string>();
      let walls = 0;
      let overlapped = 0;
      for (const r of map.rooms) {
        expect(r.x).toBeGreaterThanOrEqual(1);
        expect(r.y).toBeGreaterThanOrEqual(1);
        expect(r.x + r.width).toBeLessThan(map.width);
        expect(r.y + r.height).toBeLessThan(map.height);
        expect(r.width).toBeGreaterThanOrEqual(MAP_CONFIG.roomMinSize);
        expect(r.width).toBeLessThanOrEqual(MAP_CONFIG.roomMaxSize);
        for (let y = r.y; y < r.y + r.height; y++) {
          for (let x = r.x; x < r.x + r.width; x++) {
            if (tileAt(map, { x, y }) !== 'floor') walls++;
            if (cells.has(`${x},${y}`)) overlapped++;
            cells.add(`${x},${y}`);
          }
        }
      }
      expect(walls).toBe(0);
      expect(overlapped).toBe(0);
    });
  });

  it('一本道ではなく、本道から外れた行き止まりがある', () => {
    forEachMap((map) => {
      const onMain = new Set(map.mainPath.map(key));
      expect(findDeadEnds(map).some((p) => !onMain.has(key(p)))).toBe(true);
    });
  });

  it('脇道の行き止まりに宝箱か強敵が置かれる', () => {
    forEachMap((map) => {
      expect(map.features.length).toBeGreaterThan(0);
      const onMain = new Set(map.mainPath.map(key));
      const deadEnds = new Set(findDeadEnds(map).map(key));
      for (const f of map.features) {
        expect(onMain.has(key(f.pos))).toBe(false);
        expect(deadEnds.has(key(f.pos))).toBe(true);
        expect(f.depth).toBeGreaterThanOrEqual(MAP_CONFIG.minBranchDepth);
      }
      expect(new Set(map.features.map((f) => key(f.pos))).size).toBe(map.features.length);
    });
  });

  it('宝箱と強敵の両方が出る', () => {
    const kinds = new Set<string>();
    forEachMap((map) => map.features.forEach((f) => kinds.add(f.kind)));
    expect(kinds).toEqual(new Set(['treasure', 'elite']));
  });
});
