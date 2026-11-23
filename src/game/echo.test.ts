// 残響と刻印武器（docs/echo-spec.md）：設定の確かめ・効果・落とし物・持ち物の扱い・セーブと中断データ・探索への組み込み
import { describe, expect, it } from 'vitest';
import { autoPlay } from './autoplay';
import { buildPlayer, enchantMultiplier, playerHitDamage } from './combat';
import { ECHO_MASTER, ENEMIES } from './data';
import { bodyDamageRate, echoAtk, echoesFor, gaugeWithPulse, imbuedElement, lootSeed, rollLoot, satietySaving, savesSatiety } from './echo';
import { echoProblems, GENERAL_ECHOES, parseEchoMaster, serializeEchoMaster, type FoeRank } from './echoMaster';
import { echoStock, equipEngraved, isEquipped, kitEchoes, receiveLoot, setEcho, unequipEngraved } from './engrave';
import { startExplore, step, toResult } from './explore';
import { packRun, parseRun } from './runSave';
import { newSave, parseSave, type SaveData } from './save';
import { depart } from './depart';
import { buy, equip, kitLoadout } from './shop';
import { skillOf } from './weaponSkill';
import type { EchoId, EnemyDef, Result } from './types';

const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const foe = (change: Partial<EnemyDef> = {}): EnemyDef => ({ id: 'x', name: 'x', hp: 10, atk: 5, def: 2, element: 'neutral', body: 'normal', ...change });
const withGear = (slots: number, echoes: EchoId[] = []): SaveData =>
  receiveLoot({ ...newSave(), echoes }, { echoes: [], gear: [{ base: 'sword_3', slots }], rings: [], met: [] });

describe('設定の確かめ', () => {
  it('今の設定は正しい形で、書き出すと同じ中身になる', () => {
    expect(echoProblems(ECHO_MASTER)).toEqual([]);
    expect(serializeEchoMaster(parseEchoMaster(JSON.parse(serializeEchoMaster(ECHO_MASTER))))).toBe(serializeEchoMaster(ECHO_MASTER));
  });

  it('確率・割合・段階・名前の決まりに合わないものは、直すところに出る', () => {
    const edit = (change: (m: typeof ECHO_MASTER) => void) => {
      const m = JSON.parse(JSON.stringify(ECHO_MASTER)) as typeof ECHO_MASTER;
      change(m);
      return echoProblems(m);
    };
    expect(edit((m) => void (m.echo.drop.boss = 101)).length).toBe(1);
    expect(edit((m) => void (m.engraved.drop.normal = 0.123)).length).toBe(1);
    expect(edit((m) => void (m.engraved.slots = { one: 0, two: 0, three: 0 })).length).toBe(1);
    expect(edit((m) => void (m.engraved.tierMin = 6)).length).toBe(1);
    expect(edit((m) => void (m.effects.ice.name = m.effects.fire.name)).length).toBe(1);
    expect(edit((m) => void (m.effects.hard.weapon = 1.5)).length).toBe(1);
    expect(echoProblems(null)).toHaveLength(1);
  });
});

