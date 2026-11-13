import { describe, expect, it } from 'vitest';
import { spawnEnemies, wanderStep } from './enemies';
import json from './dungeonGen.json?raw';
import { describeGenChanges, genProblems, parseGenSettings, serializeGenSettings, type GenSettings, type EnemySettings } from './genMaster';
import { generateFloor, type FloorMap, type Room } from './map';

// 関数を確かめるための、決まった中身の設定（管理画面で dungeonGen.json を変えても、こちらは変わらない）
const SAMPLE: GenSettings = {
  floors: { count: 3, sizes: [20, 30, 40, 50, 60, 70, 80, 90, 100], satiety: [400, 900, 1600, 2500, 3600, 4900, 6400, 8100, 10000] },
  rooms: { attemptRate: 0.04, minSize: 3, maxSize: 9 },
  enemies: { amount: 1, placement: 'mixed', roomWeight: 1, nestChance: 0, nestMin: 3, nestMax: 5, stayInRoom: false },
  growth: { expBase: 30, expStep: 20, hpPerLevel: 2, atkPerLevel: 1, maxLevel: 10, eliteRate: 3 },
  magic: { maxMp: 20, regenEvery: 6, power: 8, staffPower: 1.5, staffMp: 10, noiseRadius: 3 },
  spells: {
    shockwave: { cost: 6, power: 0.3, push: 3, crash: 3 },
    sweep: { cost: 5, power: 0.8, range: 3 },
    fire_bolt: { cost: 4, power: 1, range: 6 },
    ice_bolt: { cost: 4, power: 1, range: 6 },
    light_lance: { cost: 4, power: 1, range: 6 },
    dark_bolt: { cost: 4, power: 1, range: 6 },
    heal: { cost: 6, amount: 20 },
    regen: { cost: 5, amount: 3, turns: 8 },
  },
};
const clone = (): GenSettings => JSON.parse(JSON.stringify(SAMPLE)) as GenSettings;
const enemiesFor = (patch: Partial<EnemySettings>) => ({ ...SAMPLE.enemies, ...patch });
const inRoom = (map: FloorMap, p: { x: number; y: number }) =>
  map.rooms.some((r) => p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height);
const maps = Array.from({ length: 12 }, (_, i) => generateFloor(i * 7919 + 1, { width: 40, height: 40, rooms: { attemptRate: 0.12, minSize: 3, maxSize: 7 } }));

describe('ダンジョン生成の設定（dungeonGen.json）', () => {
  it('正しい形になっていて、書き出すと同じ中身になる', () => {
    expect(genProblems(JSON.parse(json))).toEqual([]);
    expect(serializeGenSettings(parseGenSettings(JSON.parse(json)))).toBe(json);
  });

  it('範囲の外の値や、最小が最大より大きいものは問題として返す', () => {
    const bad = clone();
    bad.rooms.minSize = 4;
    bad.rooms.maxSize = 3;
    bad.enemies.nestChance = 2;
    bad.enemies.nestMin = 6;
    bad.enemies.nestMax = 2;
    bad.growth.maxLevel = 0;
    bad.spells.heal.amount = -1;
    const problems = genProblems(bad);
    expect(problems.some((p) => p.includes('奇数'))).toBe(true);
    expect(problems.some((p) => p.includes('部屋の大きさ：最小'))).toBe(true);
    expect(problems.some((p) => p.includes('群れ部屋になる確率'))).toBe(true);
    expect(problems.some((p) => p.includes('群れの敵の数：最小'))).toBe(true);
    expect(problems.some((p) => p.includes('レベルの上限'))).toBe(true);
    expect(problems.some((p) => p.includes('癒しの回復するHP'))).toBe(true);
    expect(() => parseGenSettings(bad)).toThrow();
  });

  it('階の数・広さ・満腹度：範囲の外、整数でない、数が足りない、上のランクの方が狭い（広さのみ）、は問題として返す', () => {
    const check = (edit: (g: GenSettings) => void) => {
      const bad = clone();
      edit(bad);
      return genProblems(bad);
    };
    expect(check((g) => void (g.floors.count = 0))).toEqual(['階の数：1〜10の数にする']);
    expect(check((g) => void (g.floors.count = 2.5))).toEqual(['階の数：整数にする']);
    expect(check((g) => void (g.floors.sizes[0] = 19))).toEqual(['ランク1の階の広さ：20〜100の数にする']);
    expect(check((g) => void (g.floors.sizes[8] = 101))).toEqual(['ランク9の階の広さ：20〜100の数にする']);
    expect(check((g) => void (g.floors.sizes[1] = 30.5))).toEqual(['ランク2の階の広さ：整数にする']);
    expect(check((g) => void (g.floors.sizes[3] = 35))).toEqual(['ランク4の階の広さ：ランク3の広さ（40）以上にする']);
    expect(check((g) => void g.floors.sizes.pop())).toEqual(['階の広さ：ランク1〜9の9個を並べる']);
    // 満腹度（ランクごと）
    expect(check((g) => void (g.floors.satiety[0] = 99))).toEqual(['ランク1の満腹度：100〜100000の数にする']);
    expect(check((g) => void (g.floors.satiety[8] = 100001))).toEqual(['ランク9の満腹度：100〜100000の数にする']);
    expect(check((g) => void (g.floors.satiety[2] = 1600.5))).toEqual(['ランク3の満腹度：整数にする']);
    expect(check((g) => void g.floors.satiety.pop())).toEqual(['満腹度：ランク1〜9の9個を並べる']);
    expect(check((g) => void ((g.floors as { satiety?: number[] }).satiety = undefined))).toEqual(['満腹度：ランク1〜9の9個を並べる']);
    // 満腹度は、広さや階の数とは関係なく決められる（上のランクの方が少なくても、階の数を変えても構わない）
    expect(check((g) => void (g.floors.satiety = [10000, 100, 500, 100000, 100, 100, 100, 100, 100]))).toEqual([]);
    expect(check((g) => void (g.floors.count = 10))).toEqual([]);
    // 同じ広さが続くのは構わない
    expect(check((g) => void (g.floors.sizes = [20, 20, 20, 40, 40, 40, 100, 100, 100]))).toEqual([]);
    expect(genProblems({ ...clone(), floors: undefined })).toEqual(['floors・rooms・enemies・growth・magic・spells のどれかがない']);
  });

  it('変えたところを日本語で説明する', () => {
    const after = clone();
    after.floors.count = 4;
    after.floors.sizes[0] = 25;
    after.floors.sizes[8] = 90;
    after.floors.satiety[1] = 1200;
    after.floors.satiety[8] = 12000;
    after.rooms.attemptRate = 0.1;
    after.enemies.stayInRoom = true;
    after.growth.hpPerLevel = 4;
    after.magic.maxMp = 30;
    after.spells.shockwave.push = 2;
    expect(describeGenChanges(SAMPLE, after)).toEqual([
      '階の数：3 → 4',
      'ランク1の階の広さ：20 → 25',
      'ランク9の階の広さ：100 → 90',
      'ランク2の満腹度：900 → 1200',
      'ランク9の満腹度：10000 → 12000',
      '部屋の多さ：0.04 → 0.1',
      '部屋の敵は部屋から出ない：しない → する',
      '1レベルで増える最大HP：2 → 4',
      '魔力の最大：20 → 30',
      '衝撃波の吹き飛ばすマス数：3 → 2',
    ]);
  });

  it('部屋の多さを上げると、部屋が増える', () => {
    const count = (attemptRate: number) =>
      [1, 2, 3, 4, 5].reduce((n, seed) => n + generateFloor(seed, { width: 40, height: 40, rooms: { ...SAMPLE.rooms, attemptRate } }).rooms.length, 0);
    expect(count(0.12)).toBeGreaterThan(count(0.04));
    expect(count(0)).toBe(0);
  });
});

