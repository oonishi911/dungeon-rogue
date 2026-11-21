// 鬼・光・闇の場面の部品（docs/memory-movie.md）
import { describe, expect, it } from 'vitest';
import { DARK_CONFIG, inkClouds, inkLook, nightMoteLook, smallLightPulse, stepNightMotes, stepWisps, wispLook, wispsFromBox } from './darkMovie';
import { LIGHT_CONFIG, moteLook, rayAlpha, rayShapes, stepMotes, type Mote } from './lightMovie';
import { OGRE_CHIEF } from './memoryMovie';
import { OGRE_CONFIG, barDepth, dustBurst, dustLook, stampCracks, stampsAt, stepDust, type Dust } from './ogreMovie';

const seq = (): (() => number) => {
  let n = 0;
  return () => ((n++ * 0.37) % 1);
};

describe('鬼：押しつぶす帯・打撃の跡・ほこり', () => {
  const ogre = OGRE_CHIEF;

  it('帯は、打撃の瞬間にぐっと迫り、すぐ戻る。いちばん深くても、決めた深さ（＋迫る分）まで', () => {
    const hit = ogre.hits[3]!;
    expect(barDepth(ogre, hit.at)).toBeGreaterThan(barDepth(ogre, hit.at - 0.01) + 0.02);
    expect(barDepth(ogre, hit.at + 1.5) - barDepth(ogre, hit.at - 0.01)).toBeLessThan(0.05);
    for (let t = 0; t < ogre.duration; t += 0.1) expect(barDepth(ogre, t)).toBeLessThanOrEqual(OGRE_CONFIG.bars.max + OGRE_CONFIG.bars.jolt * 1.31);
    expect(barDepth(ogre, ogre.duration)).toBeLessThan(0.01); // 膝をついたあと、帯は離れる
  });

  it('打撃の跡は、打撃の瞬間から広がり、決まった時間で消える。ひびの形は、跡ごとに決まっている', () => {
    const hit = ogre.hits[0]!;
    expect(stampsAt(ogre.hits, hit.at - 0.01).some((s) => s.index === 0)).toBe(false);
    const early = stampsAt(ogre.hits, hit.at + 0.05).find((s) => s.index === 0)!;
    const late = stampsAt(ogre.hits, hit.at + 1).find((s) => s.index === 0)!;
    expect(late.progress).toBeGreaterThan(early.progress);
    expect(late.alpha).toBeLessThan(early.alpha);
    expect(stampsAt(ogre.hits, hit.at + OGRE_CONFIG.stamp.life + 0.01).some((s) => s.index === 0)).toBe(false);
    expect(stampCracks(2)).toEqual(stampCracks(2));
    expect(stampCracks(2)).toHaveLength(OGRE_CONFIG.stamp.cracks);
  });

  it('ほこりは、上から落ち、画面の下を過ぎると消える。打撃で、ある点から舞い散る', () => {
    const rand = seq();
    let dust: Dust[] = [];
    for (let i = 0; i < 60; i++) dust = stepDust(dust, 1 / 30, 10, 400, 800, rand);
    expect(dust.length).toBeGreaterThan(5);
    expect(dust.every((d) => d.vy > 0)).toBe(true);
    const burst = dustBurst(0.5, 300, 12, rand);
    expect(burst).toHaveLength(12);
    expect(burst.every((d) => d.x === 0.5 && d.y === 300)).toBe(true);
    expect(stepDust([{ x: 0.5, y: 805, vx: 0, vy: 50, size: 1, age: 0.5, life: 3 }], 0.5, 0, 400, 800, rand)).toHaveLength(0);
    expect(dustLook({ x: 0, y: 0, vx: 0, vy: 1, size: 1, age: 0, life: 2 })).toBe(0);
  });
});

describe('光：光の筋・光の粒', () => {
  it('光の筋は、決まった本数が、真下を中心に左右へ広がる。強さ0なら見えない', () => {
    const rays = rayShapes();
    expect(rays).toHaveLength(LIGHT_CONFIG.rays.count);
    expect(rays).toEqual(rayShapes());
    expect(Math.min(...rays.map((r) => r.angle))).toBeLessThan(-0.3);
    expect(Math.max(...rays.map((r) => r.angle))).toBeGreaterThan(0.3);
    expect(rayAlpha(rays[0]!, 3, 0)).toBe(0);
    expect(rayAlpha(rays[0]!, 3, 1)).toBeGreaterThan(0.3);
  });

  it('光の粒は、ふだんは舞い上がり、光が崩れると（fall 1）落ちる', () => {
    const rand = seq();
    let motes: Mote[] = [];
    for (let i = 0; i < 30; i++) motes = stepMotes(motes, 1 / 30, 20, 0, 400, 800, rand);
    expect(motes.length).toBeGreaterThan(5);
    const m = motes[0]!;
    const [up] = stepMotes([m], 0.5, 0, 0, 400, 800, rand);
    expect(up!.y).toBeLessThan(m.y);
    let fallen = [m];
    for (let i = 0; i < 30; i++) fallen = stepMotes(fallen, 1 / 30, 0, 1, 400, 800, rand);
    expect(fallen[0]?.vy ?? 1).toBeGreaterThan(m.vy);
    expect(moteLook({ ...m, age: 0 }, 0)).toBe(0);
  });
});

describe('闇：墨の闇・小さな光・夜の粒・溶ける言葉のもや', () => {
  it('墨の闇は、迫る深さが0ならふちに留まり、深いほど内へ入る', () => {
    const cloud = { along: 0.1, size: 150, phase: 0, rate: 0.2 }; // 上のふちの、真ん中あたり
    const at0 = inkLook(cloud, 400, 800, 0, 2);
    const at1 = inkLook(cloud, 400, 800, 0.9, 2);
    const fromEdge = (p: { x: number; y: number }) => Math.min(p.x, 400 - p.x, p.y, 800 - p.y);
    expect(fromEdge(at0)).toBeLessThan(1);
    expect(fromEdge(at1)).toBeGreaterThan(fromEdge(at0) + 50);
    expect(at0.alpha).toBe(0);
    expect(inkClouds(seq())).toHaveLength(DARK_CONFIG.ink.clouds);
  });

  it('小さな光は、灯っていれば、ゆれても消えない', () => {
    for (let t = 0; t < 30; t += 0.05) expect(smallLightPulse(t, 0.5)).toBeGreaterThan(0.4);
    expect(smallLightPulse(3, 0)).toBe(0);
  });

  it('夜の粒は、そっと現れて消える。溶ける言葉のもやは、言葉の中から立ちのぼって広がる', () => {
    const rand = seq();
    const motes = stepNightMotes([], 1, 5, 400, 800, rand);
    expect(motes.length).toBeGreaterThan(0);
    expect(nightMoteLook({ ...motes[0]!, age: 0 }, 1)).toBeCloseTo(0);
    const wisps = wispsFromBox({ x0: 100, x1: 200, y0: 300, y1: 330 }, 10, rand);
    expect(wisps.every((p) => p.x >= 100 && p.x <= 200 && p.vy < 0)).toBe(true);
    const p = { ...wisps[0]!, age: 0.01 };
    const later = stepWisps([p], 0.5)[0]!;
    expect(later.y).toBeLessThan(p.y);
    expect(wispLook(later).size).toBeGreaterThan(wispLook(p).size);
    expect(wispLook({ ...p, age: -0.1 }).alpha).toBe(0);
  });
});
