import { describe, expect, it } from 'vitest';
import { PREP_CONFIG } from './data';
import { FIELD_ENEMY } from './enemies.fixtures';
import { enemyDef, type MapEnemy } from './enemies';
import { magicPower, spellDamage, startExplore, step, type ExploreAction, type ExploreState } from './explore';
import { GEN_SETTINGS } from './genMaster';
import type { FloorMap, Pos } from './map';
import { buyItem, createPrep } from './prep';
import type { ItemId, PrepState, Result } from './types';

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const act = (state: ExploreState, ...actions: ExploreAction[]) => actions.reduce((s, a) => unwrap(step(s, a)), state);

// 横11マス×縦5マス（中は3行）の部屋
const ROOM = ['###########', '#.........#', '#.........#', '#.........#', '###########'];
const BOOKS: ItemId[] = ['book_shockwave', 'book_sweep', 'book_fire_bolt', 'book_heal', 'book_regen'];

function enemy(pos: Pos, overrides: Partial<MapEnemy> = {}): MapEnemy {
  return { uid: 0, id: FIELD_ENEMY, elite: false, pos, hp: 99, mode: 'chase', justNoticed: false, lastSeen: null, searchTurns: 0, ...overrides };
}

/** 手書きの部屋に、主人公と敵を置いた状態を作る（敵は倒れないよう HP を多めにしている） */
function arena(player: Pos, enemies: MapEnemy[], loadout: ItemId[] = BOOKS): ExploreState {
  const base = startExplore(1, { enemyDensity: 0, loadout });
  const map: FloorMap = {
    width: 11,
    height: 5,
    tiles: ROOM.join('').split('').map((c) => (c === '#' ? 'wall' : 'floor')),
    rooms: [],
    start: player,
    stairs: { x: 9, y: 1 },
    boss: null,
    mainPath: [],
    features: [],
  };
  return { ...base, map, chests: [], player, enemies: enemies.map((e, i) => ({ ...e, uid: i })), seen: new Array<boolean>(55).fill(true) };
}

const cfg = GEN_SETTINGS.spells;

describe('魔力と呪文書', () => {
  it('呪文書を持っていくと、その呪文を覚えて魔力がいっぱいで始まる。持っていなければ魔力はない', () => {
    const s = startExplore(1, { loadout: ['book_heal', 'potion'] });
    expect(s.spells).toEqual(['heal']);
    expect(s.mp).toBe(GEN_SETTINGS.magic.maxMp);
    expect(s.maxMp).toBe(GEN_SETTINGS.magic.maxMp);
    expect(s.stats.items).toEqual(['potion']); // 呪文書は道具の枠に入らない
    const none = startExplore(1, { loadout: ['potion'] });
    expect(none.spells).toEqual([]);
    expect(none.maxMp).toBe(0);
  });

  it('杖を持っていると、魔力の最大と魔法の強さが上がる', () => {
    const staff = startExplore(1, { loadout: ['staff', 'book_heal'] });
    expect(staff.maxMp).toBe(GEN_SETTINGS.magic.maxMp + GEN_SETTINGS.magic.staffMp);
    expect(magicPower(staff.stats)).toBe(GEN_SETTINGS.magic.power * GEN_SETTINGS.magic.staffPower);
  });

  it('唱えると魔力が減り、足りないときや持っていない呪文は唱えられない', () => {
    const s0 = arena({ x: 1, y: 2 }, [enemy({ x: 5, y: 2 })]);
    const s = act(s0, { kind: 'cast', spell: 'fire_bolt', dir: 'right' });
    expect(s.mp).toBe(s0.mp - cfg.fire_bolt!.cost!);
    expect(step({ ...s0, mp: 0 }, { kind: 'cast', spell: 'fire_bolt', dir: 'right' }).ok).toBe(false);
    expect(step(s0, { kind: 'cast', spell: 'ice_bolt', dir: 'right' }).ok).toBe(false);
    expect(step(s0, { kind: 'cast', spell: 'fire_bolt' }).ok).toBe(false); // 向きがない
  });

  it('魔力は、決まった行動数ごとに1ずつ戻る', () => {
    const s0 = { ...arena({ x: 1, y: 1 }, []), mp: 0 };
    const waits = Array.from({ length: GEN_SETTINGS.magic.regenEvery * 2 }, () => ({ kind: 'wait' }) as const);
    expect(act(s0, ...waits).mp).toBe(2);
  });

  it('準備の魔法屋で呪文書を買える。同じ呪文書は1冊、全部で決まった冊数まで', () => {
    let s: PrepState = { ...createPrep(1), gold: 999, openShop: 'magic' };
    s = unwrap(buyItem(s, 'book_heal'));
    expect(buyItem(s, 'book_heal').ok).toBe(false);
    const more: ItemId[] = ['book_sweep', 'book_fire_bolt', 'book_ice_bolt', 'book_regen'];
    for (const id of more.slice(0, PREP_CONFIG.maxSpellbooks - 1)) s = unwrap(buyItem(s, id));
    expect(buyItem(s, more[PREP_CONFIG.maxSpellbooks - 1]!).ok).toBe(false);
  });
});

