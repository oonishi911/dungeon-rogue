// 氷の場面（記憶の動く場面）の部品：雪・白い息・氷の欠片・霜の模様・呼ぶ声の波（docs/memory-movie.md）
import { describe, expect, it } from 'vitest';
import { ICE_CONFIG, frostBranches, mistLook, mistPuff, ripplesAt, shardLook, shardsFromBox, shardsFromEdges, snowLook, stepMist, stepShards, stepSnow, type Snowflake } from './iceMovie';

const seq = (): (() => number) => {
  let n = 0;
  return () => ((n++ * 0.37) % 1);
};

describe('雪', () => {
  it('勢いに応じて降り始め、画面の下を過ぎると消える。上限を超えない', () => {
    const rand = seq();
    let snow: Snowflake[] = [];
    for (let i = 0; i < 60; i++) snow = stepSnow(snow, 1 / 30, 20, 1, 800, rand);
    expect(snow.length).toBeGreaterThan(20);
    const fallen = stepSnow([{ x: 0.5, y: 805, vy: 50, size: 2, phase: 0, drift: 1 }], 0.5, 0, 1, 800, rand);
    expect(fallen).toHaveLength(0);
    let many: Snowflake[] = [];
    for (let i = 0; i < 100; i++) many = stepSnow(many, 0.1, 9999, 0, 800, rand);
    expect(many.length).toBeLessThanOrEqual(ICE_CONFIG.snow.max);
  });

  it('大きな粒（手前）ほど速く落ちる', () => {
    const rand = seq();
    let snow: Snowflake[] = [];
    for (let i = 0; i < 30; i++) snow = stepSnow(snow, 1 / 30, 30, 1, 800, rand);
    const big = snow.filter((f) => f.size > 2.6);
    const small = snow.filter((f) => f.size < 1.2);
    const avg = (xs: Snowflake[]) => xs.reduce((s, f) => s + f.vy, 0) / xs.length;
    expect(avg(big)).toBeGreaterThan(avg(small));
  });

  it('凍ると（速さ0）、宙で止まる（位置も揺れも進まない）。止まっているときだけ、きらりと光る', () => {
    const f: Snowflake = { x: 0.3, y: 200, vy: 40, size: 2, phase: 1, drift: 3 };
    const [still] = stepSnow([f], 0.5, 0, 0, 800, seq());
    expect(still!.y).toBe(200);
    expect(still!.drift).toBe(3);
    const [moving] = stepSnow([f], 0.5, 0, 1, 800, seq());
    expect(moving!.y).toBeCloseTo(220);
    let glints = 0;
    for (let t = 0; t < 4; t += 0.05) {
      expect(snowLook(f, t, 1).glint).toBe(0);
      glints = Math.max(glints, snowLook(f, t, 0).glint);
    }
    expect(glints).toBeGreaterThan(0.5);
  });
});

describe('白い息', () => {
  it('1回の息で、下の真ん中から、いくつかのもやが出て、上りながら広がり、消える', () => {
    const puff = mistPuff(seq());
    expect(puff).toHaveLength(ICE_CONFIG.mist.count);
    expect(puff.every((m) => Math.abs(m.x - 0.5) < 0.1 && m.vy > 0)).toBe(true);
    const m = { ...puff[0]!, age: 0.01 };
    const later = stepMist([m], 0.8, 400)[0]!;
    expect(later.y).toBeGreaterThan(m.y);
    expect(mistLook(later).size).toBeGreaterThan(mistLook(m).size);
    expect(mistLook({ ...m, age: -0.1 }).alpha).toBe(0); // まだ出ていない
    expect(stepMist([m], m.life + 1, 400)).toHaveLength(0);
  });
});

describe('氷の欠片', () => {
  it('言葉の四角の中から出て、重さで落ち、寿命で消える', () => {
    const box = { x0: 100, x1: 200, y0: 300, y1: 330 };
    const shards = shardsFromBox(box, 20, seq());
    expect(shards).toHaveLength(20);
    expect(shards.every((s) => s.x >= 100 && s.x <= 200 && s.y >= 300 && s.y <= 330)).toBe(true);
    const s = shards[0]!;
    const later = stepShards([s], 0.3)[0]!;
    expect(later.vy).toBeGreaterThan(s.vy); // 下へ引かれる
    expect(stepShards([s], s.life + 0.1)).toHaveLength(0);
    expect(shardLook({ ...s, age: s.life * 0.9 }).alpha).toBeLessThan(shardLook(s).alpha);
    expect(s.corners.length).toBeGreaterThanOrEqual(3);
  });

  it('氷の巨像が砕けると、画面のふちから、大きめの欠片が出る', () => {
    const shards = shardsFromEdges(400, 800, 40, seq());
    expect(shards).toHaveLength(40);
    for (const s of shards) {
      const onEdge = s.x === 0 || s.x === 400 || s.y === 0 || Math.abs(s.y - 720) < 1e-9;
      expect(onEdge).toBe(true);
    }
  });
});

describe('霜の模様', () => {
  it('四方のふちから内へ伸びる。同じ乱数なら同じ模様。脇枝がある', () => {
    const a = frostBranches(400, 800, seq());
    const b = frostBranches(400, 800, seq());
    expect(a).toEqual(b);
    const mains = a.filter((x) => x.width > 1);
    expect(mains.length).toBe(Math.round(((2 * (400 + 800)) / 1000) * ICE_CONFIG.frost.branchesPer1000));
    expect(a.length).toBeGreaterThan(mains.length * 2); // 脇枝
    for (const m of mains) {
      const [x, y] = m.points[0]!;
      expect(x === 0 || x === 400 || y === 0 || y === 800).toBe(true);
      // 幹は、真ん中の文字のあたりまでは届かない
      const reach = Math.max(...m.points.map(([px, py]) => Math.min(px, 400 - px, py, 800 - py)));
      expect(reach).toBeLessThan(ICE_CONFIG.frost.length[1] + 1);
    }
  });
});

describe('呼ぶ声の波', () => {
  it('声の瞬間から広がり、広がるほど薄く、決まった時間で消える。弱い声ほど薄い', () => {
    const hits = [
      { at: 1, power: 1 },
      { at: 5, power: 0.5 },
    ];
    expect(ripplesAt(hits, 0.9)).toHaveLength(0);
    const [early] = ripplesAt(hits, 1.2);
    const [late] = ripplesAt(hits, 2.2);
    expect(late!.progress).toBeGreaterThan(early!.progress);
    expect(late!.alpha).toBeLessThan(early!.alpha);
    expect(ripplesAt(hits, 1 + ICE_CONFIG.ripple.life + 0.01)).toHaveLength(0);
    expect(ripplesAt(hits, 5.2)[0]!.alpha).toBeLessThan(early!.alpha);
  });
});
