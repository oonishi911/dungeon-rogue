// 記憶の「動く場面」の、時刻から決まる値（docs/memory-movie.md）
import { describe, expect, it } from 'vitest';
import { MEMORIES } from '../game/story';
import {
  MOVIE_CONFIG,
  MOVIES,
  ashLook,
  burnEmbers,
  burnLightAt,
  burnProgress,
  burstEmbers,
  driftAt,
  emberLook,
  encloseAt,
  fireAt,
  flameLook,
  flashAt,
  flickerAt,
  glowAt,
  heartTimes,
  isWorldSound,
  itemTimes,
  kicksOf,
  muffleAt,
  muffleCurve,
  pulseAt,
  punchAt,
  quakeAt,
  ringsAt,
  slashTimes,
  smokeLook,
  soundCues,
  stepAsh,
  stepEmbers,
  stepFlames,
  stepSmoke,
  valueAt,
  writeSeconds,
  type Ember,
  type Flake,
  type Write,
} from './memoryMovie';
import { SCRAWL_CONFIG, scrawl } from './scrawl';

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
      for (const keys of [m.glow, m.embers, m.fire, m.smoke, m.ash, m.enclose, m.muffle]) expect(keys.every((k, i) => i === 0 || k[0] >= keys[i - 1]![0])).toBe(true);
      // 言葉は、取り消し線と赤い線のあとに燃え始め、倒したボスの一文が出る前に燃え尽きる
      expect(m.burnAt).toBeGreaterThan(slashTimes(m)[slashTimes(m).length - 1]!);
      expect(m.burnAt + m.burnFor).toBeLessThanOrEqual(m.echoAt);
      expect(m.enclose.every(([, v]) => v >= 0 && v <= 1)).toBe(true);
      expect(m.muffle.every(([, v]) => v >= 20 && v <= MOVIE_CONFIG.muffleOpen.max)).toBe(true);
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

  it('心音は heart のあいだだけ、だんだん速く、強く。「やめて」を書く前に止む。書く音・取り消し線の音は鳴らさない', () => {
    const [from, to] = flame.heart!;
    const beats = cues.filter((c) => c.kind === 'heartbeat');
    expect(beats.length).toBeGreaterThan(5);
    expect(beats.every((c) => c.at >= from && c.at < to)).toBe(true);
    expect(beats[beats.length - 1]!.at).toBeLessThan(flame.crossedAt);
    const gaps = beats.slice(1).map((b, i) => b.at - beats[i]!.at);
    expect(gaps[gaps.length - 1]!).toBeLessThan(gaps[0]!);
    expect(beats[beats.length - 1]!.power).toBeGreaterThan(beats[0]!.power);
    expect(beats.map((c) => [c.at, c.power])).toEqual(heartTimes(flame).map((b) => [b.at, b.power]));
    expect(cues.map((c) => c.kind as string)).not.toContain('scratch');
    expect(cues.map((c) => c.kind as string)).not.toContain('strike');
  });

  it('最後に、静かな響きと和音。そのあとは、そっと続くチリチリだけ', () => {
    const hush = cues.find((c) => c.kind === 'hush')!;
    const pad = cues.find((c) => c.kind === 'pad')!;
    expect(hush.at).toBe(flame.echoAt);
    expect(pad.at).toBe(flame.echoAt);
    expect(pad.power).toBeGreaterThan(flame.duration - flame.echoAt);
    expect(cues.filter((c) => c.at > flame.echoAt).every((c) => c.kind === 'sizzle_soft')).toBe(true);
  });

  it('息をひそめると、はっと息をのみ、終わりに震えて吐く。耳鳴りは ring のあいだ', () => {
    const [from, to] = flame.breath!;
    const gasp = cues.find((c) => c.kind === 'breath_in')!;
    const out = cues.find((c) => c.kind === 'breath_out')!;
    expect(gasp.at).toBeGreaterThanOrEqual(from);
    expect(gasp.at).toBeLessThan(from + 0.3);
    expect(out.at).toBeGreaterThan(gasp.at);
    expect(out.at).toBeLessThan(to);
    const ring = cues.find((c) => c.kind === 'ring')!;
    expect(ring.at).toBe(flame.ring![0]);
    expect(ring.at + ring.power).toBeCloseTo(flame.ring![1]);
  });

  it('最初の声の前に、吸い込むような高まりがあり、声の直前に終わる。炎の音は、いまに戻るまで続く', () => {
    const swell = cues.find((c) => c.kind === 'swell')!;
    const first = flame.hits[0]!.at;
    expect(swell.at + swell.power).toBeLessThan(first);
    expect(swell.at + swell.power).toBeGreaterThan(first - 0.15);
    const blaze = cues.find((c) => c.kind === 'blaze')!;
    expect(blaze.at).toBeLessThan(0.5);
    expect(blaze.at + blaze.power).toBeGreaterThan(flame.echoAt);
    expect(blaze.at + blaze.power).toBeLessThan(flame.echoAt + 1.5);
  });

  it('外の音（こもる音）は、声・地鳴り・炎の音・高まりだけ。心音・書く音・燃える音・和音は、こもらない', () => {
    for (const k of ['roar', 'rumble', 'blaze', 'swell'] as const) expect(isWorldSound(k)).toBe(true);
    for (const k of ['heartbeat', 'chalk', 'chalk_bold', 'slash', 'sizzle', 'ignite', 'pad', 'ring', 'breath_in'] as const) expect(isWorldSound(k)).toBe(false);
  });

  it('地鳴りは、場面のはじめから息をひそめる前まで', () => {
    const rumble = cues.find((c) => c.kind === 'rumble')!;
    expect(rumble.at).toBeLessThan(1);
    expect(rumble.at + rumble.power).toBeCloseTo(flame.breath![0]);
  });


  it('紙が燃えるようなチリチリは、声のあいだ・息をひそめるあいだ（小さく）・言葉が燃えるとき（火がつく音と一緒に）・最後（小さく）に鳴り、場面の長さを超えない', () => {
    const burns = cues.filter((c) => c.kind === 'sizzle' || c.kind === 'sizzle_soft');
    expect(burns.map((c) => c.kind)).toEqual(['sizzle', 'sizzle_soft', 'sizzle', 'sizzle_soft']);
    expect(burns[0]!.at).toBeLessThanOrEqual(flame.lineAt[0]!);
    expect(burns[1]!.at).toBe(flame.breath![0]);
    expect(burns[2]!.at).toBe(flame.burnAt);
    expect(cues.find((c) => c.kind === 'ignite')!.at).toBe(flame.burnAt);
    // 「やめて」を書いてから燃えるまでは、チリチリが止む（静かになる）
    expect(burns[1]!.at + burns[1]!.power).toBeCloseTo(flame.crossedAt);
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

  it('赤い線が出るたびに、切り裂く音が鳴る：取り消し線の瞬間から、線の間隔で、線の数だけ', () => {
    const slashes = cues.filter((c) => c.kind === 'slash');
    expect(slashes).toHaveLength(SCRAWL_CONFIG.scratches);
    expect(MOVIE_CONFIG.slash.pitch).toHaveLength(SCRAWL_CONFIG.scratches);
    slashes.forEach((c, k) => expect(c.at).toBeCloseTo(flame.crossedAt + MOVIE_CONFIG.strikeDelay + k * MOVIE_CONFIG.slash.every));
    expect(slashes.map((c) => c.at)).toEqual(slashTimes(flame));
    expect(slashes[slashes.length - 1]!.at).toBeLessThan(flame.duration);
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

describe('場面の流れ（光・炎・闇・音のこもり方）', () => {
  it('炎の光のゆらめきは、1の前後の決まった幅に収まり、同じ時刻なら同じ値', () => {
    for (let t = 0; t < 30; t += 0.07) {
      expect(flickerAt(t)).toBeGreaterThanOrEqual(1 - MOVIE_CONFIG.flicker - 1e-9);
      expect(flickerAt(t)).toBeLessThanOrEqual(1 + MOVIE_CONFIG.flicker + 1e-9);
    }
    expect(flickerAt(3.3)).toBe(flickerAt(3.3));
  });

  it('カメラは、場面を通してゆっくり寄り（戻らない）、揺れは小さい', () => {
    let prev = 0;
    for (let t = 0; t <= flame.duration + 3; t += 0.5) {
      const d = driftAt(t, flame.duration);
      expect(d.scale).toBeGreaterThanOrEqual(prev);
      expect(Math.abs(d.x)).toBeLessThanOrEqual(MOVIE_CONFIG.drift.sway[0]);
      prev = d.scale;
    }
    expect(driftAt(0, flame.duration).scale).toBe(1);
    expect(driftAt(flame.duration, flame.duration).scale).toBeCloseTo(1 + MOVIE_CONFIG.drift.zoom);
  });

  it('炎は、声の瞬間に燃え上がり、「やめて」の前には、ほとんど消える', () => {
    const hit = flame.hits[2]!;
    expect(fireAt(flame, hit.at)).toBeGreaterThan(fireAt(flame, hit.at - 0.05) + 0.5);
    expect(fireAt(flame, flame.crossedAt + 0.5)).toBeLessThan(0.1);
    expect(fireAt(flame, 0)).toBe(0);
  });

  it('言葉が燃える明るさ：燃え始めにすぐ明るくなり、燃え尽きると収まる。後ろの光も明るくなる', () => {
    expect(burnLightAt(flame, flame.burnAt - 0.1)).toBe(0);
    expect(burnLightAt(flame, flame.burnAt + 0.5)).toBe(1);
    expect(burnLightAt(flame, flame.burnAt + flame.burnFor + 3)).toBeLessThan(0.05);
    expect(glowAt(flame, flame.burnAt + 0.5)).toBeGreaterThan(valueAt(flame.glow, flame.burnAt + 0.5));
    expect(burnProgress(flame, flame.burnAt - 1)).toBe(0);
    expect(burnProgress(flame, flame.burnAt + flame.burnFor / 2)).toBeCloseTo(0.5);
    expect(burnProgress(flame, flame.burnAt + flame.burnFor + 1)).toBe(1);
  });

  it('心音の脈：拍の瞬間に強く、2拍目でもう一度。拍のないときは0', () => {
    const beats = heartTimes(flame);
    const b = beats[3]!;
    expect(pulseAt(beats, b.at)).toBeGreaterThan(pulseAt(beats, b.at + 0.18));
    expect(pulseAt(beats, b.at + MOVIE_CONFIG.heart.dub)).toBeGreaterThan(pulseAt(beats, b.at + MOVIE_CONFIG.heart.dub - 0.02));
    expect(pulseAt(beats, 2)).toBe(0);
  });

  it('闇は、息をひそめると迫り（布団の中）、声のあいだは無い。心音の脈で、少し深くなる。0〜1に収まる', () => {
    const beats = heartTimes(flame);
    expect(encloseAt(flame, beats, 3)).toBe(0);
    expect(encloseAt(flame, beats, 8.5)).toBeGreaterThan(0.6);
    const b = beats[2]!;
    expect(encloseAt(flame, beats, b.at)).toBeGreaterThan(valueAt(flame.enclose, b.at));
    for (let t = 0; t < flame.duration; t += 0.1) {
      expect(encloseAt(flame, beats, t)).toBeGreaterThanOrEqual(0);
      expect(encloseAt(flame, beats, t)).toBeLessThanOrEqual(1);
    }
  });

  it('外の音は、息をひそめるとこもり、こもった中に声が響くと、その瞬間だけ開く（耳をふさいでも、声は入ってくる）', () => {
    const calm = flame.breath![0];
    expect(muffleAt(flame, 2)).toBe(MOVIE_CONFIG.muffleOpen.max);
    expect(muffleAt(flame, 8)).toBeLessThan(1000);
    const late = flame.hits.find((h) => h.at > calm)!;
    expect(muffleAt(flame, late.at)).toBeGreaterThan(muffleAt(flame, late.at - 0.05) * 2);
    expect(muffleAt(flame, flame.crossedAt + 0.5)).toBeLessThan(400); // 「やめて」のあいだは、外がほとんど聞こえない
    expect(muffleAt(flame, flame.duration)).toBe(MOVIE_CONFIG.muffleOpen.max); // いまに戻ると、こもりが消える
    const curve = muffleCurve(flame, 40);
    expect(curve.length).toBe(Math.ceil((flame.duration + 4) * 40) + 1);
    expect(curve[Math.round(8 * 40)]).toBeCloseTo(muffleAt(flame, 8));
  });

  it('声の波：声の瞬間から広がり、広がるほど薄く、決まった時間で消える', () => {
    const hit = flame.hits[0]!;
    expect(ringsAt(flame.hits, hit.at - 0.01)).toHaveLength(0);
    const [early] = ringsAt(flame.hits, hit.at + 0.1);
    const [late] = ringsAt(flame.hits, hit.at + 0.7);
    expect(late!.progress).toBeGreaterThan(early!.progress);
    expect(late!.alpha).toBeLessThan(early!.alpha);
    expect(ringsAt(flame.hits, hit.at + MOVIE_CONFIG.ring.life + 0.01)).toHaveLength(0);
  });

  it('赤い線と、燃え上がる瞬間に、小さな揺れ（声より弱い）', () => {
    const kicks = kicksOf(flame);
    expect(kicks).toHaveLength(slashTimes(flame).length + 1);
    expect(kicks.every((k) => k.power < Math.min(...flame.hits.map((h) => h.power)))).toBe(true);
    expect(kicks.some((k) => k.at === flame.burnAt)).toBe(true);
  });
});

describe('炎・煙・灰の粒', () => {
  const seq = (): (() => number) => {
    let n = 0;
    return () => ((n++ * 0.37) % 1);
  };

  it('炎は、勢いに応じて増え、上限を超えず、勢い0なら消えていく。縦長で、上るほど冷めて薄れる', () => {
    const rand = seq();
    let flames = stepFlames([], 0, 0, 0, rand);
    for (let i = 0; i < 60; i++) flames = stepFlames(flames, 1 / 60, 150, 1, rand);
    expect(flames.length).toBeGreaterThan(40);
    let many = flames;
    for (let i = 0; i < 60; i++) many = stepFlames(many, 1 / 60, 99999, 2, rand, 50);
    expect(many.length).toBeLessThanOrEqual(50);
    for (let i = 0; i < 120; i++) flames = stepFlames(flames, 1 / 60, 0, 0, rand);
    expect(flames).toHaveLength(0);
    const f = { x: 0.5, y: 0, vy: 100, phase: 0, age: 0.1, life: 1, size: 50 };
    const young = flameLook(f);
    const old = flameLook({ ...f, age: 0.9 });
    expect(young.height).toBeGreaterThan(young.width);
    expect(old.heat).toBeGreaterThan(young.heat);
    expect(old.alpha).toBeLessThan(young.alpha);
    expect(old.width).toBeLessThan(young.width);
  });

  it('煙は、ゆっくり上り、広がり、出てすぐと消える前は薄い', () => {
    const rand = seq();
    let smoke = stepSmoke([], 0, 0, rand);
    for (let i = 0; i < 120; i++) smoke = stepSmoke(smoke, 1 / 30, 3, rand);
    expect(smoke.length).toBeGreaterThan(5);
    expect(smoke.length).toBeLessThanOrEqual(MOVIE_CONFIG.smoke.max);
    const p = smoke[0]!;
    expect(smokeLook({ ...p, age: p.life * 0.9 }).size).toBeGreaterThan(smokeLook({ ...p, age: p.life * 0.1 }).size);
    expect(smokeLook({ ...p, age: 0 }).alpha).toBeCloseTo(0);
    expect(smokeLook({ ...p, age: p.life / 2 }).alpha).toBeCloseTo(MOVIE_CONFIG.smoke.alpha);
  });

  it('灰は、上から落ち、画面の下を過ぎると消える。上限を超えない', () => {
    const rand = seq();
    let ash: Flake[] = [];
    for (let i = 0; i < 60; i++) ash = stepAsh(ash, 1 / 30, 9, 800, rand);
    expect(ash.length).toBeGreaterThan(5);
    expect(ash.every((f) => f.vy > 0)).toBe(true);
    const fallen = stepAsh([{ x: 0.5, y: 805, vy: 40, phase: 0, age: 1, life: 10, size: 2 }], 0.5, 0, 800, rand);
    expect(fallen).toHaveLength(0);
    let many: Flake[] = [];
    for (let i = 0; i < 100; i++) many = stepAsh(many, 0.1, 9999, 800, rand);
    expect(many.length).toBeLessThanOrEqual(MOVIE_CONFIG.ash.max);
    expect(ashLook({ x: 0, y: 0, vy: 1, phase: 0, age: 0, life: 5, size: 2 }).alpha).toBe(0);
  });

  it('燃える言葉から上る火の粉は、燃えている縁から出る', () => {
    const embers: Ember[] = burnEmbers({ x0: 0.2, x1: 0.4, y: 300 }, 12, seq());
    expect(embers).toHaveLength(12);
    expect(embers.every((e) => e.x >= 0.2 && e.x <= 0.4 && e.y === 300 && e.vy > 0)).toBe(true);
  });
});
