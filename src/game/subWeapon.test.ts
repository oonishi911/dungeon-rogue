// サブ武器と持ち替え（docs/combat-fun-spec.md の②）：持ち込み・枠・持ち替え・店・保存・自動プレイ
import { describe, expect, it } from 'vitest';
import { autoAction } from './autoplay';
import { buildPlayer, itemCapacity, playerHitDamage, swapWeapons, weaponAtk } from './combat';
import { LOADOUT_CONFIG } from './data';
import { enemyDef, type MapEnemy } from './enemies';
import { startExplore, step } from './explore';
import type { ExploreState } from './exploreTypes';
import { tileAt } from './map';
import { newSave, parseSave, type SaveData } from './save';
import { equip, equipSub, fitKit, kitLoadout, takeLimit, takeSupply } from './shop';
import type { EnemyDef, ItemId, Result } from './types';
import { ENEMIES } from './data';

const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const owning = (owned: ItemId[], kit: SaveData['kit'] = { weapon: null, armor: null, books: [], take: [] }): SaveData => ({ ...newSave(), owned, kit });

describe('持ち込み：メインとサブ', () => {
  it('1本目がメイン、メインとちがう種類の2本目がサブ。同じ種類の2本目は、サブにならない', () => {
    const p = buildPlayer(['sword', 'hammer_2', 'plate']);
    expect(p.weapon).toBe('sword');
    expect(p.sub).toEqual({ weapon: 'hammer_2', skill: 0 });
    expect(buildPlayer(['sword', 'sword_2']).sub).toBeUndefined();
    expect(buildPlayer(['sword', 'plate']).sub).toBeUndefined();
  });

  it('攻撃力は、メインの武器の分だけ（サブの武器は、持ち替えるまで効かない）', () => {
    const solo = buildPlayer(['sword']);
    const duo = buildPlayer(['sword', 'hammer_5']);
    expect(duo.atk).toBe(solo.atk);
  });

  it('サブ武器を持っていくと、道具を持てる数が1つ減る（大きな袋とは足し算）', () => {
    expect(itemCapacity(['sword'])).toBe(LOADOUT_CONFIG.maxItems);
    expect(itemCapacity(['sword', 'hammer'])).toBe(LOADOUT_CONFIG.maxItems - LOADOUT_CONFIG.subWeaponSlots);
    expect(itemCapacity(['sword', 'hammer', 'bag'])).toBe(LOADOUT_CONFIG.maxItems - LOADOUT_CONFIG.subWeaponSlots + 3);
    expect(itemCapacity(['sword', 'sword_2'])).toBe(LOADOUT_CONFIG.maxItems);
  });

  it('探索を始めると、サブ武器と、減った道具の枠で始まる', () => {
    const s = startExplore(3, { trait: 'neutral', loadout: ['sword', 'hammer'] });
    expect(s.stats.sub?.weapon).toBe('hammer');
    expect(s.maxItems).toBe(LOADOUT_CONFIG.maxItems - LOADOUT_CONFIG.subWeaponSlots);
  });
});

describe('持ち替え', () => {
  it('武器と攻撃力と技ゲージが入れ替わる。2回で元に戻る', () => {
    const p = buildPlayer(['sword', 'hammer_4']);
    const a = must({ ok: true, value: swapWeapons(p, 3)! } as Result<NonNullable<ReturnType<typeof swapWeapons>>>);
    expect(a.stats.weapon).toBe('hammer_4');
    expect(a.stats.sub?.weapon).toBe('sword');
    expect(a.stats.atk).toBe(p.atk - weaponAtk('sword') + weaponAtk('hammer_4'));
    expect(a.skill).toBe(0); // サブ武器のゲージ（まだたまっていない）
    expect(a.stats.sub?.skill).toBe(3); // 剣のゲージは、持ち替えても残る
    const b = swapWeapons(a.stats, a.skill)!;
    expect(b.stats.weapon).toBe('sword');
    expect(b.stats.atk).toBe(p.atk);
    expect(b.skill).toBe(3);
  });

  it('メインにはめた残響は、メインの武器と一緒に動く（サブを持っているあいだは、効かない）', () => {
    const p = buildPlayer(['sword', 'hammer'], ['plain']);
    expect(p.echoes).toEqual(['plain']);
    const a = swapWeapons(p, 0)!;
    expect(a.stats.echoes).toBeUndefined();
    expect(a.stats.atk).toBe(p.atk - weaponAtk('sword', ['plain']) + weaponAtk('hammer'));
    const b = swapWeapons(a.stats, a.skill)!;
    expect(b.stats.echoes).toEqual(['plain']);
    expect(b.stats.atk).toBe(p.atk);
  });

  it('サブ武器がなければ、持ち替えられない', () => {
    expect(swapWeapons(buildPlayer(['sword']), 0)).toBeNull();
    const s = startExplore(3, { trait: 'neutral', loadout: ['sword'] });
    expect(step(s, { kind: 'swap' }).ok).toBe(false);
  });

  it('探索で持ち替えると、1ターンかかり、記録に出る。ダメージは持ち替えた武器で変わる', () => {
    const s = startExplore(3, { trait: 'neutral', loadout: ['sword', 'hammer'] });
    const t = must(step({ ...s, enemies: [] }, { kind: 'swap' }));
    expect(t.turn).toBe(s.turn + 1);
    expect(t.stats.weapon).toBe('hammer');
    expect(t.log.at(-1)).toContain('持ち替えた');
    const hard = Object.values(ENEMIES).find((e) => !e.boss && e.body === 'hard' && e.def === 0) ?? { ...Object.values(ENEMIES).find((e) => !e.boss)!, body: 'hard' as const, def: 0 };
    expect(playerHitDamage(t.stats, hard)).toBeGreaterThan(playerHitDamage(s.stats, hard)); // 硬い体には、ハンマーのほうが効く
  });
});

