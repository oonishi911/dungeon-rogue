// 呪文（2026-11-22 に足した7つ）：静寂・転移・石の壁・眠りの霧・魔力の盾・毒の霧・解呪。docs/dungeon-design.md の「魔法」
import { afterEach, describe, expect, it } from 'vitest';
import { enemyHitDamage } from './combat';
import { ENEMIES } from './data';
import { DEFAULT_DUNGEON } from './dungeons';
import { BOSS_ENEMY, FIELD_ENEMY } from './enemies.fixtures';
import { enemyDef, type MapEnemy } from './enemies';
import { startExplore, step } from './explore';
import type { ExploreAction, ExploreState } from './exploreTypes';
import type { FloorMap, Pos } from './map';
import { magicPower, spellDamage } from './magic';
import { packRun, parseRun } from './runSave';
import { newSave } from './save';
import type { EnemyDef, ItemId, Result } from './types';

const unwrap = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const act = (state: ExploreState, ...actions: ExploreAction[]) => actions.reduce((s, a) => unwrap(step(s, a)), state);
const WAIT: ExploreAction = { kind: 'wait' };
const cast = (spell: string, dir?: 'up' | 'down' | 'left' | 'right'): ExploreAction => ({ kind: 'cast', spell, ...(dir ? { dir } : {}) }) as ExploreAction;

const BOOKS: ItemId[] = ['book_silence', 'book_teleport', 'book_stone_wall', 'book_sleep', 'book_ward', 'book_poison_mist', 'book_cleanse', 'book_heal', 'book_prism_fan'];
const cfg = DEFAULT_DUNGEON.spells;

// 横21マス×縦5マス（中は3行）の部屋。WIDE は真ん中に縦の壁があり、いちばん下の段だけ通れる
const ROOM = ['#####################', '#...................#', '#...................#', '#...................#', '#####################'];

function enemy(pos: Pos, overrides: Partial<MapEnemy> = {}): MapEnemy {
  return { uid: 0, id: FIELD_ENEMY, elite: false, pos, hp: 999, mode: 'chase', justNoticed: false, lastSeen: null, searchTurns: 0, ...overrides };
}

function arena(player: Pos, enemies: MapEnemy[], rows: string[] = ROOM): ExploreState {
  const base = startExplore(1, { enemyDensity: 0, loadout: BOOKS });
  const width = rows[0]!.length;
  const map: FloorMap = {
    width,
    height: rows.length,
    tiles: rows.join('').split('').map((c) => (c === '#' ? 'wall' : 'floor')),
    rooms: [],
    start: player,
    stairs: { x: width - 2, y: 1 },
    boss: null,
    mainPath: [],
    features: [],
  };
  return { ...base, map, chests: [], player, enemies: enemies.map((e, i) => ({ ...e, uid: i })), seen: new Array<boolean>(width * rows.length).fill(true), stats: { ...base.stats, hp: 500, maxHp: 500 } };
}

const saved = new Map<string, EnemyDef['behaviors']>();
const give = (id: string, behaviors: EnemyDef['behaviors']) => {
  if (!saved.has(id)) saved.set(id, ENEMIES[id]!.behaviors);
  ENEMIES[id]!.behaviors = behaviors;
};
afterEach(() => {
  for (const [id, b] of saved) {
    if (b === undefined) delete ENEMIES[id]!.behaviors;
    else ENEMIES[id]!.behaviors = b;
  }
  saved.clear();
});

