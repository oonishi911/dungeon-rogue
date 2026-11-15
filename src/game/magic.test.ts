import { describe, expect, it } from 'vitest';
import { FIELD_ENEMY } from './enemies.fixtures';
import { enemyDef, type MapEnemy } from './enemies';
import { startExplore, step } from './explore';
import { type ExploreAction, type ExploreState } from './exploreTypes';
import { magicPower, spellAffinity, spellDamage } from './magic';
import { buildPlayer } from './combat';
import { ITEMS } from './data';
import { DEFAULT_DUNGEON } from './dungeons';
import { FIELD_CONFIG } from './fields';
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

  it('武器の魔力が、魔法の強さに足される。杖なら、足した合計に杖の倍率が掛かる', () => {
    const mag = (id: ItemId) => {
      const e = ITEMS[id].effect;
      return e.kind === 'weapon' ? e.mag : NaN;
    };
    expect(mag('staff_5')).toBeGreaterThan(0); // テスト用の設定では、杖の5段目から魔力がある
    expect(mag('sword_5')).toBe(0);
    expect(magicPower(buildPlayer(['staff']), GEN.magic)).toBe(GEN.magic.power * GEN.magic.staffPower);
    expect(magicPower(buildPlayer(['staff_5']), GEN.magic)).toBe((GEN.magic.power + mag('staff_5')) * GEN.magic.staffPower);
    expect(magicPower(buildPlayer(['sword_5']), GEN.magic)).toBe(GEN.magic.power); // 魔力0の武器は、魔法を強くしない
    expect(magicPower(buildPlayer([]), GEN.magic)).toBe(GEN.magic.power);
    // 魔力の最大は、武器の魔力では変わらない
    expect(startExplore(1, { loadout: ['staff_5', 'book_heal'] }).maxMp).toBe(GEN.magic.maxMp + GEN.magic.staffMp);
  });

  it('レベルで増えた魔力も、魔法の強さに足される（武器の魔力と合わせて。杖なら合計に倍率）', () => {
    const lv = (id: ItemId, levels: number) => ({ ...buildPlayer([id]), mag: GEN.growth.magPerLevel * levels });
    expect(magicPower(lv('sword', 3), GEN.magic)).toBe(GEN.magic.power + GEN.growth.magPerLevel * 3);
    expect(magicPower(lv('staff_5', 3), GEN.magic)).toBe((GEN.magic.power + 4 + GEN.growth.magPerLevel * 3) * GEN.magic.staffPower);
    expect(buildPlayer(['staff']).mag).toBe(0); // 最初は0
  });

  it('魔力の高い武器を持つと、呪文のダメージが上がる', () => {
    const foe = enemyDef(enemy({ x: 5, y: 2 }));
    const damage = (weapon: ItemId) => spellDamage(buildPlayer([weapon]), 'fire_bolt', foe, GEN);
    expect(damage('staff_10')).toBeGreaterThan(damage('staff'));
    expect(damage('sword_10')).toBe(damage('sword'));
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

  it('連矢：最初に当たった敵のまわり8マスの敵に、真ん中の敵に与えるダメージの割合（splash）だけ与える', () => {
    const loadout: ItemId[] = ['book_fire_chain', 'book_ice_chain', 'book_light_chain', 'book_dark_chain'];
    // 真ん中の敵(3,2)、そのななめ(4,3)と後ろ(4,2)の敵、2マス離れた敵(6,2)
    const s0 = arena({ x: 1, y: 2 }, [enemy({ x: 3, y: 2 }), enemy({ x: 4, y: 3 }), enemy({ x: 4, y: 2 }), enemy({ x: 6, y: 2 })], loadout);
    for (const spell of ['fire_chain', 'ice_chain', 'light_chain', 'dark_chain'] as const) {
      const s = act(s0, { kind: 'cast', spell, dir: 'right' });
      const center = spellDamage(s0.stats, spell, enemyDef(s0.enemies[0]!), GEN);
      const around = Math.max(1, Math.round(center * cfg[spell]!.splash!));
      // 炎の連矢は、当たった敵の足元とまわりに燃える床を残すので、同じターンの終わりに、その上の敵が燃える床のダメージを受ける
      const burn = spell === 'fire_chain' ? FIELD_CONFIG.fireDamage : 0;
      expect(s.enemies.map((e) => e.hp)).toEqual([99 - center - burn, 99 - around - burn, 99 - around - burn, 99]);
      expect(s.cast!.splash).toEqual([
        { x: 4, y: 3 },
        { x: 4, y: 2 },
      ]);
      expect(s.mp).toBe(s0.mp - cfg[spell]!.cost!);
    }
  });

  it('連矢：何にも当たらなければまわりは巻き込まない。割合が0ならまわりにはダメージがない。ふつうの矢は巻き込まない', () => {
    const s0 = arena({ x: 1, y: 2 }, [enemy({ x: 3, y: 2 }), enemy({ x: 4, y: 3 })], ['book_fire_chain', 'book_fire_bolt']);
    const miss = act(s0, { kind: 'cast', spell: 'fire_chain', dir: 'up' });
    expect(miss.enemies.map((e) => e.hp)).toEqual([99, 99]);
    expect(miss.cast!.splash).toEqual([]);
    const none = act({ ...s0, mp: 99 }, { kind: 'cast', spell: 'fire_bolt', dir: 'right' });
    expect(none.enemies[1]!.hp).toBe(99);
    expect(none.cast!.splash).toEqual([]);
  });

  it('連矢：まわりの敵を倒せる。倒した敵は戦った数に入る', () => {
    const s0 = arena({ x: 1, y: 2 }, [enemy({ x: 3, y: 2 }), enemy({ x: 4, y: 2 }, { hp: 1 })], ['book_fire_chain']);
    const s = act(s0, { kind: 'cast', spell: 'fire_chain', dir: 'right' });
    expect(s.enemies).toHaveLength(1);
    expect(s.defeated).toBe(s0.defeated + 1);
    expect(s.cast!.splash).toEqual([{ x: 4, y: 2 }]);
  });

  it('敵の魔法の倍率（magic）：呪文のダメージに掛かる（矢・なぎ払いなど）。連矢のまわりへのダメージと出血は、そのダメージから決まる', () => {
    const base = enemyDef(enemy({ x: 3, y: 2 }));
    const s0 = arena({ x: 1, y: 2 }, [enemy({ x: 3, y: 2 })]);
    const plain = spellDamage(s0.stats, 'fire_bolt', base, GEN);
    expect(spellDamage(s0.stats, 'fire_bolt', { ...base, magic: 1 }, GEN)).toBe(plain);
    expect(spellDamage(s0.stats, 'fire_bolt', { ...base, magic: 2 }, GEN)).toBe(plain * 2);
    expect(spellDamage(s0.stats, 'sweep', { ...base, magic: 0.5 }, GEN)).toBeLessThan(spellDamage(s0.stats, 'sweep', base, GEN));
    expect(spellDamage(s0.stats, 'fire_bolt', { ...base, magic: 0.1 }, GEN)).toBeGreaterThanOrEqual(1);
  });

  it('強衝撃：衝撃波と同じに吹き飛ばし、さらに1ターン動けなくする（そのあいだは攻撃してこない）', () => {
    // 主人公の隣の敵(2,2)は、後ろの敵(3,2)にふさがれて吹き飛ばない
    const make = (spell: 'shockwave' | 'shockwave_strong') => {
      const s0 = arena({ x: 1, y: 2 }, [enemy({ x: 2, y: 2 }), enemy({ x: 3, y: 2 })], ['book_shockwave', 'book_shockwave_strong']);
      return { s0, s: act({ ...s0, mp: 99 }, { kind: 'cast', spell }) };
    };
    const plain = make('shockwave');
    expect(plain.s.stats.hp).toBeLessThan(plain.s0.stats.hp); // ふつうの衝撃波では、隣の敵が攻撃してくる
    const strong = make('shockwave_strong');
    expect(strong.s.stats.hp).toBe(strong.s0.stats.hp); // 強衝撃では、動けないので攻撃してこない
    expect(strong.s.cast!.stunned).toEqual([{ x: 2, y: 2 }]);
    expect(strong.s.enemies[0]!.stun).toBeUndefined(); // 1ターンで元に戻る
    const next = act(strong.s, { kind: 'wait' });
    expect(next.stats.hp).toBeLessThan(strong.s.stats.hp); // 次のターンからは攻撃してくる
  });

  it('強衝撃：動けないあいだは、気付いていない敵も気付かず、後ろからの攻撃もしない', () => {
    const s0 = arena({ x: 2, y: 2 }, [enemy({ x: 3, y: 2 }, { stun: 2 })]);
    const away = unwrap(step(s0, { kind: 'move', dir: 'left' }));
    expect(away.stats.hp).toBe(s0.stats.hp);
    expect(away.enemies[0]!.stun).toBe(1);
  });

  it('烈なぎ払い：当たった敵が出血し、あとの3ターン、1ターンに与えたダメージの2割（四捨五入、最低1）を受ける。そのターンは受けない', () => {
    const loadout: ItemId[] = ['book_sweep_bleed'];
    const s0 = arena({ x: 1, y: 2 }, [enemy({ x: 2, y: 2 }), enemy({ x: 3, y: 2 }), enemy({ x: 5, y: 2 })], loadout);
    const rich = { ...s0, stats: { ...s0.stats, hp: 999, maxHp: 999 } };
    const dmg = spellDamage(s0.stats, 'sweep_bleed', enemyDef(s0.enemies[0]!), GEN);
    const slip = Math.max(1, Math.round(dmg * cfg.sweep_bleed!.bleedRate!));
    const s1 = act(rich, { kind: 'cast', spell: 'sweep_bleed', dir: 'right' });
    expect(s1.enemies.map((e) => e.hp)).toEqual([99 - dmg, 99 - dmg, 99]);
    expect(s1.enemies.map((e) => e.bleed)).toEqual([{ amount: slip, turns: 3 }, { amount: slip, turns: 3 }, undefined]);
    expect(s1.cast!.bleeding).toEqual([{ x: 2, y: 2 }, { x: 3, y: 2 }]);
    const s2 = act(s1, { kind: 'wait' });
    expect(s2.enemies.map((e) => e.hp)).toEqual([99 - dmg - slip, 99 - dmg - slip, 99]);
    expect(s2.hits.filter((h) => h.kind === 'dealt' && h.slip)).toHaveLength(2);
    const s4 = act(s2, { kind: 'wait' }, { kind: 'wait' });
    expect(s4.enemies.map((e) => e.hp)).toEqual([99 - dmg - slip * 3, 99 - dmg - slip * 3, 99]);
    expect(s4.enemies.map((e) => e.bleed)).toEqual([undefined, undefined, undefined]);
    expect(act(s4, { kind: 'wait' }).enemies.map((e) => e.hp)).toEqual(s4.enemies.map((e) => e.hp)); // 出血は止まっている
  });

  it('烈なぎ払い：出血で倒せる（ふつうに倒したときと同じ報酬）。出血のダメージでは、気付いていない敵は気付かない', () => {
    const loadout: ItemId[] = ['book_sweep_bleed'];
    const s0 = arena({ x: 1, y: 2 }, [enemy({ x: 3, y: 2 })], loadout);
    const dmg = spellDamage(s0.stats, 'sweep_bleed', enemyDef(s0.enemies[0]!), GEN);
    const weak = { ...s0, enemies: [{ ...s0.enemies[0]!, hp: dmg + 1 }] };
    const s1 = act(weak, { kind: 'cast', spell: 'sweep_bleed', dir: 'right' });
    expect(s1.enemies).toHaveLength(1);
    const s2 = act(s1, { kind: 'wait' });
    expect(s2.enemies).toHaveLength(0);
    expect(s2.defeated).toBe(s0.defeated + 1);
    // 遠くで気付いていない敵が出血しても、うろつきのまま
    const calm = arena({ x: 1, y: 2 }, [enemy({ x: 9, y: 2 }, { mode: 'wander', bleed: { amount: 2, turns: 2 } })]);
    const s3 = act(calm, { kind: 'wait' });
    expect(s3.enemies[0]!.hp).toBe(97);
    expect(s3.enemies[0]!.mode).toBe('wander');
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
