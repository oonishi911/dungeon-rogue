// 記憶の「動く場面」の、時刻から決まる値（docs/memory-movie.md）
import { describe, expect, it } from 'vitest';
import { MEMORIES } from '../game/story';
import { MOVIE_CONFIG, MOVIES, burstEmbers, emberLook, flashAt, glowAt, itemTimes, punchAt, quakeAt, soundCues, stepEmbers, valueAt, writeSeconds, type Ember, type Write } from './memoryMovie';
import { scrawl } from './scrawl';

const flame = MOVIES.flame_beast!;

describe('動く場面の設定', () => {
  it('どの場面も、記憶のあるボスのもの。行の数と、時刻の並びが合っている', () => {
    for (const [boss, m] of Object.entries(MOVIES)) {
      const memory = MEMORIES[boss]!;
      expect(memory).toBeDefined();
      expect(m.lineAt.length).toBe(memory.lines.length);
      expect([...m.lineAt].sort((a, b) => a - b)).toEqual([...m.lineAt]);
      expect(m.loud.every((i) => i >= 0 && i < memory.lines.length)).toBe(true);
      expect(m.crossedAt).toBeGreaterThan(m.lineAt[0]!);
      expect(m.echoAt).toBeGreaterThan(m.crossedAt);
      expect(m.echoAt).toBeLessThan(m.duration);
      for (const h of m.hits) expect(h.at).toBeLessThan(m.duration);
      for (const keys of [m.glow, m.embers]) expect(keys.every((k, i) => i === 0 || k[0] >= keys[i - 1]![0])).toBe(true);
    }
  });

  it('文字の絵の出る時刻：行は決めた時刻、書いては消した言葉は crossedAt、帯は直前から遅れて出る', () => {
    const memory = MEMORIES.flame_beast!;
    const items = scrawl(memory.lines, memory.crossed, 'flame_beast');
    const times = itemTimes(items.map((i) => i.kind), flame);
    expect(times).toHaveLength(items.length);
    let line = 0;
    items.forEach((item, i) => {
      if (item.kind === 'line') expect(times[i]).toBe(flame.lineAt[line++]);
      if (item.kind === 'crossed') expect(times[i]).toBe(flame.crossedAt);
      if (item.kind === 'black') expect(times[i]).toBeCloseTo(times[i - 1]! + flame.blackDelay);
    });
    expect(line).toBe(memory.lines.length);
  });
});

describe('時刻から決まる値', () => {
  it('valueAt：間は直線、前後は端の値', () => {
    const keys = [[1, 10], [3, 30]] as const;
    expect(valueAt(keys, 0)).toBe(10);
    expect(valueAt(keys, 2)).toBe(20);
    expect(valueAt(keys, 9)).toBe(30);
  });

  it('揺れ：大きな声の瞬間に大きく、減っていき、声のないときは揺れない（同じ時刻なら同じ値）', () => {
    const hit = flame.hits[0]!;
    const mag = (t: number) => {
      const q = quakeAt(flame.hits, t);
      return Math.hypot(q.x, q.y);
    };
    expect(mag(0.5)).toBe(0);
    expect(mag(hit.at + 0.03)).toBeGreaterThan(mag(hit.at + 0.9));
    expect(mag(hit.at + 0.03)).toBeGreaterThan(1);
    expect(mag(hit.at + 0.03)).toBeLessThan(MOVIE_CONFIG.quake.amp * 4);
    expect(quakeAt(flame.hits, 2.2)).toEqual(quakeAt(flame.hits, 2.2));
    expect(mag(flame.duration)).toBe(0);
  });

  it('フラッシュ：声の瞬間に最大で、すぐ消える', () => {
    const hit = flame.hits[2]!; // 最も強い声
    expect(flashAt(flame.hits, hit.at)).toBeCloseTo(MOVIE_CONFIG.flash.peak * hit.power);
    expect(flashAt(flame.hits, hit.at + 2)).toBeLessThan(0.01);
    expect(flashAt(flame.hits, 0)).toBe(0);
  });

  it('光：息をひそめる場面だけ脈打つ。それ以外は、設定の値のとおり', () => {
    const [from, to] = flame.breath!;
    expect(glowAt(flame, 0.5)).toBe(valueAt(flame.glow, 0.5));
    expect(glowAt(flame, to + 1)).toBe(valueAt(flame.glow, to + 1));
    const seen = new Set<number>();
    for (let t = from; t <= to; t += 0.4) seen.add(Math.round(glowAt(flame, t) * 1000) / (valueAt(flame.glow, t) || 1));
    expect(seen.size).toBeGreaterThan(3);
    for (let t = from; t <= to; t += 0.2) expect(glowAt(flame, t)).toBeGreaterThanOrEqual(0);
  });
});