describe('静寂', () => {
  it('まわりの敵（ボスは除く）が、設定のターン数だけ黙る。遠い敵には効かない', () => {
    const r = cfg.silence!.radius!;
    const s = act(arena({ x: 5, y: 2 }, [enemy({ x: 5 + r, y: 2 }), enemy({ x: 5 + r + 1, y: 2 }), enemy({ x: 4, y: 2 }, { id: BOSS_ENEMY, elite: true })]), cast('silence'));
    expect(s.cast!.area).toEqual([{ x: 5 + r, y: 2 }]);
    // 唱えたターンの敵の番で1減っている
    expect(s.enemies.find((e) => e.uid === 0)!.silenced).toBe(cfg.silence!.turns! - 1);
    expect(s.enemies.find((e) => e.uid === 1)!.silenced).toBeUndefined();
    expect(s.enemies.find((e) => e.uid === 2)!.silenced).toBeUndefined();
  });

  it('黙っている遠距離の敵は撃たない。切れると、また撃つ', () => {
    give(FIELD_ENEMY, ['ranged']);
    const s0 = arena({ x: 2, y: 2 }, [enemy({ x: 5, y: 2 })]);
    const plain = act(s0, WAIT);
    expect(plain.foes.some((f) => f.kind === 'shot')).toBe(true);
    let s = act(s0, cast('silence'));
    expect(s.foes.some((f) => f.kind === 'shot')).toBe(false);
    s = { ...s, enemies: s.enemies.map((e) => ({ ...e, pos: { x: 5, y: 2 } })) };
    s = act(s, WAIT);
    expect(s.foes.some((f) => f.kind === 'shot')).toBe(false);
    s = { ...s, enemies: s.enemies.map((e) => ({ ...e, silenced: undefined, pos: { x: 5, y: 2 } })) };
    expect(act(s, WAIT).foes.some((f) => f.kind === 'shot')).toBe(true);
  });

  it('黙っている見張りは叫ばない。唱えても、まわりの敵は気付かない', () => {
    give(FIELD_ENEMY, ['alarm']);
    const s = act(arena({ x: 2, y: 2 }, [enemy({ x: 4, y: 2 }, { mode: 'wander' }), enemy({ x: 12, y: 2 }, { mode: 'wander' })]), cast('silence'));
    expect(s.enemies[1]!.mode).toBe('wander');
    expect(s.foes.some((f) => f.kind === 'alarm')).toBe(false);
  });
});

describe('転移', () => {
  it('見たことのある、離れた床（敵と隣り合わない）へ跳び、追っていた敵は見失う', () => {
    const s0 = arena({ x: 2, y: 2 }, [enemy({ x: 3, y: 2 })]);
    const s = act(s0, cast('teleport'));
    const range = cfg.teleport!.range!;
    expect(Math.max(Math.abs(s.player.x - 2), Math.abs(s.player.y - 2))).toBeGreaterThanOrEqual(range);
    expect(s.cast!.warp).toEqual({ from: { x: 2, y: 2 }, to: s.player });
    expect(s.mp).toBe(s0.mp - cfg.teleport!.cost!);
    expect(s.enemies[0]!.mode).not.toBe('chase');
    for (const e of s0.enemies) expect(Math.max(Math.abs(e.pos.x - s.player.x), Math.abs(e.pos.y - s.player.y))).toBeGreaterThan(1); // 跳んだ時点で、敵と隣り合わない
  });

  it('跳べる床がなければ唱えられず、魔力も減らない（見たことのない床には跳ばない）', () => {
    const s0 = { ...arena({ x: 2, y: 2 }, []), seen: new Array<boolean>(21 * 5).fill(false) };
    expect(step(s0, cast('teleport')).ok).toBe(false);
  });
});

describe('石の壁', () => {
  it('目の前と左右の3マスに壁ができ、主人公は通れず、決まったターンで崩れる', () => {
    let s = act(arena({ x: 5, y: 2 }, []), cast('stone_wall', 'right'));
    const stones = s.fields.filter((f) => f.kind === 'stone').map((f) => f.pos);
    expect([...stones].sort((a, b) => a.y - b.y)).toEqual([{ x: 6, y: 1 }, { x: 6, y: 2 }, { x: 6, y: 3 }]);
    expect(step(s, { kind: 'move', dir: 'right' }).ok).toBe(false);
    for (let i = 0; i < cfg.stone_wall!.turns!; i++) s = act(s, WAIT);
    expect(s.fields.some((f) => f.kind === 'stone')).toBe(false);
    expect(step(s, { kind: 'move', dir: 'right' }).ok).toBe(true);
  });

  it('敵のいるマスには作らない。敵は壁を通り抜けられない', () => {
    let s = act(arena({ x: 5, y: 2 }, [enemy({ x: 6, y: 1 }, { mode: 'wander' }), enemy({ x: 9, y: 2 }, { lastSeen: { x: 5, y: 2 } })]), cast('stone_wall', 'right'));
    const stones = s.fields.filter((f) => f.kind === 'stone').map((f) => f.pos);
    expect(stones).not.toContainEqual({ x: 6, y: 1 });
    s = act(s, WAIT, WAIT, WAIT);
    for (const e of s.enemies) expect(stones).not.toContainEqual(e.pos);
  });

  it('矢の呪文と、遠距離の敵の矢は、壁で止まる', () => {
    give(FIELD_ENEMY, ['ranged']);
    const s = act(arena({ x: 2, y: 2 }, [enemy({ x: 6, y: 2 })]), cast('stone_wall', 'right'));
    expect(s.foes.some((f) => f.kind === 'shot')).toBe(false);
  });
});

