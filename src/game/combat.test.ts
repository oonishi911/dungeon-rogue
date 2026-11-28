import { describe, expect, it } from 'vitest';
import { buildPlayer, enemyHitDamage, playerHitDamage } from './combat';
import { COMBAT_CONFIG, ITEMS } from './data';
import { ARMORED_ENEMY } from './enemies.fixtures';
import { elementGuards } from './itemMaster';
import type { Element, EnemyDef, ItemId, PlayerStats } from './types';

/** 属性だけを変えた、攻撃力11・防御0の敵（プレイヤーの防御1を引くと基礎ダメージ10） */
function attacker(element: Element): EnemyDef {
  return { id: 'goblin', name: 'テスト', hp: 100, atk: 110, def: 0, element, body: 'normal' };
}

/** 体質だけを変えた、防御0の敵 */
function target(body: EnemyDef['body'], element: Element = 'neutral'): EnemyDef {
  return { id: 'goblin', name: 'テスト', hp: 100, atk: 10, def: 0, element, body };
}

const hit = (loadout: ItemId[], element: Element) => enemyHitDamage(buildPlayer(loadout), attacker(element));

describe('buildPlayer', () => {
  it('武器・防具・道具を振り分ける', () => {
    const p = buildPlayer(['potion', 'hammer', 'plate', 'food']);
    expect(p.weapon).toBe('hammer');
    expect(p.armor).toBe('plate');
    expect(p.items).toEqual(['potion', 'food']);
    expect(p.enchant).toBeNull();
  });

  it('指輪の耐性は、受けるダメージの倍率になる（耐性30%なら0.7倍）。説明にも「カット」と出る', () => {
    const ring = ITEMS.ring_fire_3;
    expect(ring.effect.kind === 'ring' && ring.effect.cut).toBe(30);
    expect(ring.effect.kind === 'ring' && ring.effect.guards[0]).toEqual({ kind: 'component', component: 'fire', rate: 0.7 });
    expect(ring.description).toContain('炎のダメージを30%カットする');
    expect(ring.description).toContain('氷のダメージが15%増える');
    expect(ITEMS.ring_light_3.description).toContain('光の攻撃のダメージを30%カットする');
    expect(ITEMS.ring_all_3.description).toContain('すべての属性のダメージを15%カットする');
  });

  it('指輪は指輪の枠、防具は防具の枠。何個でも付けられる（指の数は店で決まる）', () => {
    const p = buildPlayer(['sword', 'plate', 'ring_fire_1', 'ring_light_2']);
    expect(p.armor).toBe('plate');
    expect(p.rings).toEqual(['ring_fire_1', 'ring_light_2']);
    expect(buildPlayer(['sword', 'plate']).rings).toBeUndefined();
  });

  it('武器を持つと攻撃力が上がる', () => {
    const sword = ITEMS.sword.effect;
    expect(buildPlayer(['sword']).atk).toBe(COMBAT_CONFIG.playerAtk + (sword.kind === 'weapon' ? sword.atk : NaN));
    // 段階が上がるほど、攻撃力・守りが上がる
    expect(buildPlayer(['sword_5']).atk).toBeGreaterThan(buildPlayer(['sword']).atk);
    expect(buildPlayer(['plate_5']).def).toBeGreaterThan(buildPlayer(['plate']).def);
    expect(buildPlayer([]).atk).toBe(COMBAT_CONFIG.playerAtk);
  });
});

