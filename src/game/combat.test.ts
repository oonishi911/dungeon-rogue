import { describe, expect, it } from 'vitest';
import { act, buildPlayer, enemyHitDamage, startCombat } from './combat';
import { COMBAT_CONFIG, ENEMIES } from './data';
import type { CombatState, Result } from './types';

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('buildPlayer', () => {
  it('剣を持つと攻撃力が上がる', () => {
    expect(buildPlayer(['iron_sword']).atk).toBe(COMBAT_CONFIG.playerAtk + COMBAT_CONFIG.swordAtk);
  });

  it('防具は1つだけ装備し、選ばなければ最初の1つ', () => {
    expect(buildPlayer(['poison_cloak', 'fire_cloak']).armor).toBe('poison_cloak');
    expect(buildPlayer(['poison_cloak', 'fire_cloak'], 'fire_cloak').armor).toBe('fire_cloak');
  });

  it('消費アイテムだけが戦闘中に使える持ち物になる', () => {
    expect(buildPlayer(['iron_sword', 'potion', 'antidote']).consumables).toEqual(['potion', 'antidote']);
  });
});

describe('耐性', () => {
  it('耐火のマントで炎のダメージが大きく減る', () => {
    const drake = ENEMIES.fire_drake;
    const plain = enemyHitDamage(buildPlayer([]), drake);
    const resisted = enemyHitDamage(buildPlayer(['fire_cloak']), drake);
    expect(resisted).toBeLessThan(plain / 2);
  });

  it('逆の耐性のマントでは炎は減らない', () => {
    const drake = ENEMIES.fire_drake;
    expect(enemyHitDamage(buildPlayer(['poison_cloak']), drake)).toBe(enemyHitDamage(buildPlayer([]), drake));
  });

  it('毒の敵に攻撃されると毒になり、毎ラウンドダメージを受ける', () => {
    const s = unwrap(act(startCombat(buildPlayer([]), 'venom_queen'), { kind: 'attack' }));
    const hit = ENEMIES.venom_queen.atk - COMBAT_CONFIG.playerDef;
    expect(s.player.hp).toBe(COMBAT_CONFIG.playerHp - hit - COMBAT_CONFIG.poisonDamage);
    expect(s.player.poisonTurns).toBe(COMBAT_CONFIG.poisonTurns - 1);
  });

  it('防毒のマントがあれば毒にならない', () => {
    const s = unwrap(act(startCombat(buildPlayer(['poison_cloak']), 'venom_queen'), { kind: 'attack' }));
    expect(s.player.poisonTurns).toBe(0);
  });
});

describe('act', () => {
  it('敵を倒すと勝利し、反撃は受けない', () => {
    const start: CombatState = { ...startCombat(buildPlayer([]), 'goblin'), enemy: { id: 'goblin', hp: 1 } };
    const s = unwrap(act(start, { kind: 'attack' }));
    expect(s.outcome).toBe('won');
    expect(s.player.hp).toBe(COMBAT_CONFIG.playerHp);
  });

  it('HPが0になると敗北する', () => {
    const weak = { ...buildPlayer([]), hp: 1 };
    const s = unwrap(act(startCombat(weak, 'flame_hound'), { kind: 'attack' }));
    expect(s.outcome).toBe('lost');
    expect(s.player.hp).toBe(0);
  });

  it('回復薬は最大HPを超えて回復しない', () => {
    const s = unwrap(act(startCombat(buildPlayer(['potion']), 'goblin'), { kind: 'use_item', item: 'potion' }));
    expect(s.player.consumables).toEqual([]);
    expect(s.player.hp).toBeLessThan(COMBAT_CONFIG.playerHp); // 満タンから回復→ゴブリンの攻撃
  });

  it('毒消しで毒が治る', () => {
    const poisoned = { ...buildPlayer(['antidote']), poisonTurns: 3 };
    const s = unwrap(act(startCombat(poisoned, 'goblin'), { kind: 'use_item', item: 'antidote' }));
    expect(s.player.poisonTurns).toBe(0);
  });

  it('氷の巻物は炎の敵に大ダメージ', () => {
    const s = unwrap(act(startCombat(buildPlayer(['frost_scroll']), 'fire_drake'), { kind: 'use_item', item: 'frost_scroll' }));
    expect(s.enemy.hp).toBe(ENEMIES.fire_drake.hp - COMBAT_CONFIG.frostVsFire);
  });

  it('持っていないアイテムや装備品は使えない', () => {
    const start = startCombat(buildPlayer(['iron_sword']), 'goblin');
    expect(act(start, { kind: 'use_item', item: 'potion' }).ok).toBe(false);
    expect(act(start, { kind: 'use_item', item: 'iron_sword' }).ok).toBe(false);
  });

  it('終わった戦闘では行動できない', () => {
    const done: CombatState = { ...startCombat(buildPlayer([]), 'goblin'), outcome: 'won' };
    expect(act(done, { kind: 'attack' }).ok).toBe(false);
  });
});
