// 状態異常（docs/status-spec.md）：かかる確率（指輪で変わる）・毒・鈍足・空腹・万能薬・中断データ
import { afterEach, describe, expect, it } from 'vitest';
import { elementRate } from './combat';
import { ENEMIES, ITEMS, STATUS_MASTER } from './data';
import { FIELD_ENEMY } from './enemies.fixtures';
import type { MapEnemy } from './enemies';
import { startExplore, step } from './explore';
import type { ExploreAction, ExploreState } from './exploreTypes';
import { tileAt } from './map';
import { activeStatuses, afflict, cureAll, statusChance } from './status';
import { STATUS_IDS, statusProblems } from './statusMaster';
import type { EnemyDef, ItemId, PlayerStats, Result } from './types';

const unwrap = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const act = (s: ExploreState, ...actions: ExploreAction[]) => actions.reduce((x, a) => unwrap(step(x, a)), s);

const MASTER = JSON.parse(JSON.stringify(STATUS_MASTER)) as typeof STATUS_MASTER;
/** 設定を一時的に変える（afterEach で戻す） */
const setMaster = (change: (m: typeof STATUS_MASTER) => void) => change(STATUS_MASTER);
const ENEMY_BEHAVIORS = new Map<string, EnemyDef['behaviors']>();
/** 敵に、一時的に個性を付ける（afterEach で戻す） */
const giveBehaviors = (id: string, behaviors: EnemyDef['behaviors']) => {
  const def = ENEMIES[id]!;
  if (!ENEMY_BEHAVIORS.has(id)) ENEMY_BEHAVIORS.set(id, def.behaviors);
  def.behaviors = behaviors;
};
afterEach(() => {
  Object.assign(STATUS_MASTER.poison, MASTER.poison);
  Object.assign(STATUS_MASTER.chill, MASTER.chill);
  Object.assign(STATUS_MASTER.hunger, MASTER.hunger);
  for (const [id, b] of ENEMY_BEHAVIORS) {
    if (b === undefined) delete ENEMIES[id]!.behaviors;
    else ENEMIES[id]!.behaviors = b;
  }
  ENEMY_BEHAVIORS.clear();
});

const baseStats = (rings: ItemId[] = []): PlayerStats => ({ hp: 100, maxHp: 100, atk: 6, def: 0, mag: 0, poisonTurns: 0, weapon: null, armor: null, rings, items: [], enchant: null });
const foe = (extra: Partial<EnemyDef> = {}): EnemyDef => ({ id: 'tester', name: '試し', hp: 10, atk: 5, def: 0, element: 'ice', body: 'normal', behaviors: ['poison'], ...extra });
const from = (stats: PlayerStats, satiety = 100, rngState = 1) => ({ stats, satiety, rngState });

describe('かかる確率', () => {
  it('指輪がなければ、設定の確率のまま', () => {
    expect(statusChance(baseStats(), foe(), 'poison')).toBeCloseTo(STATUS_MASTER.poison.chance / 100);
  });

  it('その敵の属性に耐性のある指輪で下がり、弱点になる指輪で上がり、万能の指輪はどれにも効く', () => {
    const base = statusChance(baseStats(), foe(), 'poison');
    expect(statusChance(baseStats(['ring_ice_3']), foe(), 'poison')).toBeLessThan(base);
    expect(statusChance(baseStats(['ring_fire_3']), foe(), 'poison')).toBeGreaterThan(base); // 炎の指輪は、氷の攻撃に弱い
    expect(statusChance(baseStats(['ring_all_3']), foe(), 'poison')).toBeLessThan(base);
    expect(statusChance(baseStats(['ring_ice_3']), foe({ element: 'fire' }), 'poison')).toBeGreaterThan(base * 0.999); // 氷の指輪は、炎の敵に効かない
  });

  it('確率は、敵の攻撃のダメージと同じ倍率（elementRate）を使い、100%を超えない', () => {
    const stats = baseStats(['ring_ice_3']);
    expect(statusChance(stats, foe(), 'poison')).toBeCloseTo((STATUS_MASTER.poison.chance / 100) * elementRate(stats, foe()));
    setMaster((m) => void (m.poison.chance = 100));
    expect(statusChance(baseStats(['ring_fire_5']), foe(), 'poison')).toBe(1);
  });
});