describe('火の粉', () => {
  const seq = (): (() => number) => {
    let n = 0;
    return () => ((n++ * 0.37) % 1);
  };

  it('勢いに応じて増え、寿命が来ると消える。上限を超えない', () => {
    let embers: Ember[] = [];
    const rand = seq();
    for (let i = 0; i < 60; i++) embers = stepEmbers(embers, 1 / 30, 30, rand); // 2秒、毎秒30
    expect(embers.length).toBeGreaterThan(20);
    expect(embers.length).toBeLessThanOrEqual(MOVIE_CONFIG.ember.max);
    for (let i = 0; i < 300; i++) embers = stepEmbers(embers, 1 / 30, 0, rand); // 勢い0で10秒
    expect(embers).toHaveLength(0);
    let many: Ember[] = [];
    for (let i = 0; i < 100; i++) many = stepEmbers(many, 0.1, 9999, rand);
    expect(many.length).toBeLessThanOrEqual(MOVIE_CONFIG.ember.max);
  });

  it('上へ進み、出てすぐ明るく、寿命に向けて消える', () => {
    const [e] = stepEmbers([], 1, 1, () => 0.5);
    const born = e ?? { x: 0.5, y: 0, vy: 80, phase: 0, age: 0, life: 2.5, size: 2 };
    expect(born.vy).toBeGreaterThan(0);
    expect(emberLook({ ...born, age: 0 }).alpha).toBe(0);
    expect(emberLook({ ...born, age: born.life * 0.3 }).alpha).toBeGreaterThan(emberLook({ ...born, age: born.life * 0.95 }).alpha);
  });
});

describe('迫力（拡大・噴き上がる火の粉）', () => {
  it('声の瞬間に画面が迫り（強いほど大きく）、すぐ1に戻る', () => {
    const [weak, , strong] = [flame.hits[3]!, flame.hits[1]!, flame.hits[2]!];
    expect(punchAt(flame.hits, 0)).toBe(1);
    expect(punchAt(flame.hits, strong.at)).toBeGreaterThan(punchAt(flame.hits, weak.at));
    expect(punchAt(flame.hits, strong.at)).toBeCloseTo(1 + MOVIE_CONFIG.punch.scale * strong.power);
    expect(punchAt(flame.hits, strong.at + 2) - 1).toBeLessThan(0.005);
  });

  it('声が強いほど、噴き上がる火の粉が多い。下から出て、上へ進む', () => {
    let n = 0;
    const rand = () => (n++ * 0.37) % 1;
    const strong = burstEmbers(1.2, rand);
    const weak = burstEmbers(0.45, rand);
    expect(strong.length).toBeGreaterThan(weak.length);
    expect(strong.every((e) => e.vy > 0 && e.y < 0 && e.age === 0)).toBe(true);
  });
});

const memoryFlame = MEMORIES.flame_beast!;
const flameItems = scrawl(memoryFlame.lines, memoryFlame.crossed, 'flame_beast');
const flameWrites: Write[] = flameItems.map((i) => ({ kind: i.kind, chars: i.kind === 'black' ? 0 : i.glyphs.length }));

