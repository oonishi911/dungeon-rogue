import { describe, expect, it } from 'vitest';
import { ENEMY_MASTER } from './data';
import { DEFAULT_DUNGEON, DEFAULT_DUNGEON_ID, DUNGEON_IDS, dungeonOf, sortDungeonIds } from './dungeons';
import { spawnEnemies, wanderStep } from './enemies';
import { BOSS_ENEMY, FIELD_ENEMY } from './enemies.fixtures';
import {
  describeDungeonChanges,
  describeGenChanges,
  dungeonProblems,
  genProblems,
  parseDungeon,
  serializeDungeon,
  type DungeonFile,
  type EnemySettings,
  type GenSettings,
} from './genMaster';
import { generateFloor, type FloorMap, type Room } from './map';

// ダンジョンの設定ファイルの中身そのもの（書き出した文字列と比べる）
const RAW = import.meta.glob<string>('./dungeons/*.json', { eager: true, query: '?raw', import: 'default' });
// 敵を置くときに使う、道中の敵（どの敵でもよいので、データにいる敵から1つ選ぶ）
const POOL = [FIELD_ENEMY];

// 関数を確かめるための、決まった中身の設定（管理画面でダンジョンの設定を変えても、こちらは変わらない）
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

/** SAMPLE に名前・説明・出る敵を足した、ダンジョンの設定ファイル1つ分 */
const sampleDungeon = (): DungeonFile => {
  const one = { pool: [FIELD_ENEMY], boss: BOSS_ENEMY };
  return { name: 'テスト', description: '説明', ...clone(), encounters: { fire: one, ice: one, neutral: one, light: one, dark: one } };
};

describe('ダンジョンの設定ファイル（src/game/dungeons/）', () => {
  it('どのファイルも正しい形になっていて、書き出すと同じ中身になる', () => {
    expect(Object.keys(RAW).length).toBe(DUNGEON_IDS.length);
    for (const [path, text] of Object.entries(RAW)) {
      const id = path.replace(/^.*\//, '').replace(/\.json$/, '');
      expect(dungeonProblems(JSON.parse(text), ENEMY_MASTER)).toEqual([]);
      expect(serializeDungeon(dungeonOf(id))).toBe(text);
    }
  });

  it('標準のダンジョンがあり、一覧の先頭に並ぶ', () => {
    expect(DUNGEON_IDS[0]).toBe(DEFAULT_DUNGEON_ID);
    expect(DEFAULT_DUNGEON.name).toBeTruthy();
    expect(sortDungeonIds(['b_cave', DEFAULT_DUNGEON_ID, 'a_cave'])).toEqual([DEFAULT_DUNGEON_ID, 'a_cave', 'b_cave']);
  });

  it('名前・説明・ファイルの名前（ID）も確かめる', () => {
    const d = sampleDungeon();
    expect(dungeonProblems(d, ENEMY_MASTER)).toEqual([]);
    expect(dungeonProblems({ ...d, name: ' ' }, ENEMY_MASTER)).toEqual(['名前がない']);
    expect(dungeonProblems({ ...d, name: 'あ'.repeat(17) }, ENEMY_MASTER)).toEqual(['名前は16文字まで']);
    expect(dungeonProblems({ ...d, description: 'あ'.repeat(81) }, ENEMY_MASTER)).toEqual(['説明は80文字まで']);
    expect(dungeonProblems({ ...d, description: '' }, ENEMY_MASTER)).toEqual([]);
    expect(dungeonProblems({ ...d, encounters: undefined }, ENEMY_MASTER)).toEqual(['属性ごとに出る敵（encounters）がない']);
    expect(() => parseDungeon('good_id', d, ENEMY_MASTER)).not.toThrow();
    expect(() => parseDungeon('Bad-Id', d, ENEMY_MASTER)).toThrow();
    expect(() => parseDungeon('good_id', { ...d, name: '' }, ENEMY_MASTER)).toThrow();
  });

  it('書き出すときは、項目の並び順をそろえる（名前・説明が先、出る敵が最後）', () => {
    const d = sampleDungeon();
    const shuffled = { encounters: { dark: d.encounters.dark, ice: d.encounters.ice, fire: d.encounters.fire, light: d.encounters.light, neutral: d.encounters.neutral }, ...clone(), description: d.description, name: d.name };
    const text = serializeDungeon(shuffled as DungeonFile);
    expect(Object.keys(JSON.parse(text))).toEqual(['name', 'description', 'floors', 'rooms', 'enemies', 'growth', 'magic', 'spells', 'encounters']);
    expect(Object.keys(JSON.parse(text).encounters)).toEqual(['fire', 'ice', 'neutral', 'light', 'dark']);
    expect(text).toBe(serializeDungeon(d));
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('名前・説明・出る敵を変えたところも、日本語で説明する', () => {
    const after = sampleDungeon();
    after.name = '新しい名前';
    after.description = '新しい説明';
    after.floors.count = 4;
    after.encounters = { ...after.encounters, fire: { pool: [FIELD_ENEMY, FIELD_ENEMY], boss: BOSS_ENEMY } };
    const name = (id: string) => (id === FIELD_ENEMY ? '道中の敵' : id);
    expect(describeDungeonChanges(sampleDungeon(), after, name, () => true)).toEqual([
      '名前：テスト → 新しい名前',
      '説明を変更',
      '階の数：3 → 4',
      '炎の属性：道中の敵の出やすさ 1 → 2',
    ]);
  });
});

describe('マップと探索の設定', () => {
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
    expect(() => parseDungeon('test_id', { ...sampleDungeon(), ...bad }, ENEMY_MASTER)).toThrow();
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
      const { enemies } = spawnEnemies(map, POOL, 99, 0, 0.02, settings);
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
      const plain = spawnEnemies(map, POOL, 7, 0, 0.01, enemiesFor({})).enemies.length;
      const { enemies } = spawnEnemies(map, POOL, 7, 0, 0.01, enemiesFor({ nestChance: 1, nestMin: 3, nestMax: 3 }));
      const extra = enemies.length - plain;
      expect(extra).toBeGreaterThan(0);
      expect(extra).toBeLessThanOrEqual(map.rooms.length * 3);
      // 同じマスに2体いない
      expect(new Set(enemies.map((e) => `${e.pos.x},${e.pos.y}`)).size).toBe(enemies.length);
    }
  });

  it('部屋の敵を部屋から出さない設定では、気付くまで部屋の中だけを歩く', () => {
    const map = maps[0]!;
    const { enemies } = spawnEnemies(map, POOL, 3, 0, 0.03, enemiesFor({ roomWeight: 5, stayInRoom: true }));
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