describe('呪文の働き', () => {
  it('衝撃波：まわりの敵を外へ吹き飛ばし、少しダメージを与える。壁にぶつかると止まって追加ダメージ', () => {
    const s0 = arena({ x: 3, y: 2 }, [enemy({ x: 4, y: 2 }), enemy({ x: 2, y: 2 })]);
    const s = act(s0, { kind: 'cast', spell: 'shockwave' });
    const dmg = spellDamage(s0.stats, 'shockwave', enemyDef(s0.enemies[0]!));
    const push = cfg.shockwave!.push!;
    // 右の敵は push マス飛ぶ（部屋に余裕がある）。左の敵は1マスで壁にぶつかる
    expect(s.cast!.moves).toContainEqual({ from: { x: 4, y: 2 }, to: { x: 4 + push, y: 2 } });
    expect(s.cast!.moves).toContainEqual({ from: { x: 2, y: 2 }, to: { x: 1, y: 2 } });
    const right = s.enemies.find((e) => e.uid === 0)!;
    const left = s.enemies.find((e) => e.uid === 1)!;
    expect(right.hp).toBe(99 - dmg);
    expect(left.hp).toBe(99 - dmg - cfg.shockwave!.crash!);
  });

  it('衝撃波：ほかの敵にぶつかったら、その手前で止まって追加ダメージ', () => {
    const s0 = arena({ x: 3, y: 2 }, [enemy({ x: 4, y: 2 }), enemy({ x: 6, y: 2 })]);
    const s = act(s0, { kind: 'cast', spell: 'shockwave' });
    expect(s.cast!.moves).toContainEqual({ from: { x: 4, y: 2 }, to: { x: 5, y: 2 } });
    const dmg = spellDamage(s0.stats, 'shockwave', enemyDef(s0.enemies[0]!));
    expect(s.enemies.find((e) => e.uid === 0)!.hp).toBe(99 - dmg - cfg.shockwave!.crash!);
  });

  it('なぎ払い：向いた方向の決まったマス数を貫き、並んだ敵すべてに当たる', () => {
    const range = cfg.sweep!.range!;
    const s0 = arena({ x: 1, y: 2 }, [enemy({ x: 2, y: 2 }), enemy({ x: 3, y: 2 }), enemy({ x: 2 + range, y: 2 })]);
    const s = act(s0, { kind: 'cast', spell: 'sweep', dir: 'right' });
    const dmg = spellDamage(s0.stats, 'sweep', enemyDef(s0.enemies[0]!));
    expect(s.enemies.map((e) => e.hp)).toEqual([99 - dmg, 99 - dmg, 99]);
  });

  it('属性の矢：最初に当たった敵だけに、属性の相性で増減したダメージ', () => {
    const s0 = arena({ x: 1, y: 2 }, [enemy({ x: 3, y: 2 }), enemy({ x: 4, y: 2 })]);
    const s = act(s0, { kind: 'cast', spell: 'fire_bolt', dir: 'right' });
    expect(s.enemies.map((e) => e.hp)).toEqual([99 - spellDamage(s0.stats, 'fire_bolt', enemyDef(s0.enemies[0]!)), 99]);
    expect(s.cast!.path).toEqual([
      { x: 2, y: 2 },
      { x: 3, y: 2 },
    ]);
  });

  it('呪文で敵を倒すと、ふつうに倒したときと同じ報酬が入る', () => {
    const s0 = arena({ x: 1, y: 2 }, [enemy({ x: 3, y: 2 }, { hp: 1 })]);
    const s = act(s0, { kind: 'cast', spell: 'fire_bolt', dir: 'right' });
    expect(s.enemies).toHaveLength(0);
    expect(s.defeated).toBe(1);
    expect(s.exp).toBeGreaterThan(0);
  });

  it('癒し：HPがすぐに戻る。減っていなければ唱えられない', () => {
    const s0 = arena({ x: 1, y: 1 }, []);
    expect(step(s0, { kind: 'cast', spell: 'heal' }).ok).toBe(false);
    const hurt = { ...s0, stats: { ...s0.stats, hp: 10 } };
    expect(act(hurt, { kind: 'cast', spell: 'heal' }).stats.hp).toBeGreaterThanOrEqual(10 + cfg.heal!.amount!);
  });

  it('再生：決まったターンのあいだ、1ターンごとに回復する', () => {
    const s0 = arena({ x: 1, y: 1 }, []);
    const hurt = { ...s0, stats: { ...s0.stats, hp: 10 } };
    const s = act(hurt, { kind: 'cast', spell: 'regen' });
    expect(s.regen).not.toBeNull();
    const after = act(s, ...Array.from({ length: cfg.regen!.turns! + 2 }, () => ({ kind: 'wait' }) as const));
    expect(after.regen).toBeNull();
    expect(after.stats.hp).toBeGreaterThanOrEqual(10 + cfg.regen!.amount! * cfg.regen!.turns!);
  });

  it('唱えると、近くのうろついている敵が気付く', () => {
    const s0 = arena({ x: 1, y: 1 }, [enemy({ x: 3, y: 1 }, { mode: 'wander' })]);
    const hurt = { ...s0, stats: { ...s0.stats, hp: 10 } };
    const s = act(hurt, { kind: 'cast', spell: 'heal' });
    expect(s.enemies[0]!.mode).not.toBe('wander');
  });
});