describe('音の予定', () => {
  const cues = soundCues(flame, flameWrites);

  it('時刻の順で、場面の長さの中に収まる', () => {
    expect(cues.every((c, i) => i === 0 || c.at >= cues[i - 1]!.at)).toBe(true);
    expect(cues.every((c) => c.at >= 0 && c.at < flame.duration)).toBe(true);
  });

  it('声の数だけ roar が、声と同じ時刻に、同じ強さで鳴る', () => {
    const roars = cues.filter((c) => c.kind === 'roar');
    expect(roars.map((c) => [c.at, c.power])).toEqual(flame.hits.map((h) => [h.at, h.power]));
  });

  it('心音は、息をひそめるあいだだけ。最後に静かな響き。書く音・取り消し線の音は鳴らさない', () => {
    const [from, to] = flame.breath!;
    const beats = cues.filter((c) => c.kind === 'heartbeat');
    expect(beats.length).toBeGreaterThan(2);
    expect(beats.every((c) => c.at >= from && c.at <= to)).toBe(true);
    expect(cues.map((c) => c.kind as string)).not.toContain('scratch');
    expect(cues.map((c) => c.kind as string)).not.toContain('strike');
    const hush = cues.find((c) => c.kind === 'hush')!;
    expect(hush.at).toBe(flame.echoAt);
    expect(cues.filter((c) => c.at > hush.at).every((c) => c.kind === 'sizzle_soft')).toBe(true);
  });

  it('地鳴りは、場面のはじめから息をひそめる前まで', () => {
    const rumble = cues.find((c) => c.kind === 'rumble')!;
    expect(rumble.at).toBeLessThan(1);
    expect(rumble.at + rumble.power).toBeCloseTo(flame.breath![0]);
  });


  it('紙が燃えるようなチリチリは、声のあいだ・息をひそめるあいだ（小さく）・「やめて」が燃えるとき・最後（小さく）に鳴り、場面の長さを超えない', () => {
    const burns = cues.filter((c) => c.kind === 'sizzle' || c.kind === 'sizzle_soft');
    expect(burns.map((c) => c.kind)).toEqual(['sizzle', 'sizzle_soft', 'sizzle', 'sizzle_soft']);
    expect(burns[0]!.at).toBeLessThanOrEqual(flame.lineAt[0]!);
    expect(burns[1]!.at).toBe(flame.breath![0]);
    expect(burns[2]!.at).toBe(flame.crossedAt);
    for (const b of burns) {
      expect(b.power).toBeGreaterThan(0);
      expect(b.at + b.power).toBeLessThanOrEqual(flame.duration + 1e-9);
    }
  });

  it('文字が書かれていくあいだ、チョークの音が鳴る：出る時刻と同じ時刻に、書かれる長さのあいだ。声の行と塗りつぶしは強く', () => {
    const times = itemTimes(flameWrites.map((w) => w.kind), flame);
    const chalk = cues.filter((c) => c.kind === 'chalk' || c.kind === 'chalk_bold');
    flameWrites.forEach((w, i) => {
      const lag = w.kind === 'black' ? 0 : MOVIE_CONFIG.write.soundLag;
      const trim = w.kind === 'black' ? 0 : MOVIE_CONFIG.write.soundTrim;
      const cue = chalk.find((c) => Math.abs(c.at - (times[i]! + lag)) < 1e-9 && Math.abs(c.power - Math.max(0.3, writeSeconds(w) - trim)) < 1e-9);
      expect(cue).toBeDefined();
      if (w.kind === 'black') expect(cue!.kind).toBe('chalk_bold');
    });
    const lag = MOVIE_CONFIG.write.soundLag;
    expect(chalk.find((c) => Math.abs(c.at - (flame.lineAt[0]! + lag)) < 1e-9)!.kind).toBe('chalk_bold'); // 声の行
    expect(chalk.find((c) => Math.abs(c.at - (flame.lineAt[1]! + lag)) < 1e-9)!.kind).toBe('chalk');
    // 取り消し線を引く音：書いたあと、strikeDelay 後に強く
    expect(chalk.some((c) => Math.abs(c.at - (flame.crossedAt + MOVIE_CONFIG.strikeDelay)) < 1e-9 && c.kind === 'chalk_bold')).toBe(true);
  });

  it('書かれる長さは、文字数に比例し、範囲に収まる。塗りつぶしは決まった長さ', () => {
    const w = MOVIE_CONFIG.write;
    expect(writeSeconds({ kind: 'line', chars: 1 })).toBe(w.min);
    expect(writeSeconds({ kind: 'line', chars: 500 })).toBe(w.max);
    expect(writeSeconds({ kind: 'line', chars: 20 })).toBeCloseTo(20 * w.perChar);
    expect(writeSeconds({ kind: 'black', chars: 0 })).toBe(w.black);
    expect(writeSeconds({ kind: 'crossed', chars: 3 })).toBeCloseTo(Math.max(w.crossedMin, 3 * w.crossedPerChar));
    // どの文字の絵も、場面が終わるまでに書き終わる
    const times = itemTimes(flameWrites.map((x) => x.kind), flame);
    flameWrites.forEach((x, i) => expect(times[i]! + writeSeconds(x)).toBeLessThan(flame.duration));
  });
});