describe('眠りの霧', () => {
  it('まわりの、まだ気付いていない敵だけが眠り、眠っているあいだは動かない', () => {
    let s = act(arena({ x: 5, y: 2 }, [enemy({ x: 7, y: 2 }, { mode: 'wander' }), enemy({ x: 7, y: 1 }, { mode: 'chase' })]), cast('sleep'));
    expect(s.enemies[0]!.asleep).toBe(true);
    expect(s.enemies[1]!.asleep).toBeUndefined();
    s = act(s, WAIT, WAIT, WAIT);
    expect(s.enemies[0]!.pos).toEqual({ x: 7, y: 2 });
    expect(s.enemies[0]!.mode).toBe('wander');
  });

  it('殴られると起きて、次のターンから動く。呪文の声でも起きる', () => {
    let s = act(arena({ x: 5, y: 2 }, [enemy({ x: 6, y: 2 }, { mode: 'wander' })]), cast('sleep'));
    s = act(s, { kind: 'move', dir: 'right' });
    expect(s.enemies[0]!.asleep).toBeUndefined();
    expect(s.enemies[0]!.mode).toBe('chase');
    let t = act(arena({ x: 5, y: 2 }, [enemy({ x: 7, y: 2 }, { mode: 'wander' })]), cast('sleep'));
    t = act({ ...t, stats: { ...t.stats, hp: 1 } }, cast('heal'));
    expect(t.enemies[0]!.asleep).toBeUndefined();
  });
});

describe('魔力の盾', () => {
  it('続くあいだ、敵の攻撃で受けるダメージが減り、切れると記録に出る', () => {
    const foe = enemy({ x: 6, y: 2 });
    const s0 = arena({ x: 5, y: 2 }, [foe]);
    const full = enemyHitDamage(s0.stats, enemyDef(foe));
    const plain = act(s0, WAIT);
    expect(plain.stats.hp).toBe(s0.stats.hp - full);
    let s = act(s0, cast('ward'));
    const cut = cfg.ward!.cut!;
    expect(s0.stats.hp - s.stats.hp).toBe(Math.max(1, Math.round((full * (100 - cut)) / 100)));
    expect(s.ward!.turns).toBe(cfg.ward!.turns! - 1);
    s = { ...s, enemies: [] };
    for (let i = 0; i < cfg.ward!.turns!; i++) s = act(s, WAIT);
    expect(s.ward).toBeUndefined();
    expect(s.log).toContain('魔力の盾が消えた');
  });
});

describe('毒の霧', () => {
  it('当たった敵のまわり9マスに霧が残り、上にいる敵は毎ターンダメージ、主人公は受けない', () => {
    const s0 = arena({ x: 2, y: 2 }, [enemy({ x: 5, y: 2 }, { mode: 'wander' })]);
    const s = act(s0, cast('poison_mist', 'right'));
    const mists = s.fields.filter((f) => f.kind === 'poison');
    expect(mists).toHaveLength(9);
    const amount = Math.max(1, Math.round(magicPower(s0.stats, DEFAULT_DUNGEON.magic) * cfg.poison_mist!.power!));
    expect(mists[0]!.amount).toBe(amount);
    const e = s.enemies[0]!;
    expect(e.hp).toBe(999 - amount * (samePosIn(mists, e.pos) ? 1 : 0));
    // 主人公が霧に入っても、ダメージはない
    const me = act({ ...s, enemies: [], player: { x: 4, y: 2 } }, WAIT);
    expect(me.stats.hp).toBe(s.stats.hp);
  });

  it('敵がいなければ、届くマス数の終わりで広がる', () => {
    const s = act(arena({ x: 2, y: 2 }, []), cast('poison_mist', 'right'));
    expect(s.cast!.path.at(-1)).toEqual({ x: 2 + cfg.poison_mist!.range!, y: 2 });
  });
});

