// 指輪（docs/ring-spec.md）：指の数・付け替え・買う・昔の記録の持ち越し・二重耐性の指輪の落とし物・設定の確かめ
import { describe, expect, it } from 'vitest';
import { ECHO_MASTER, ITEM_MASTER, ITEMS } from './data';
import { rollLoot } from './echo';
import { echoProblems } from './echoMaster';
import { receiveLoot } from './engrave';
import { DUAL_PAIRS, dualRingId, itemProblems, pairElements, ringId, ringKey, ringOf } from './itemMaster';
import { equipRing, fingers, kitRings, unequipRing } from './ring';
import { newSave, parseSave, type SaveData } from './save';
import { buy, kitLoadout } from './shop';
import { MEMORIES } from './story';
import type { Element, ItemId, Result } from './types';

const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const memoryIds = Object.keys(MEMORIES);
const hasAll = (list: readonly ItemId[], ids: readonly ItemId[]) => ids.every((id) => list.includes(id));
/** 記憶を n 個思い出していて、金貨がたくさんある記録 */
const withMemories = (n: number, gold = 100000): SaveData => ({ ...newSave(), gold, memories: memoryIds.slice(0, n) });

describe('指の数', () => {
  it('思い出した記憶の数で増える（0〜1個で1つ、2〜3個で2つ、4個以上で3つ）', () => {
    expect([0, 1, 2, 3, 4, 5].map(fingers)).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it('設定の記憶の数で変えられる', () => {
    const { two, three } = ECHO_MASTER.ring.fingers;
    expect([fingers(two - 1), fingers(two), fingers(three - 1), fingers(three)]).toEqual([1, 2, 2, 3]);
  });
});

describe('指輪の ID と種類', () => {
  it('指輪の種類と段階を読める。二重耐性の指輪は組み合わせも読める', () => {
    expect(ringOf('ring_fire_3')).toEqual({ kind: 'fire', pair: null, level: 3 });
    expect(ringOf('ring_all_5')).toEqual({ kind: 'all', pair: null, level: 5 });
    expect(ringOf('ring_dual_fire_ice_2')).toEqual({ kind: 'dual', pair: 'fire_ice', level: 2 });
    expect(ringOf('sword')).toBeNull();
    expect(ringOf('plate_3')).toBeNull();
    expect(ringKey('ring_light_4')).toBe('light');
    expect(ringKey('ring_dual_fire_ice_2')).toBe('fire_ice');
    expect(ringKey('potion')).toBeNull();
  });

  it('二重耐性の組み合わせは10通りで、品物の一覧に全部ある（5段階ずつ）', () => {
    expect(DUAL_PAIRS).toHaveLength(10);
    for (const pair of DUAL_PAIRS) {
      const [a, b] = pairElements(pair);
      expect(a).not.toBe(b);
      for (let l = 1; l <= 5; l++) expect(ITEMS[dualRingId(pair, l)]?.effect.kind).toBe('ring');
    }
  });

  it('二重耐性の指輪の名前と値段：名前は組み合わせと段階から付き、買える値段はない', () => {
    expect(ITEMS.ring_dual_fire_ice_1.name).toBe('二重耐性の指輪（炎・氷）');
    expect(ITEMS.ring_dual_fire_ice_3.name).toBe('二重耐性の指輪（炎・氷）+2');
    expect(new Set(Object.values(ITEMS).map((i) => i.name)).size).toBe(Object.keys(ITEMS).length); // 名前は重ならない
  });
});

describe('指輪を買う・付ける・外す', () => {
  it('買うと、付けられれば付ける。同じ種類は入れ替わる', () => {
    let s = withMemories(0);
    s = must(buy(s, 'ring_fire_1'));
    expect(kitRings(s)).toEqual(['ring_fire_1']);
    expect(s.owned).toContain('ring_fire_1');
    expect(s.gold).toBe(100000 - ITEMS.ring_fire_1.price);
    s = must(buy(s, 'ring_fire_2', s.owned)); // 同じ炎の指輪の、上の段階
    expect(kitRings(s)).toEqual(['ring_fire_2']);
    expect(hasAll(s.owned, ['ring_fire_1', 'ring_fire_2'])).toBe(true); // 前の指輪は、持ったまま
  });

  it('指が空いていなければ、買っても付かない（持っておく）。付けようとするとエラー', () => {
    let s = must(buy(withMemories(0), 'ring_fire_1'));
    s = must(buy(s, 'ring_ice_1'));
    expect(kitRings(s)).toEqual(['ring_fire_1']);
    expect(s.owned).toContain('ring_ice_1');
    expect(equipRing(s, 'ring_ice_1').ok).toBe(false);
    // 指が増えれば（記憶を思い出せば）付けられる
    const more = { ...s, memories: memoryIds.slice(0, 2) };
    expect(kitRings(must(equipRing(more, 'ring_ice_1')))).toEqual(['ring_fire_1', 'ring_ice_1']);
  });

  it('ちがう種類は、指の数まで重ねられる（3つ）', () => {
    let s = withMemories(4);
    for (const id of ['ring_fire_1', 'ring_light_1', 'ring_all_1', 'ring_dark_1'] as ItemId[]) s = must(buy(s, id));
    expect(kitRings(s)).toEqual(['ring_fire_1', 'ring_light_1', 'ring_all_1']);
  });

  it('持っていない指輪・指輪でないものは付けられない。外すこともできる', () => {
    const s = must(buy(withMemories(2), 'ring_fire_1'));
    expect(equipRing(s, 'ring_ice_1').ok).toBe(false);
    expect(equipRing(s, 'sword').ok).toBe(false);
    expect(equipRing(s, 'ring_fire_1').ok).toBe(false); // もう付けている
    const off = must(unequipRing(s, 'ring_fire_1'));
    expect(kitRings(off)).toEqual([]);
    expect('rings' in off.kit).toBe(false); // 空なら欄ごとなくなる
    expect(unequipRing(off, 'ring_fire_1').ok).toBe(false);
  });

  it('付けた指輪は、持っていく物に入る', () => {
    const s = must(buy(must(buy(withMemories(2), 'sword')), 'ring_all_1'));
    expect(kitLoadout(s)).toEqual(['sword', 'ring_all_1']);
  });

  it('金貨が足りなければ買えない。万能の指輪は同じ段階の2倍', () => {
    expect(buy({ ...withMemories(0), gold: 10 }, 'ring_fire_1').ok).toBe(false);
    for (let l = 1; l <= 5; l++) expect(ITEMS[ringId('all', l)].price).toBe(ITEMS[ringId('fire', l)].price * 2);
  });

  it('二重耐性の指輪は、店で買えない。持っていれば付けられる', () => {
    expect(buy(withMemories(0), 'ring_dual_fire_ice_2').ok).toBe(false);
    const s = { ...withMemories(0), owned: ['ring_dual_fire_ice_2' as ItemId] };
    expect(kitRings(must(equipRing(s, 'ring_dual_fire_ice_2')))).toEqual(['ring_dual_fire_ice_2']);
  });

  it('二重耐性の指輪は、その組み合わせの指輪としては1つだけ。ほかの種類の指輪とは重ねられる', () => {
    const owned: ItemId[] = ['ring_dual_fire_ice_2', 'ring_dual_fire_ice_4', 'ring_fire_1'];
    let s = { ...withMemories(4), owned };
    s = must(equipRing(s, 'ring_dual_fire_ice_2'));
    s = must(equipRing(s, 'ring_dual_fire_ice_4')); // 入れ替わる
    expect(kitRings(s)).toEqual(['ring_dual_fire_ice_4']);
    s = must(equipRing(s, 'ring_fire_1')); // 炎の指輪とは、別の種類
    expect(kitRings(s)).toEqual(['ring_dual_fire_ice_4', 'ring_fire_1']);
  });
});

describe('保存と読み込み', () => {
  it('付けた指輪は、保存して読み込むと戻る', () => {
    let s = withMemories(2);
    s = must(buy(s, 'ring_fire_2'));
    s = must(buy(s, 'ring_all_1'));
    expect(parseSave(JSON.stringify(s))).toEqual(s);
  });

  it('指輪の欄がない昔の記録は、指輪なしで読める', () => {
    const s = parseSave(JSON.stringify(newSave()));
    expect(s?.kit.rings).toBeUndefined();
  });

  it('読み込むとき、持っていない指輪・同じ種類の重なり・指の数を超えた分は外す', () => {
    const base = { ...withMemories(0), owned: ['ring_fire_1', 'ring_fire_2', 'ring_ice_1'] as ItemId[] };
    const raw = (rings: ItemId[], memories = base.memories) => JSON.stringify({ ...base, memories, kit: { ...base.kit, rings } });
    expect(parseSave(raw(['ring_fire_1', 'ring_ice_1']))?.kit.rings).toEqual(['ring_fire_1']); // 指は1本
    expect(parseSave(raw(['ring_fire_1', 'ring_ice_1'], memoryIds.slice(0, 2)))?.kit.rings).toEqual(['ring_fire_1', 'ring_ice_1']);
    expect(parseSave(raw(['ring_fire_1', 'ring_fire_2'], memoryIds.slice(0, 4)))?.kit.rings).toEqual(['ring_fire_1']); // 同じ種類は1つ
    expect(parseSave(raw(['ring_all_1'], memoryIds.slice(0, 4)))?.kit.rings).toBeUndefined(); // 持っていない
  });
});

describe('昔の記録（マント・衣）の持ち越し', () => {
  const old = (owned: string[], armor: string | null = null) =>
    parseSave(JSON.stringify({ ...newSave(), memories: memoryIds.slice(0, 2), owned, kit: { weapon: null, armor, books: [], take: [] } }))!;

  it('マント・衣は、同じ段階の鎧と、その属性の指輪（段階は半分に切り上げ）に変わる', () => {
    const s = old(['fire_cloak', 'ice_cloak_4', 'light_robe_10', 'dark_robe_5', 'plate_3']);
    expect(hasAll(s.owned, ['plate', 'plate_4', 'plate_10', 'plate_5', 'plate_3'])).toBe(true);
    expect(hasAll(s.owned, ['ring_fire_1', 'ring_ice_2', 'ring_light_5', 'ring_dark_3'])).toBe(true);
    expect(s.owned.every((id) => id in ITEMS)).toBe(true);
    expect(new Set(s.owned).size).toBe(s.owned.length);
  });

  it('装備していたマント・衣は、鎧と指輪を装備した形で持ち越す', () => {
    const s = old(['ice_cloak_6'], 'ice_cloak_6');
    expect(s.kit.armor).toBe('plate_6');
    expect(s.kit.rings).toEqual(['ring_ice_3']);
    expect(hasAll(s.owned, ['plate_6', 'ring_ice_3'])).toBe(true);
  });

  it('買ったものは無駄にならない（鎧は残る。段階が低い順でも、同じ結果）', () => {
    const a = old(['fire_cloak_2', 'fire_cloak_9']);
    expect(hasAll(a.owned, ['plate_2', 'plate_9', 'ring_fire_1', 'ring_fire_5'])).toBe(true);
  });
});

describe('二重耐性の指輪の落とし物', () => {
  const seeds = (n: number) => Array.from({ length: n }, (_, i) => i * 7919 + 13);
  const foe = (element: Element) => ({ element, body: 'normal' as const });

  it('落とす確率は設定のとおり（強敵3%・ボス10%）。ごく稀', () => {
    const rate = (rank: 'normal' | 'elite' | 'boss', n: number) => seeds(n).filter((s) => rollLoot(s, foe('fire'), rank).ring !== null).length / n;
    expect(rate('normal', 60000)).toBeLessThan(0.01);
    expect(rate('elite', 20000)).toBeCloseTo(ECHO_MASTER.ring.dual.drop.elite / 100, 1);
    expect(rate('boss', 8000)).toBeGreaterThan(0.08);
    expect(rate('boss', 8000)).toBeLessThan(0.12);
  });

  it('倒した敵の属性を含む組み合わせが落ちる。段階は設定の範囲。10通りの組み合わせがすべて出うる', () => {
    const { tierMin, tierMax } = ECHO_MASTER.ring.dual;
    const seen = new Set<string>();
    for (const element of ['fire', 'ice', 'neutral', 'light', 'dark'] as const) {
      for (const s of seeds(3000)) {
        const id = rollLoot(s, foe(element), 'boss').ring;
        if (!id) continue;
        const r = ringOf(id)!;
        expect(r.kind).toBe('dual');
        expect(pairElements(r.pair!)).toContain(element);
        expect(r.level).toBeGreaterThanOrEqual(tierMin);
        expect(r.level).toBeLessThanOrEqual(tierMax);
        seen.add(r.pair!);
      }
    }
    expect(seen.size).toBe(10);
  });

  it('二重耐性の指輪を落とすくじは、刻印武器・残響のくじを変えない（確率を0にしても、同じ種なら同じ結果）', () => {
    const e = foe('ice');
    const drop = ECHO_MASTER.ring.dual.drop;
    const before = seeds(300).map((s) => ({ ...rollLoot(s, e, 'boss'), ring: null }));
    const saved = drop.boss;
    drop.boss = 0;
    try {
      expect(seeds(300).map((s) => rollLoot(s, e, 'boss'))).toEqual(before);
    } finally {
      drop.boss = saved;
    }
  });

  it('拾った指輪は、持ち物に入る（力尽きても失わない）。同じものは重ならない', () => {
    const s0 = withMemories(0);
    const s1 = receiveLoot(s0, { echoes: [], gear: [], rings: ['ring_dual_fire_ice_3', 'ring_dual_fire_ice_3', 'ring_dual_ice_dark_2'] });
    expect(s1.owned).toEqual(['ring_dual_fire_ice_3', 'ring_dual_ice_dark_2']);
    const s2 = receiveLoot(s1, { echoes: [], gear: [], rings: ['ring_dual_fire_ice_3', 'ring_dual_fire_ice_4'] });
    expect(s2.owned).toEqual(['ring_dual_fire_ice_3', 'ring_dual_ice_dark_2', 'ring_dual_fire_ice_4']);
    expect(receiveLoot(s0, undefined)).toBe(s0);
  });
});

describe('設定の確かめ', () => {
  const edit = (change: (m: typeof ITEM_MASTER) => void) => {
    const m = JSON.parse(JSON.stringify(ITEM_MASTER)) as typeof ITEM_MASTER;
    change(m);
    return itemProblems(m);
  };

  it('今の設定は正しい', () => {
    expect(itemProblems(ITEM_MASTER)).toEqual([]);
    expect(echoProblems(ECHO_MASTER)).toEqual([]);
  });

  it('耐性・値段・名前・弱点・二重耐性の決まりに合わないものは、直すところに出る', () => {
    expect(edit((m) => void (m.rings.kinds.fire[4]!.cut = 101)).length).toBe(1);
    expect(edit((m) => void (m.rings.kinds.fire[2]!.cut = 5)).length).toBe(1); // 2段目（20）より低い
    expect(edit((m) => void (m.rings.kinds.ice[1]!.price = 1)).length).toBe(1);
    expect(edit((m) => void (m.rings.kinds.all[0]!.name = m.rings.kinds.fire[0]!.name)).length).toBe(1);
    expect(edit((m) => void (m.rings.weak = -1)).length).toBe(1);
    expect(edit((m) => void m.rings.kinds.light.pop()).length).toBe(1);
    expect(edit((m) => void (m.rings.dualCut = [10, 20])).length).toBe(1);
    expect(edit((m) => void delete (m as Partial<typeof m>).rings)).toEqual(['指輪の設定が読めない']);
  });

  it('残響の設定：指の数・二重耐性の落とし方の決まりに合わないものは、直すところに出る', () => {
    const bad = (change: (m: typeof ECHO_MASTER) => void) => {
      const m = JSON.parse(JSON.stringify(ECHO_MASTER)) as typeof ECHO_MASTER;
      change(m);
      return echoProblems(m).length;
    };
    expect(bad((m) => void (m.ring.fingers.two = 6))).toBeGreaterThan(0);
    expect(bad((m) => void (m.ring.fingers.two = 5))).toBe(1); // 3本目より遅い
    expect(bad((m) => void (m.ring.dual.tierMin = 5))).toBe(1);
    expect(bad((m) => void (m.ring.dual.tierMax = 6))).toBe(1);
    expect(bad((m) => void (m.ring.dual.drop.boss = 120))).toBe(1);
  });
});