describe('残響の効果（刻印武器のスロットにはめたとき）', () => {
  it('ただの残響は攻撃力が上がる。武器がなければ付かない', () => {
    expect(echoAtk(['plain', 'plain'])).toBe(2 * ECHO_MASTER.effects.plain.weapon);
    const base = buildPlayer(['sword']).atk;
    expect(buildPlayer(['sword'], ['plain']).atk).toBe(base + ECHO_MASTER.effects.plain.weapon);
    expect(buildPlayer([], ['plain']).atk).toBe(buildPlayer([]).atk);
    expect(buildPlayer([], ['plain']).echoes).toBeUndefined();
  });

  it('体質の残響は、その体質の敵へのダメージを増やす（足し算。ほかの体質には効かない）', () => {
    const up = ECHO_MASTER.effects.hard.weapon / 100;
    expect(bodyDamageRate(['hard', 'hard'], 'hard')).toBeCloseTo(1 + 2 * up);
    expect(bodyDamageRate(['hard'], 'soft')).toBe(1);
    const plain = buildPlayer(['hammer']);
    const echoed = buildPlayer(['hammer'], ['hard']);
    const e = foe({ body: 'hard', def: 0 });
    expect(playerHitDamage(echoed, e)).toBeGreaterThan(playerHitDamage(plain, e));
    expect(playerHitDamage(echoed, foe({ body: 'soft', def: 0 }))).toBe(playerHitDamage(plain, foe({ body: 'soft', def: 0 })));
  });

  it('属性の残響は、通常攻撃に属性の力を付ける。砥石の力が付いていれば、そちらが先', () => {
    expect(imbuedElement(['soft', 'ice', 'fire'])).toBe('ice');
    expect(imbuedElement(['plain'])).toBeNull();
    const fireEcho = buildPlayer(['sword'], ['fire']);
    expect(enchantMultiplier(fireEcho, foe({ element: 'ice' }))).toBe(2);
    expect(enchantMultiplier(fireEcho, foe({ element: 'neutral' }))).toBe(1);
    expect(enchantMultiplier({ ...fireEcho, enchant: { element: 'ice', hits: 3 } }, foe({ element: 'ice' }))).toBe(0.5);
    expect(enchantMultiplier(buildPlayer(['sword']), foe({ element: 'ice' }))).toBe(1);
  });

  it('ぬくもりの残響は、満腹度の減りを決まった間隔で減らす（上限90%。乱数は使わない）', () => {
    expect(satietySaving(['warmth', 'warmth'])).toBe(2 * ECHO_MASTER.effects.warmth.weapon);
    expect(satietySaving(Array.from({ length: 20 }, () => 'warmth' as EchoId))).toBe(90);
    const saved = Array.from({ length: 100 }, (_, i) => savesSatiety(50, i + 1)).filter(Boolean).length;
    expect(saved).toBe(50);
    expect(savesSatiety(0, 7)).toBe(false);
  });

  it('鼓動の残響は、技ゲージが満タンになるまでの回数を減らす（2回より減らない）', () => {
    expect(gaugeWithPulse(4, ['pulse'])).toBe(4 - ECHO_MASTER.effects.pulse.weapon);
    expect(gaugeWithPulse(4, ['pulse', 'pulse', 'pulse'])).toBe(2);
    expect(gaugeWithPulse(2, ['pulse'])).toBe(2);
    expect(gaugeWithPulse(4, [])).toBe(4);
    expect(skillOf('sword', ['pulse'])!.max).toBe(skillOf('sword')!.max - ECHO_MASTER.effects.pulse.weapon);
  });

  it('探索の最初のゆるい確かめ：満腹度は、ぬくもりの残響を付けると減りが遅い', () => {
    const run = (echoes: EchoId[]) => {
      let s = startExplore(3, { loadout: ['sword'], echoes });
      for (let i = 0; i < 100 && s.outcome === 'ongoing'; i++) s = must(step(s, { kind: 'wait' }));
      return s.maxSatiety - s.satiety;
    };
    const warm = run(Array.from({ length: 5 }, () => 'warmth' as EchoId));
    expect(warm).toBeLessThan(run([]));
  });
});