describe('部屋への敵の置き方', () => {
  const share = (settings: EnemySettings) => {
    let inside = 0;
    let all = 0;
    for (const map of maps) {
      const { enemies } = spawnEnemies(map, 'neutral', 99, 0, 0.02, settings);
      const normal = enemies.filter((e) => !e.elite);
      inside += normal.filter((e) => inRoom(map, e.pos)).length;
      all += normal.length;
    }
    return { inside, all };
  };

  it('重みを上げると、敵の数は変えずに、部屋に置く敵が増える', () => {
    const same = share(enemiesFor({ roomWeight: 1 }));
    const heavy = share(enemiesFor({ roomWeight: 5 }));
    expect(heavy.all).toBe(same.all);
    expect(heavy.inside / heavy.all).toBeGreaterThan(same.inside / same.all + 0.15);
    expect(share(enemiesFor({ roomWeight: 0 })).inside).toBe(0);
  });

  it('部屋だけにすると部屋の中にだけ、通路だけにすると通路にだけ置く（群れ部屋も作らない）', () => {
    const rooms = share(enemiesFor({ placement: 'rooms' }));
    expect(rooms.all).toBeGreaterThan(0);
    expect(rooms.inside).toBe(rooms.all);
    const corridors = share(enemiesFor({ placement: 'corridors', nestChance: 1 }));
    expect(corridors.all).toBeGreaterThan(0);
    expect(corridors.inside).toBe(0);
  });

  it('敵の数の倍率で、通常の敵の数が変わる', () => {
    const none = share(enemiesFor({ amount: 0 }));
    const one = share(enemiesFor({ amount: 1 }));
    const two = share(enemiesFor({ amount: 2 }));
    expect(none.all).toBe(0);
    expect(two.all).toBeGreaterThan(one.all * 1.8);
  });

  it('群れ部屋は、通常の敵とは別に、部屋の中へまとめて置く', () => {
    for (const map of maps) {
      const plain = spawnEnemies(map, 'neutral', 7, 0, 0.01, enemiesFor({})).enemies.length;
      const { enemies } = spawnEnemies(map, 'neutral', 7, 0, 0.01, enemiesFor({ nestChance: 1, nestMin: 3, nestMax: 3 }));
      const extra = enemies.length - plain;
      expect(extra).toBeGreaterThan(0);
      expect(extra).toBeLessThanOrEqual(map.rooms.length * 3);
      // 同じマスに2体いない
      expect(new Set(enemies.map((e) => `${e.pos.x},${e.pos.y}`)).size).toBe(enemies.length);
    }
  });

  it('部屋の敵を部屋から出さない設定では、気付くまで部屋の中だけを歩く', () => {
    const map = maps[0]!;
    const { enemies } = spawnEnemies(map, 'neutral', 3, 0, 0.03, enemiesFor({ roomWeight: 5, stayInRoom: true }));
    const roomed = enemies.filter((e) => e.room);
    expect(roomed.length).toBeGreaterThan(0);
    const inside = (r: Room, p: { x: number; y: number }) => p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;
    for (const e of roomed) {
      let pos = e.pos;
      let rng = 11;
      for (let t = 0; t < 200; t++) {
        const step = wanderStep(map, pos, new Set(), rng, e.room);
        pos = step.pos;
        rng = step.rngState;
        expect(inside(e.room!, pos)).toBe(true);
      }
    }
  });
});