describe('afflict（敵の攻撃のあとに、かかるか決める）', () => {
  it('確率100%なら、必ずかかる。毒は設定のターン数、鈍足は設定の歩数。ログに出る', () => {
    setMaster((m) => {
      m.poison.chance = 100;
      m.chill.chance = 100;
    });
    const poisoned = afflict(from(baseStats()), foe({ behaviors: ['poison'] }));
    expect(poisoned.stats.poisonTurns).toBe(STATUS_MASTER.poison.turns);
    expect(poisoned.log).toHaveLength(1);
    const chilled = afflict(from(baseStats()), foe({ behaviors: ['chill'] }));
    expect(chilled.stats.chillSteps).toBe(STATUS_MASTER.chill.steps);
  });

  it('確率0%なら、かからない', () => {
    setMaster((m) => void (m.poison.chance = 0));
    const r = afflict(from(baseStats()), foe());
    expect(r.stats.poisonTurns).toBe(0);
    expect(r.log).toEqual([]);
  });

  it('空腹は、満腹度がその場で減る（0より下にはならない）', () => {
    setMaster((m) => void (m.hunger.chance = 100));
    const r = afflict(from(baseStats(), 100), foe({ behaviors: ['hunger'] }));
    expect(r.satiety).toBe(100 - STATUS_MASTER.hunger.amount);
    expect(afflict(from(baseStats(), 1), foe({ behaviors: ['hunger'] })).satiety).toBe(0);
  });

  it('同じ状態異常にもう一度かかると、残りが設定の長さまで延びる（重ならない）。ちがう種類は同時にかかる', () => {
    setMaster((m) => {
      m.poison.chance = 100;
      m.chill.chance = 100;
    });
    const again = afflict(from({ ...baseStats(), poisonTurns: 1 }), foe());
    expect(again.stats.poisonTurns).toBe(STATUS_MASTER.poison.turns);
    const long = afflict(from({ ...baseStats(), poisonTurns: 99 }), foe());
    expect(long.stats.poisonTurns).toBe(99);
    const both = afflict(from(baseStats()), foe({ behaviors: ['poison', 'chill'] }));
    expect(activeStatuses(both.stats).map((s) => s.id)).toEqual(['poison', 'chill']);
  });

  it('個性のない敵とボスは与えない。個性のない敵では、乱数も使わない', () => {
    setMaster((m) => void (m.poison.chance = 100));
    const none = afflict(from(baseStats(), 100, 77), foe({ behaviors: ['ranged', 'charger'] }));
    expect(none.rngState).toBe(77);
    expect(none.stats.poisonTurns).toBe(0);
    const boss = afflict(from(baseStats(), 100, 77), foe({ boss: true }));
    expect(boss.stats.poisonTurns).toBe(0);
    expect(boss.rngState).toBe(77);
  });

  it('同じ乱数の状態なら、同じ結果になる', () => {
    expect(afflict(from(baseStats(), 100, 123), foe())).toEqual(afflict(from(baseStats(), 100, 123), foe()));
  });
});