describe('落とし物', () => {
  const seeds = (n: number) => Array.from({ length: n }, (_, i) => (i * 2654435761 + 12345) >>> 0);
  const rate = (rank: FoeRank, enemy: EnemyDef, pick: (l: ReturnType<typeof rollLoot>) => boolean, n = 20000) => seeds(n).filter((s) => pick(rollLoot(s, enemy, rank))).length / n;

  it('同じ種からは、いつも同じ結果になる', () => {
    expect(rollLoot(99, foe(), 'boss')).toEqual(rollLoot(99, foe(), 'boss'));
    const state = { seed: 5, floor: 1, turn: 40 };
    expect(lootSeed(state, 3)).toBe(lootSeed(state, 3));
    expect(lootSeed(state, 3)).not.toBe(lootSeed(state, 4));
  });

  it('残響を落とす確率は、設定のとおり（通常2%・強敵10%・ボス50%）', () => {
    const e = foe({ element: 'fire', body: 'soft' });
    expect(rate('normal', e, (l) => l.echo !== null)).toBeCloseTo(ECHO_MASTER.echo.drop.normal / 100, 2);
    expect(rate('elite', e, (l) => l.echo !== null)).toBeCloseTo(ECHO_MASTER.echo.drop.elite / 100, 1);
    expect(rate('boss', e, (l) => l.echo !== null, 4000)).toBeGreaterThan(0.45);
    expect(rate('boss', e, (l) => l.echo !== null, 4000)).toBeLessThan(0.55);
  });

  it('残響は、敵に合うものが落ちる（一部は、どの敵でもぬくもり・鼓動・灯・拾い癖）', () => {
    const e = foe({ element: 'fire', body: 'hard' });
    expect(echoesFor(e)).toEqual(['fire', 'hard']);
    expect(echoesFor(foe())).toEqual(['plain', 'plain']);
    const got = seeds(3000)
      .map((s) => rollLoot(s, e, 'boss').echo)
      .filter((x): x is EchoId => x !== null);
    // ボスは、余韻の残響も落とす
    expect(new Set(got)).toEqual(new Set<EchoId>(['fire', 'hard', 'linger', ...GENERAL_ECHOES]));
    const general = got.filter((x) => (GENERAL_ECHOES as readonly EchoId[]).includes(x)).length / got.length;
    expect(general).toBeGreaterThan(0.12);
    expect(general).toBeLessThan(0.28);
  });

  it('刻印武器は、ごく稀に落ちる武器だけ（敵の体質に合う種類・設定の段階・スロット1〜3）', () => {
    const e = foe({ body: 'hard' });
    expect(rate('normal', e, (l) => l.gear !== null, 60000)).toBeLessThan(0.01);
    expect(rate('elite', e, (l) => l.gear !== null)).toBeGreaterThan(0.02);
    const gears = seeds(40000)
      .map((s) => rollLoot(s, e, 'boss').gear)
      .filter((g): g is NonNullable<typeof g> => g !== null);
    expect(gears.length).toBeGreaterThan(100);
    for (const g of gears) {
      expect(g.base.startsWith('hammer')).toBe(true);
      expect(g.slots).toBeGreaterThanOrEqual(1);
      expect(g.slots).toBeLessThanOrEqual(3);
      const tier = g.base === 'hammer' ? 1 : Number(g.base.split('_')[1]);
      expect(tier).toBeGreaterThanOrEqual(ECHO_MASTER.engraved.tierMin);
      expect(tier).toBeLessThanOrEqual(ECHO_MASTER.engraved.tierMax);
    }
    const one = gears.filter((g) => g.slots === 1).length / gears.length;
    expect(one).toBeGreaterThan(0.8);
  });

  it('どの敵からも、武器の刻印しか出ない（防具にスロットはない）', () => {
    for (const id of Object.keys(ENEMIES)) {
      for (const s of seeds(3000)) {
        const g = rollLoot(s, ENEMIES[id]!, 'boss').gear;
        if (g) expect(['sword', 'hammer', 'staff'].some((w) => g.base.startsWith(w))).toBe(true);
      }
    }
  });
});

describe('倉庫と付け替え', () => {
  it('拾った分は、番号を付けて倉庫に入る（何もなければ、そのまま）', () => {
    const save = newSave();
    expect(receiveLoot(save, undefined)).toBe(save);
    const got = receiveLoot(save, { echoes: ['fire', 'fire', 'hard'], gear: [{ base: 'sword_3', slots: 2 }, { base: 'staff_2', slots: 1 }], rings: [], met: [] });
    expect(got.engraved.map((g) => g.uid)).toEqual([1, 2]);
    expect(got.engraved[0]!.slots).toEqual([null, null]);
    expect(echoStock(got)).toEqual([{ id: 'fire', count: 2 }, { id: 'hard', count: 1 }]);
    const more = receiveLoot(got, { echoes: [], gear: [{ base: 'hammer', slots: 3 }], rings: [], met: [] });
    expect(more.engraved.map((g) => g.uid)).toEqual([1, 2, 3]);
  });

  it('スロットにはめると倉庫から減り、外すと戻る。入れ替えると、前のものが戻る', () => {
    let s = withGear(2, ['fire', 'hard', 'hard']);
    s = must(setEcho(s, 1, 0, 'hard'));
    expect(echoStock(s)).toEqual([{ id: 'fire', count: 1 }, { id: 'hard', count: 1 }]);
    s = must(setEcho(s, 1, 0, 'fire'));
    expect(s.engraved[0]!.slots).toEqual(['fire', null]);
    expect(echoStock(s)).toEqual([{ id: 'hard', count: 2 }]);
    s = must(setEcho(s, 1, 0, null));
    expect(s.engraved[0]!.slots).toEqual([null, null]);
    expect(echoStock(s)).toEqual([{ id: 'fire', count: 1 }, { id: 'hard', count: 2 }]);
  });

  it('倉庫にない残響や、ないスロットには、はめられない', () => {
    const s = withGear(1, ['fire']);
    expect(setEcho(s, 1, 0, 'ice').ok).toBe(false);
    expect(setEcho(s, 1, 1, 'fire').ok).toBe(false);
    expect(setEcho(s, 9, 0, 'fire').ok).toBe(false);
  });

  it('刻印武器を装備すると、元の武器が装備になり、はめた残響を持って出発する。ふつうの武器を選ぶと外れる', () => {
    let s = must(setEcho(withGear(2, ['fire', 'plain']), 1, 0, 'fire'));
    s = must(setEcho(s, 1, 1, 'plain'));
    s = must(equipEngraved(s, 1));
    expect(s.kit.weapon).toBe('sword_3');
    expect(isEquipped(s, 1)).toBe(true);
    expect(kitLoadout(s)).toContain('sword_3');
    expect(kitEchoes(s)).toEqual(['fire', 'plain']);
    const d = depart(1, 'standard', kitLoadout(s), kitEchoes(s));
    expect(d.echoes).toEqual(['fire', 'plain']);
    expect(depart(1, 'standard', ['sword']).echoes).toBeUndefined();

    const bought = must(buy({ ...s, gold: 1000 }, 'sword'));
    expect(bought.kit.weapon).toBe('sword');
    expect(isEquipped(bought, 1)).toBe(false);
    expect(kitEchoes(bought)).toBeUndefined();

    const again = must(equipEngraved(bought, 1));
    expect(must(equip(again, 'weapon', 'sword')).kit.weaponGear).toBeUndefined();
    expect(must(equip(again, 'weapon', null)).kit.weaponGear).toBeUndefined();
    const off = must(unequipEngraved(again, 1));
    expect(off.kit.weapon).toBeNull();
    expect(unequipEngraved(off, 1).ok).toBe(false);
  });
});