describe('店：サブ武器を決める', () => {
  const kit = (weapon: ItemId | null, take: ItemId[] = []): SaveData['kit'] => ({ weapon, armor: null, books: [], take });

  it('持っている武器で、メインとちがう種類のものを、サブにできる。外せる', () => {
    const s = owning(['sword', 'hammer', 'sword_2'], kit('sword'));
    const withSub = must(equipSub(s, 'hammer'));
    expect(withSub.kit.weapon2).toBe('hammer');
    expect(kitLoadout(withSub)).toEqual(['sword', 'hammer']);
    expect(must(equipSub(withSub, null)).kit.weapon2).toBeUndefined();
    expect(equipSub(s, 'sword_2').ok).toBe(false); // メインと同じ種類
    expect(equipSub(s, 'staff').ok).toBe(false); // 持っていない
    expect(equipSub(owning(['hammer'], kit(null)), 'hammer').ok).toBe(false); // メインがない
  });

  it('道具がいっぱいなら、サブ武器は決められない（道具を減らしてから）。サブ武器があると、道具の上限が減る', () => {
    const full = Array.from({ length: LOADOUT_CONFIG.maxItems }, () => 'potion' as ItemId);
    const s = { ...owning(['sword', 'hammer'], kit('sword', full)), stock: full };
    expect(equipSub(s, 'hammer').ok).toBe(false);
    const fewer = { ...s, kit: { ...s.kit, take: full.slice(1) } };
    const withSub = must(equipSub(fewer, 'hammer'));
    expect(takeLimit(withSub.kit.take, true)).toBe(LOADOUT_CONFIG.maxItems - 1);
    expect(takeSupply({ ...withSub, stock: full }, 'potion', 1).ok).toBe(false); // もう1つは持てない
  });

  it('店を開くとき（fitKit）に、サブ武器の分を超えた道具は外れる', () => {
    const take = Array.from({ length: LOADOUT_CONFIG.maxItems }, () => 'potion' as ItemId);
    const s = fitKit({ ...owning(['sword', 'hammer'], { ...kit('sword', take), weapon2: 'hammer' }), stock: take });
    expect(s.kit.take).toHaveLength(LOADOUT_CONFIG.maxItems - 1);
  });

  it('メインを、サブと同じ種類の武器に変える・外すと、サブ武器は外れる。ちがう種類なら残る', () => {
    const s = { ...owning(['sword', 'hammer', 'hammer_2', 'staff'], { ...kit('sword'), weapon2: 'hammer' }) };
    expect(must(equip(s, 'weapon', 'hammer_2')).kit.weapon2).toBeUndefined();
    expect(must(equip(s, 'weapon', null)).kit.weapon2).toBeUndefined();
    expect(must(equip(s, 'weapon', 'staff')).kit.weapon2).toBe('hammer');
  });
});

describe('保存', () => {
  const load = (kit: object, owned: ItemId[]) => parseSave(JSON.stringify({ ...newSave(), owned, kit }))!.kit;

  it('サブ武器を保存して、読める。ちがう種類でない・持っていない・メインがないものは捨てる', () => {
    const base = { armor: null, books: [], take: [] };
    expect(load({ ...base, weapon: 'sword', weapon2: 'hammer' }, ['sword', 'hammer']).weapon2).toBe('hammer');
    expect(load({ ...base, weapon: 'sword', weapon2: 'sword_2' }, ['sword', 'sword_2']).weapon2).toBeUndefined();
    expect(load({ ...base, weapon: 'sword', weapon2: 'hammer' }, ['sword']).weapon2).toBeUndefined();
    expect(load({ ...base, weapon: null, weapon2: 'hammer' }, ['hammer']).weapon2).toBeUndefined();
    expect(load({ ...base, weapon: 'sword' }, ['sword']).weapon2).toBeUndefined(); // サブ武器の欄ができる前の記録
  });
});

describe('自動プレイ', () => {
  /** 主人公の隣に、体質を決めた敵を置いた状態 */
  function facing(body: EnemyDef['body'], loadout: ItemId[]): ExploreState {
    const s0 = startExplore(3, { trait: 'neutral', loadout });
    const open = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).find(([dx, dy]) => tileAt(s0.map, { x: s0.player.x + dx, y: s0.player.y + dy }) === 'floor')!;
    const id = Object.values(ENEMIES).find((e) => !e.boss && e.body === body)!.id;
    const enemy: MapEnemy = { uid: 900, id, elite: false, pos: { x: s0.player.x + open[0], y: s0.player.y + open[1] }, hp: 999, mode: 'chase', justNoticed: false, lastSeen: s0.player, searchTurns: 0 };
    return { ...s0, enemies: [enemy] };
  }

  it('サブ武器のほうがずっと効く敵なら、持ち替える。今の武器で十分なら、殴る', () => {
    const hard = facing('hard', ['sword', 'hammer_3']);
    expect(playerHitDamage(swapWeapons(hard.stats, 0)!.stats, enemyDef(hard.enemies[0]!))).toBeGreaterThanOrEqual(playerHitDamage(hard.stats, enemyDef(hard.enemies[0]!)) * 1.3);
    expect(autoAction(hard)).toEqual({ kind: 'swap' });
    const soft = facing('soft', ['sword', 'hammer']);
    expect(autoAction(soft).kind).toBe('move'); // 剣は柔らかい体に効く
  });

  it('サブ武器がなければ、持ち替えない', () => {
    expect(autoAction(facing('hard', ['sword'])).kind).toBe('move');
  });
});