describe('万能薬', () => {
  it('毒と鈍足がすべて治る。治すものがなければ使えない', () => {
    const cured = cureAll({ ...baseStats(), poisonTurns: 2, chillSteps: 3 });
    expect(cured?.cured).toEqual(['poison', 'chill']);
    expect(cured && activeStatuses(cured.stats)).toEqual([]);
    expect(cureAll(baseStats())).toBeNull();
  });

  it('道具として売られていて、探索で使える。使うと1ターンかかり、毒と鈍足が治る。回復薬では治らない', () => {
    expect(ITEMS.panacea.effect.kind).toBe('cure');
    const s0 = startExplore(3, { trait: 'neutral', loadout: ['panacea', 'potion'] });
    const sick: ExploreState = { ...s0, enemies: [], stats: { ...s0.stats, hp: 10, poisonTurns: 3, chillSteps: 2 } };
    const healed = act(sick, { kind: 'use_item', item: 'potion' });
    expect(healed.stats.poisonTurns).toBeGreaterThan(0); // 回復薬では治らない
    const s = act(sick, { kind: 'use_item', item: 'panacea' });
    expect(activeStatuses(s.stats)).toEqual([]);
    expect(s.stats.items).not.toContain('panacea');
    expect(s.turn).toBe(sick.turn + 1);
    expect(step(s, { kind: 'use_item', item: 'panacea' }).ok).toBe(false);
    expect(step({ ...s0, enemies: [] }, { kind: 'use_item', item: 'panacea' }).ok).toBe(false); // 治すものがない
  });
});

/** 主人公の隣に、攻撃してくる敵を1体置いた状態（HPは多め） */
function withAdjacentFoe(seed = 3): { state: ExploreState; away: 'up' | 'down' | 'left' | 'right' } {
  const s0 = startExplore(seed, { trait: 'neutral', loadout: ['panacea'] });
  const dirs = [
    ['up', 0, -1],
    ['down', 0, 1],
    ['left', -1, 0],
    ['right', 1, 0],
  ] as const;
  const open = dirs.filter(([, dx, dy]) => tileAt(s0.map, { x: s0.player.x + dx, y: s0.player.y + dy }) === 'floor');
  const [, dx, dy] = open[0]!;
  const enemy: MapEnemy = { uid: 900, id: FIELD_ENEMY, elite: false, pos: { x: s0.player.x + dx, y: s0.player.y + dy }, hp: 999, mode: 'chase', justNoticed: false, lastSeen: s0.player, searchTurns: 0 };
  const farOpen = open.find(([, ex, ey]) => ex === -dx && ey === -dy);
  return { state: { ...s0, enemies: [enemy], stats: { ...s0.stats, hp: 500, maxHp: 500 } }, away: (farOpen ?? open[0]!)[0] };
}