const samePosIn = (fields: { pos: Pos }[], p: Pos) => fields.some((f) => f.pos.x === p.x && f.pos.y === p.y);

describe('解呪', () => {
  it('毒と鈍足を治す。治すものがなければ唱えられない', () => {
    const s0 = arena({ x: 2, y: 2 }, []);
    expect(step(s0, cast('cleanse')).ok).toBe(false);
    const s = act({ ...s0, stats: { ...s0.stats, poisonTurns: 5, chillSteps: 2 } }, cast('cleanse'));
    expect(s.stats.poisonTurns).toBe(0);
    expect(s.stats.chillSteps).toBeUndefined();
  });
});

describe('虹の扇', () => {
  it('向いた方向に、奥ほど広がる扇形（1・3・5マス…）のマスに届き、その中の敵すべてに当たる', () => {
    const range = cfg.prism_fan!.range!;
    const s = act(arena({ x: 5, y: 2 }, [enemy({ x: 6, y: 2 }), enemy({ x: 7, y: 1 }), enemy({ x: 4, y: 2 })]), cast('prism_fan', 'right'));
    // 部屋の高さ（中は3行）の外は壁なので、上下は切れる
    const want = [];
    for (let k = 1; k <= range; k++) for (let w = -(k - 1); w <= k - 1; w++) if (2 + w >= 1 && 2 + w <= 3) want.push({ x: 5 + k, y: 2 + w });
    expect(s.cast!.path).toEqual(want);
    expect(s.enemies[0]!.hp).toBeLessThan(999);
    expect(s.enemies[1]!.hp).toBeLessThan(999);
    expect(s.enemies[2]!.hp).toBe(999); // 後ろの敵には当たらない
  });

  it('属性を持たないので、どの属性の敵にも同じダメージ（矢は、属性で増減する）', () => {
    const s0 = arena({ x: 2, y: 2 }, []);
    const ids = ['fire_imp', 'ice_imp', 'goblin', 'light_bird', 'shadow'];
    const fan = ids.map((id) => spellDamage(s0.stats, 'prism_fan', enemyDef({ id, elite: false }), DEFAULT_DUNGEON));
    expect(new Set(fan).size).toBe(1);
    expect(fan[0]).toBe(Math.max(1, Math.round(magicPower(s0.stats, DEFAULT_DUNGEON.magic) * cfg.prism_fan!.power!)));
    const bolt = ids.map((id) => spellDamage(s0.stats, 'fire_bolt', enemyDef({ id, elite: false }), DEFAULT_DUNGEON));
    expect(new Set(bolt).size).toBeGreaterThan(1);
  });

  it('壁と石の壁の向こうには届かない', () => {
    const rows = ['#####################', '#.......#...........#', '#.......#...........#', '#.......#...........#', '#####################'];
    const s = act(arena({ x: 6, y: 2 }, [enemy({ x: 9, y: 2 })], rows), cast('prism_fan', 'right'));
    expect(s.cast!.path.every((p) => p.x < 8)).toBe(true);
    expect(s.enemies[0]!.hp).toBe(999);
  });
});

describe('中断データ', () => {
  it('静寂・眠り・魔力の盾も、保存して戻せる', () => {
    const state = startExplore(7, { loadout: ['book_ward'] });
    const base = state.enemies[0]!;
    const withSpells: ExploreState = { ...state, ward: { cut: 50, turns: 3 }, enemies: [{ ...base, silenced: 2, asleep: true }, ...state.enemies.slice(1)] };
    const run = parseRun(JSON.stringify(packRun(newSave(), { dungeon: state.dungeon, trait: state.trait, loadout: ['book_ward'] }, 7, withSpells)));
    expect(run!.state.ward).toEqual({ cut: 50, turns: 3 });
    expect(run!.state.enemies[0]).toMatchObject({ silenced: 2, asleep: true });
  });
});

