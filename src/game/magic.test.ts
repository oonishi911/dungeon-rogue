import { describe, expect, it } from 'vitest';
import { FIELD_ENEMY } from './enemies.fixtures';
import { enemyDef, type MapEnemy } from './enemies';
import { startExplore, step } from './explore';
import { type ExploreAction, type ExploreState } from './exploreTypes';
import { magicPower, spellAffinity, spellDamage } from './magic';
import { DEFAULT_DUNGEON } from './dungeons';
import type { FloorMap, Pos } from './map';
import type { ItemId, Result } from './types';

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

// 標準のダンジョンの設定（startExplore でダンジョンを指定しないと、標準のダンジョンになる。テストでは src/game/testdata/ の決まった中身）
const GEN = DEFAULT_DUNGEON;
const cfg = GEN.spells;

describe('魔力と呪文書', () => {
  it('呪文書を持っていくと、その呪文を覚えて魔力がいっぱいで始まる。持っていなければ魔力はない', () => {
    const s = startExplore(1, { loadout: ['book_heal', 'potion'] });
    expect(s.spells).toEqual(['heal']);
    expect(s.mp).toBe(GEN.magic.maxMp);
    expect(s.maxMp).toBe(GEN.magic.maxMp);
    expect(s.stats.items).toEqual(['potion']); // 呪文書は道具の枠に入らない
    const none = startExplore(1, { loadout: ['potion'] });
    expect(none.spells).toEqual([]);
    expect(none.maxMp).toBe(0);
  });

  it('杖を持っていると、魔力の最大と魔法の強さが上がる', () => {
    const staff = startExplore(1, { loadout: ['staff', 'book_heal'] });
    expect(staff.maxMp).toBe(GEN.magic.maxMp + GEN.magic.staffMp);
    expect(magicPower(staff.stats, GEN.magic)).toBe(GEN.magic.power * GEN.magic.staffPower);
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
    const waits = Array.from({ length: GEN.magic.regenEvery * 2 }, () => ({ kind: 'wait' }) as const);
    expect(act(s0, ...waits).mp).toBe(2);
  });
});

describe('呪文の働き', () => {
  it('衝撃波：まわりの敵を外へ吹き飛ばし、少しダメージを与える。壁にぶつかると止まって追加ダメージ', () => {
    const s0 = arena({ x: 3, y: 2 }, [enemy({ x: 4, y: 2 }), enemy({ x: 2, y: 2 })]);
    const s = act(s0, { kind: 'cast', spell: 'shockwave' });
    const dmg = spellDamage(s0.stats, 'shockwave', enemyDef(s0.enemies[0]!), GEN);
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
    const dmg = spellDamage(s0.stats, 'shockwave', enemyDef(s0.enemies[0]!), GEN);
    expect(s.enemies.find((e) => e.uid === 0)!.hp).toBe(99 - dmg - cfg.shockwave!.crash!);
  });

  it('なぎ払い：向いた方向の決まったマス数を貫き、並んだ敵すべてに当たる', () => {
    const range = cfg.sweep!.range!;
    const s0 = arena({ x: 1, y: 2 }, [enemy({ x: 2, y: 2 }), enemy({ x: 3, y: 2 }), enemy({ x: 2 + range, y: 2 })]);
    const s = act(s0, { kind: 'cast', spell: 'sweep', dir: 'right' });
    const dmg = spellDamage(s0.stats, 'sweep', enemyDef(s0.enemies[0]!), GEN);
    expect(s.enemies.map((e) => e.hp)).toEqual([99 - dmg, 99 - dmg, 99]);
  });

  it('属性の矢：最初に当たった敵だけに、属性の相性で増減したダメージ', () => {
    const s0 = arena({ x: 1, y: 2 }, [enemy({ x: 3, y: 2 }), enemy({ x: 4, y: 2 })]);
    const s = act(s0, { kind: 'cast', spell: 'fire_bolt', dir: 'right' });
    expect(s.enemies.map((e) => e.hp)).toEqual([99 - spellDamage(s0.stats, 'fire_bolt', enemyDef(s0.enemies[0]!), GEN), 99]);
    expect(s.cast!.path).toEqual([
      { x: 2, y: 2 },
      { x: 3, y: 2 },
    ]);
  });

  it('属性の矢と当たった敵の相性を、演出のために残す（弱点・ふつう・効きにくい。外れたら・矢でなければ null）', () => {
    const base = enemyDef(enemy({ x: 0, y: 0 }));
    expect(spellAffinity('fire_bolt', { ...base, element: 'ice' })).toBe('weak');
    expect(spellAffinity('fire_bolt', { ...base, element: 'fire' })).toBe('resist');
    expect(spellAffinity('fire_bolt', { ...base, element: 'neutral' })).toBe('normal');
    expect(spellAffinity('light_lance', { ...base, element: 'dark' })).toBe('weak');
    const s0 = arena({ x: 1, y: 2 }, [enemy({ x: 3, y: 2 })]);
    const hit = act(s0, { kind: 'cast', spell: 'fire_bolt', dir: 'right' });
    expect(hit.cast!.affinity).toBe(spellAffinity('fire_bolt', enemyDef(s0.enemies[0]!)));
    expect(act(s0, { kind: 'cast', spell: 'fire_bolt', dir: 'left' }).cast!.affinity).toBeNull();
    expect(act(s0, { kind: 'cast', spell: 'sweep', dir: 'right' }).cast!.affinity).toBeNull();
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