describe('enemyHitDamage（防具と属性）', () => {
  it('防具なしなら属性に関係なく同じ', () => {
    for (const e of ['fire', 'ice', 'neutral', 'light', 'dark'] as const) expect(hit([], e)).toBe(100);
  });

  it('防具は守りだけで、属性は関係ない', () => {
    for (const e of ['fire', 'ice', 'neutral', 'light', 'dark'] as const) expect(hit(['plate'], e)).toBe(100);
    expect(hit(['plate_5'], 'fire')).toBeLessThan(100);
    expect(hit(['plate_5'], 'fire')).toBe(hit(['plate_5'], 'dark'));
  });

  it('炎の指輪は炎を減らし、逆の氷は増やす（耐性の半分）。ほかの属性は変わらない', () => {
    expect(hit(['ring_fire_3'], 'fire')).toBe(70);
    expect(hit(['ring_fire_3'], 'ice')).toBe(115); // 100 × 1.15 = 115
    expect(hit(['ring_fire_3'], 'neutral')).toBe(100);
    expect(hit(['ring_ice_3'], 'ice')).toBe(70);
    expect(hit(['ring_ice_3'], 'fire')).toBe(115);
  });

  it('複合属性には、成分の半分だけ効く（耐性も弱点も）', () => {
    // 光＝炎50＋無属性50。炎の指輪は炎の50だけを0.7倍
    expect(hit(['ring_fire_3'], 'light')).toBe(Math.ceil(50 * 0.7 + 50));
    // 闇＝氷50＋無属性50。炎の指輪の弱点は、氷の50だけに掛かる（1.15倍）
    expect(hit(['ring_fire_3'], 'dark')).toBe(Math.ceil(50 * 1.15 + 50));
    expect(hit(['ring_ice_3'], 'dark')).toBe(Math.ceil(50 * 0.7 + 50));
    expect(hit(['ring_ice_3'], 'light')).toBe(Math.ceil(50 * 1.15 + 50));
  });

  it('無属性の指輪は無属性に効き、光と闇にも半分効く。弱点はない', () => {
    expect(hit(['ring_neutral_3'], 'neutral')).toBe(70);
    expect(hit(['ring_neutral_3'], 'light')).toBe(Math.ceil(50 + 50 * 0.7));
    expect(hit(['ring_neutral_3'], 'dark')).toBe(Math.ceil(50 + 50 * 0.7));
    expect(hit(['ring_neutral_3'], 'fire')).toBe(100);
    expect(hit(['ring_neutral_3'], 'ice')).toBe(100);
  });

  it('光・闇の指輪は、その属性を丸ごと減らし、逆の属性を丸ごと増やす', () => {
    expect(hit(['ring_light_3'], 'light')).toBe(70);
    expect(hit(['ring_light_3'], 'dark')).toBe(115);
    expect(hit(['ring_light_3'], 'fire')).toBe(100);
    expect(hit(['ring_dark_3'], 'dark')).toBe(70);
    expect(hit(['ring_dark_3'], 'light')).toBe(115);
    expect(hit(['ring_dark_3'], 'neutral')).toBe(100);
  });

  it('万能の指輪は、すべての属性に少しずつ効く。弱点はない', () => {
    for (const e of ['fire', 'ice', 'neutral', 'light', 'dark'] as const) expect(hit(['ring_all_3'], e)).toBe(85); // 100 × 0.85 = 85
  });

  it('二重耐性の指輪は、2つの属性にそれぞれ効く。弱点はない', () => {
    expect(hit(['ring_dual_fire_ice_3'], 'fire')).toBe(70);
    expect(hit(['ring_dual_fire_ice_3'], 'ice')).toBe(70);
    expect(hit(['ring_dual_fire_ice_3'], 'neutral')).toBe(100);
    expect(hit(['ring_dual_fire_light_3'], 'light')).toBe(Math.ceil((50 * 0.7 + 50) * 0.7)); // 光の指輪の分と、炎の分が掛かる
    expect(hit(['ring_dual_light_dark_3'], 'dark')).toBe(70);
    expect(hit(['ring_dual_light_dark_3'], 'light')).toBe(70);
  });

  it('ちがう指輪は掛け算になる（効かない指輪は、そのまま）', () => {
    // 光（炎50＋無属性50）：炎の指輪で炎が0.7倍、光の指輪で全体が0.7倍
    expect(hit(['ring_fire_3', 'ring_light_3'], 'light')).toBe(Math.ceil((50 * 0.7 + 50) * 0.7));
    // 炎の指輪と氷の指輪：炎の攻撃は 0.7（耐性）× 1.15（氷の指輪の弱点）
    expect(hit(['ring_fire_3', 'ring_ice_3'], 'fire')).toBe(Math.ceil(100 * 0.7 * 1.15));
    expect(hit(['ring_fire_3', 'ring_ice_3'], 'neutral')).toBe(100);
    expect(hit(['ring_fire_3', 'ring_all_3'], 'fire')).toBe(Math.ceil(100 * 0.7 * 0.85));
  });

  it('弱点の大きさは、耐性に比例する（耐性が大きいほど、弱点も大きい）', () => {
    expect(hit(['ring_fire_1'], 'ice')).toBe(Math.ceil(100 * 1.05));
    expect(hit(['ring_fire_5'], 'ice')).toBe(Math.ceil(100 * 1.25));
    expect(elementGuards('fire', 30, 0)).toEqual([{ kind: 'component', component: 'fire', rate: 0.7 }]); // 弱点0なら、弱点はない
    expect(elementGuards('neutral', 30, 50)).toHaveLength(1); // 無属性に逆はない
  });

  it('攻撃が守り以下でも、最低10（指輪の耐性・弱点は、そのあとに掛かる）', () => {
    expect(enemyHitDamage(buildPlayer([]), { ...attacker('neutral'), atk: 1 })).toBe(10);
    expect(enemyHitDamage(buildPlayer(['ring_fire_5']), { ...attacker('fire'), atk: 1 })).toBe(5);
  });
});

