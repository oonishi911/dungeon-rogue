import { describe, expect, it } from 'vitest';
import { buildPlayer, enemyHitDamage, playerHitDamage } from './combat';
import { COMBAT_CONFIG } from './data';
import { ARMORED_ENEMY } from './enemies.fixtures';
import type { Element, EnemyDef, ItemId, PlayerStats } from './types';

/** 属性だけを変えた、攻撃力11・防御0の敵（プレイヤーの防御1を引くと基礎ダメージ10） */
function attacker(element: Element): EnemyDef {
  return { id: 'goblin', name: 'テスト', hp: 10, atk: 11, def: 0, element, body: 'normal' };
}

/** 体質だけを変えた、防御0の敵 */
function target(body: EnemyDef['body'], element: Element = 'neutral'): EnemyDef {
  return { id: 'goblin', name: 'テスト', hp: 10, atk: 1, def: 0, element, body };
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

  it('武器を持つと攻撃力が上がる', () => {
    expect(buildPlayer(['sword']).atk).toBe(COMBAT_CONFIG.playerAtk + 3);
    // 段階が上がるほど、攻撃力・守りが上がる
    expect(buildPlayer(['sword_5']).atk).toBeGreaterThan(buildPlayer(['sword']).atk);
    expect(buildPlayer(['plate_5']).def).toBeGreaterThan(buildPlayer(['plate']).def);
    expect(buildPlayer([]).atk).toBe(COMBAT_CONFIG.playerAtk);
  });
});

describe('enemyHitDamage（防具と属性）', () => {
  it('防具なしなら属性に関係なく同じ', () => {
    for (const e of ['fire', 'ice', 'neutral', 'light', 'dark'] as const) expect(hit([], e)).toBe(10);
  });

  it('マントは対応する属性を大きく減らし、ほかの属性には効かない', () => {
    expect(hit(['fire_cloak'], 'fire')).toBe(3);
    expect(hit(['fire_cloak'], 'ice')).toBe(10);
    expect(hit(['ice_cloak'], 'ice')).toBe(3);
  });

  it('複合属性には、成分の半分だけ効く', () => {
    // 光＝炎5＋無属性5。耐火のマントは炎の5だけを0.3倍
    expect(hit(['fire_cloak'], 'light')).toBe(Math.ceil(5 * 0.3 + 5));
    expect(hit(['ice_cloak'], 'light')).toBe(10);
    expect(hit(['ice_cloak'], 'dark')).toBe(Math.ceil(5 * 0.3 + 5));
  });

  it('鎧は無属性に弱めに効き、光と闇にも半分効く（保険）', () => {
    expect(hit(['plate'], 'neutral')).toBe(6);
    expect(hit(['plate'], 'light')).toBe(Math.ceil(5 + 5 * 0.6));
    expect(hit(['plate'], 'dark')).toBe(Math.ceil(5 + 5 * 0.6));
    expect(hit(['plate'], 'fire')).toBe(10);
  });

  it('専用防具はその属性を丸ごと減らし、ほかには効かない', () => {
    expect(hit(['light_robe'], 'light')).toBe(3);
    expect(hit(['light_robe'], 'fire')).toBe(10);
    expect(hit(['dark_robe'], 'dark')).toBe(3);
    expect(hit(['dark_robe'], 'neutral')).toBe(10);
  });

  it('ダメージは最低1', () => {
    expect(enemyHitDamage(buildPlayer(['fire_cloak']), { ...attacker('fire'), atk: 1 })).toBe(1);
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
  // 素手・攻撃力6、防御0、普通の体質の敵なら基礎ダメージ6
  const withEnchant = (element: Element): PlayerStats => ({ ...buildPlayer([]), enchant: { element, hits: 5 } });
  const dmg = (enchant: Element, enemy: Element) => playerHitDamage(withEnchant(enchant), target('normal', enemy));

  it('弱点を突くと2倍、複合属性の弱点の成分なら1.5倍', () => {
    expect(dmg('fire', 'ice')).toBe(12);
    expect(dmg('fire', 'dark')).toBe(9);
    expect(dmg('ice', 'fire')).toBe(12);
    expect(dmg('ice', 'light')).toBe(9);
    expect(dmg('light', 'dark')).toBe(12);
    expect(dmg('dark', 'light')).toBe(12);
  });

  it('同じ属性には半分、同じ成分を含む複合属性には0.75倍', () => {
    expect(dmg('fire', 'fire')).toBe(3);
    expect(dmg('fire', 'light')).toBe(Math.round(6 * 0.75));
    expect(dmg('light', 'light')).toBe(3);
  });

  it('関係のない属性には効果がない', () => {
    expect(dmg('fire', 'neutral')).toBe(6);
    expect(dmg('light', 'fire')).toBe(6);
  });
});