describe('探索での状態異常', () => {
  it('毒の個性のある敵に殴られると毒になり、そのあとは毎ターン、守りに関係なくダメージを受け、切れると治る', () => {
    setMaster((m) => {
      m.poison.chance = 100;
      m.poison.turns = 2;
      m.poison.damage = 3;
    });
    giveBehaviors(FIELD_ENEMY, ['poison']);
    const { state } = withAdjacentFoe();
    let s = act(state, { kind: 'wait' });
    expect(s.stats.poisonTurns).toBe(2);
    expect(s.log.some((l) => l.includes('毒にかかった'))).toBe(true);
    // 敵を取り除いて、毒だけで減るところを見る
    s = { ...s, enemies: [] };
    const hp = s.stats.hp;
    s = act(s, { kind: 'wait' });
    expect(s.stats.hp).toBe(hp - 3);
    expect(s.stats.poisonTurns).toBe(1);
    s = act(s, { kind: 'wait' });
    expect(s.stats.hp).toBe(hp - 6);
    expect(s.stats.poisonTurns).toBe(0);
    expect(s.log.at(-1)).toBe('毒が抜けた');
    s = act(s, { kind: 'wait' });
    expect(s.stats.hp).toBe(hp - 6); // もう減らない
  });

  it('鈍足のあいだは、歩くのに2ターンかかり、歩数が切れると元に戻る。殴る・待つは1ターン', () => {
    const { state } = withAdjacentFoe();
    const open = (['up', 'down', 'left', 'right'] as const).filter((d) => step({ ...state, enemies: [] }, { kind: 'move', dir: d }).ok);
    const dir = open[0]!;
    let s: ExploreState = { ...state, enemies: [], stats: { ...state.stats, chillSteps: 2 } };
    const t0 = s.turn;
    s = act(s, { kind: 'wait' });
    expect(s.turn).toBe(t0 + 1);
    expect(s.stats.chillSteps).toBe(2); // 歩いていないので、減らない
    const back = { up: 'down', down: 'up', left: 'right', right: 'left' } as const;
    s = act(s, { kind: 'move', dir });
    expect(s.turn).toBe(t0 + 3);
    expect(s.stats.chillSteps).toBe(1);
    s = act(s, { kind: 'move', dir: back[dir] });
    expect(s.turn).toBe(t0 + 5);
    expect(s.stats.chillSteps).toBeUndefined();
    expect(s.log.at(-1)).toBe('足が軽くなった');
    s = act(s, { kind: 'move', dir });
    expect(s.turn).toBe(t0 + 6); // 元の速さ
  });

  it('鈍足の個性のある敵に殴られると、鈍足になる', () => {
    setMaster((m) => void (m.chill.chance = 100));
    giveBehaviors(FIELD_ENEMY, ['chill']);
    const { state } = withAdjacentFoe();
    const s = act(state, { kind: 'wait' });
    expect(s.stats.chillSteps).toBe(STATUS_MASTER.chill.steps);
  });

  it('空腹の個性のある敵に殴られると、満腹度が余分に減る', () => {
    setMaster((m) => void (m.hunger.chance = 100));
    const { state } = withAdjacentFoe();
    const plain = act(state, { kind: 'wait' });
    giveBehaviors(FIELD_ENEMY, ['hunger']);
    const hungry = act(state, { kind: 'wait' });
    expect(plain.satiety - hungry.satiety).toBe(STATUS_MASTER.hunger.amount);
  });

  it('個性のない敵に殴られても、状態異常にならない（確率100%でも）', () => {
    setMaster((m) => {
      m.poison.chance = 100;
      m.chill.chance = 100;
      m.hunger.chance = 100;
    });
    giveBehaviors(FIELD_ENEMY, undefined);
    const { state } = withAdjacentFoe();
    const s = act(state, { kind: 'wait' });
    expect(activeStatuses(s.stats)).toEqual([]);
  });

  it('指輪の耐性が十分あれば、確率が下がり、かかりにくくなる（確率0%の倍率）', () => {
    setMaster((m) => void (m.poison.chance = 100));
    giveBehaviors(FIELD_ENEMY, ['poison']);
    const { state } = withAdjacentFoe();
    const ringed = (id: ItemId): ExploreState => ({ ...state, stats: { ...state.stats, rings: [id] } });
    const def = ENEMIES[FIELD_ENEMY]!;
    expect(statusChance(ringed('ring_all_5').stats, def, 'poison')).toBeLessThan(statusChance(state.stats, def, 'poison'));
  });
});

describe('状態異常の設定の確かめ', () => {
  it('公開している設定は、正しい形になっている', () => {
    expect(statusProblems(STATUS_MASTER)).toEqual([]);
    for (const id of STATUS_IDS) expect(STATUS_MASTER[id].chance).toBeGreaterThanOrEqual(0);
  });

  it('範囲の外・小数・足りない欄は、直すところに出る', () => {
    const bad = (change: (m: typeof STATUS_MASTER) => void) => {
      const m = JSON.parse(JSON.stringify(MASTER)) as typeof STATUS_MASTER;
      change(m);
      return statusProblems(m).length;
    };
    expect(bad((m) => void (m.poison.chance = 101))).toBe(1);
    expect(bad((m) => void (m.poison.turns = 0))).toBe(1);
    expect(bad((m) => void (m.chill.steps = 2.5))).toBe(1);
    expect(bad((m) => void (m.hunger.amount = -1))).toBe(1);
    expect(bad((m) => void (m.foe.burn.turns = 0))).toBe(1);
    expect(bad((m) => void (m.foe.smashPercent = 99))).toBe(1);
    expect(bad((m) => void (m.foe.weakBonus = 0.5))).toBe(1);
    expect(bad((m) => void delete (m as Partial<typeof m>).foe)).toBe(1);
    expect(statusProblems({})).toHaveLength(STATUS_IDS.length + 1); // 3つの状態異常と、敵にかける状態異常（foe）の欄
    expect(statusProblems(null)).toHaveLength(1);
  });
});