describe('敵の物理の倍率（physical）', () => {
  it('武器で殴ったダメージに掛かる。省略は1倍。体質の相性とは別にさらに掛かる', () => {
    const p = buildPlayer(['sword']);
    const base = target('normal');
    const plain = playerHitDamage(p, base);
    expect(playerHitDamage(p, { ...base, physical: 1 })).toBe(plain);
    expect(playerHitDamage(p, { ...base, physical: 1.5 })).toBe(Math.round(plain * 1.5));
    expect(playerHitDamage(p, { ...base, physical: 0.5 })).toBeLessThan(plain);
    const soft = target('soft');
    expect(playerHitDamage(p, { ...soft, physical: 1.5 })).toBeGreaterThan(playerHitDamage(p, soft)); // 剣はやわらかい体に1.5倍で、さらに掛かる
    expect(playerHitDamage(p, { ...base, physical: 0.1 })).toBeGreaterThanOrEqual(1);
  });
});

describe('playerHitDamage（武器と体質）', () => {
  // 武器ありの攻撃力9、防御0の敵なら基礎ダメージ9
  const dmg = (weapon: ItemId, body: EnemyDef['body']) => playerHitDamage(buildPlayer([weapon]), target(body));

  it('剣は柔らかい敵に強く、硬い敵・霊体に弱い', () => {
    expect(dmg('sword', 'soft')).toBeGreaterThan(dmg('sword', 'normal'));
    expect(dmg('sword', 'hard')).toBeLessThan(dmg('sword', 'normal'));
    expect(dmg('sword', 'spirit')).toBeLessThan(dmg('sword', 'hard'));
  });

  it('槌は硬い敵に、杖は霊体に強い', () => {
    expect(dmg('hammer', 'hard')).toBeGreaterThan(dmg('sword', 'hard'));
    expect(dmg('staff', 'spirit')).toBeGreaterThan(dmg('hammer', 'spirit'));
    expect(dmg('staff', 'soft')).toBeLessThan(dmg('sword', 'soft'));
  });

  it('素手はどの体質にも同じ', () => {
    const p = buildPlayer([]);
    const values = (['normal', 'soft', 'hard', 'spirit'] as const).map((b) => playerHitDamage(p, target(b)));
    expect(new Set(values).size).toBe(1);
  });

  it('防御の高い敵ほど通りにくい', () => {
    const p = buildPlayer(['hammer']);
    expect(playerHitDamage(p, ARMORED_ENEMY)).toBeLessThan(playerHitDamage(p, { ...ARMORED_ENEMY, def: 0 }));
  });
});

describe('playerHitDamage（属性付与）', () => {
  // 素手・攻撃力60、防御0、普通の体質の敵なら基礎ダメージ60
  const withEnchant = (element: Element): PlayerStats => ({ ...buildPlayer([]), enchant: { element, hits: 5 } });
  const dmg = (enchant: Element, enemy: Element) => playerHitDamage(withEnchant(enchant), target('normal', enemy));

  it('弱点を突くと2倍、複合属性の弱点の成分なら1.5倍', () => {
    expect(dmg('fire', 'ice')).toBe(120);
    expect(dmg('fire', 'dark')).toBe(90);
    expect(dmg('ice', 'fire')).toBe(120);
    expect(dmg('ice', 'light')).toBe(90);
    expect(dmg('light', 'dark')).toBe(120);
    expect(dmg('dark', 'light')).toBe(120);
  });

  it('同じ属性には半分、同じ成分を含む複合属性には0.75倍', () => {
    expect(dmg('fire', 'fire')).toBe(30);
    expect(dmg('fire', 'light')).toBe(Math.round(60 * 0.75));
    expect(dmg('light', 'light')).toBe(30);
  });

  it('関係のない属性には効果がない', () => {
    expect(dmg('fire', 'neutral')).toBe(60);
    expect(dmg('light', 'fire')).toBe(60);
  });
});