describe('セーブと中断データ', () => {
  it('刻印武器・残響・装備は、保存して読み込んでも同じ。昔の記録は、空から始める', () => {
    let s = must(setEcho(withGear(3, ['fire', 'hard', 'warmth']), 1, 0, 'fire'));
    s = must(equipEngraved(s, 1));
    expect(parseSave(JSON.stringify(s))).toEqual(s);

    const old = JSON.parse(JSON.stringify(newSave())) as Record<string, unknown>;
    delete old.engraved;
    delete old.echoes;
    const loaded = parseSave(JSON.stringify(old))!;
    expect(loaded.engraved).toEqual([]);
    expect(loaded.echoes).toEqual([]);
  });

  it('壊れた刻印武器は捨てる（防具・番号の重なり・スロットの数が合わないもの）。今ない残響は、空のスロットにする', () => {
    const raw = {
      ...newSave(),
      engraved: [
        { uid: 1, base: 'plate', slots: [null] },
        { uid: 2, base: 'sword', slots: [null, 'nothing', 'fire'] },
        { uid: 2, base: 'hammer', slots: [null] },
        { uid: 3, base: 'staff', slots: [] },
        { uid: 4, base: 'staff', slots: [null, null, null, null] },
      ],
      echoes: ['fire', 'bogus', 7],
    };
    const loaded = parseSave(JSON.stringify(raw))!;
    expect(loaded.engraved).toEqual([{ uid: 2, base: 'sword', slots: [null, null, 'fire'] }]);
    expect(loaded.echoes).toEqual(['fire']);
  });

  it('中断データにも、はめた残響と拾ったものが残る', () => {
    const outcome = { dungeon: 'standard', trait: 'fire' as const, loadout: ['sword' as const], echoes: ['fire', 'plain'] as EchoId[] };
    let state = startExplore(7, { dungeon: outcome.dungeon, trait: outcome.trait, loadout: outcome.loadout, echoes: outcome.echoes });
    expect(state.stats.echoes).toEqual(['fire', 'plain']);
    state = { ...state, found: { echoes: ['hard'], gear: [{ base: 'sword_2', slots: 2 }], rings: [], met: [] } };
    const run = parseRun(JSON.stringify(packRun(newSave(), outcome, 7, state)))!;
    expect(run.outcome.echoes).toEqual(['fire', 'plain']);
    expect(run.state.stats.echoes).toEqual(['fire', 'plain']);
    expect(run.state.found).toEqual(state.found);
  });
});

describe('探索で拾う', () => {
  it('最初は何も拾っておらず、探索の結果に拾ったものが入る。力尽きても、持ち帰る（結果にも残る）', () => {
    const start = startExplore(1, { loadout: ['sword'] });
    expect(start.found).toEqual({ echoes: [], gear: [], rings: [], met: [] });
    expect(toResult(start).found).toEqual(start.found);
    let total = 0;
    for (let i = 1; i <= 40 && total === 0; i++) {
      const r = autoPlay(i, { loadout: ['sword'] });
      total += (r.found?.echoes.length ?? 0) + (r.found?.gear.length ?? 0);
    }
    expect(total).toBeGreaterThan(0);
  });
});
