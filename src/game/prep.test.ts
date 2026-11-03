import { describe, expect, it } from 'vitest';
import { PREP_CONFIG } from './data';
import { buyItem, createPrep, endDay, finishPrep, playCard, toPlayerView } from './prep';
import type { CardId, PrepState, Result } from './types';

// テスト用：手札を指定した状態を作る
function stateWithHand(cards: CardId[], overrides: Partial<PrepState> = {}): PrepState {
  const base = createPrep(1);
  return {
    ...base,
    hand: cards.map((cardId, i) => ({ uid: `t${i}`, cardId })),
    ...overrides,
  };
}

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('createPrep', () => {
  it('同じシードなら同じ特性と手札になる', () => {
    const a = createPrep(42);
    const b = createPrep(42);
    expect(a.trait).toBe(b.trait);
    expect(a.hand).toEqual(b.hand);
  });

  it('手札の枚数は設定どおり', () => {
    expect(createPrep(7).hand).toHaveLength(PREP_CONFIG.handSize);
  });

  it('持ち越したカードは手札の枠を使う', () => {
    const carried = [
      { uid: 'old1', cardId: 'informant' as const },
      { uid: 'old2', cardId: 'work' as const },
    ];
    const state = createPrep(7, carried);
    expect(state.hand).toHaveLength(PREP_CONFIG.handSize);
    expect(state.hand.slice(0, 2)).toEqual(carried);
  });

  it('シードによって特性は両方とも出る', () => {
    const traits = new Set(Array.from({ length: 50 }, (_, i) => createPrep(i).trait));
    expect(traits).toEqual(new Set(['fire', 'poison']));
  });
});

describe('playCard', () => {
  it('1日に2枚は使えない', () => {
    const s1 = unwrap(playCard(stateWithHand(['work', 'work']), 't0'));
    const r = playCard(s1, 't1');
    expect(r.ok).toBe(false);
  });

  it('日雇い仕事でお金が増え、カードは手札から消える', () => {
    const s = unwrap(playCard(stateWithHand(['work'], { gold: 0 }), 't0'));
    expect(s.gold).toBe(40);
    expect(s.hand).toHaveLength(0);
    expect(s.played).toHaveLength(1);
  });

  it('情報屋はお金を払えば特性が確実にわかる', () => {
    const s = unwrap(playCard(stateWithHand(['informant'], { gold: 30 }), 't0'));
    expect(s.gold).toBe(0);
    expect(s.knowledge).toMatchObject({ status: 'known', trait: s.trait, source: 'informant' });
  });

  it('お金が足りないと情報屋は使えず、カードも消費されない', () => {
    const before = stateWithHand(['informant'], { gold: 10 });
    const r = playCard(before, 't0');
    expect(r.ok).toBe(false);
    expect(before.hand).toHaveLength(1);
  });

  it('噂はおよそ設定した確率で特性がわかる', () => {
    let hits = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      const s = unwrap(playCard(stateWithHand(['rumor'], { rngState: i * 7919 }), 't0'));
      if (s.knowledge.status === 'known') hits++;
    }
    expect(hits / trials).toBeGreaterThan(0.4);
    expect(hits / trials).toBeLessThan(0.6);
  });
});

describe('buyItem', () => {
  it('その日に行った店でしか買えない', () => {
    const s = unwrap(playCard(stateWithHand(['armor_shop'], { gold: 100 }), 't0'));
    expect(buyItem(s, 'potion').ok).toBe(false);
    const bought = unwrap(buyItem(s, 'fire_cloak'));
    expect(bought.inventory).toEqual(['fire_cloak']);
    expect(bought.gold).toBe(60);
  });

  it('翌日になると店は閉まる', () => {
    const s = unwrap(endDay(unwrap(playCard(stateWithHand(['item_shop'], { gold: 100 }), 't0'))));
    expect(buyItem(s, 'potion').ok).toBe(false);
  });

  it('お金が足りないと買えない', () => {
    const s = unwrap(playCard(stateWithHand(['armor_shop'], { gold: 10 }), 't0'));
    expect(buyItem(s, 'fire_cloak').ok).toBe(false);
  });
});

describe('準備の流れ全体', () => {
  it('最終日を終えると探索に出られ、余りカードを持ち越せる', () => {
    let s = stateWithHand(['work', 'informant', 'armor_shop', 'rumor', 'item_shop'], { gold: 0 });

    s = unwrap(playCard(s, 't0')); // 1日目：稼ぐ（40G）
    s = unwrap(endDay(s));
    s = unwrap(playCard(s, 't1')); // 2日目：情報屋（-30G）
    s = unwrap(endDay(s));
    expect(s.knowledge.status).toBe('known');

    expect(finishPrep(s, []).ok).toBe(false); // まだ3日目が残っている

    s = unwrap(playCard(s, 't2')); // 3日目：防具屋
    s = unwrap(endDay(s));
    expect(s.phase).toBe('ready');
    expect(playCard(s, 't3').ok).toBe(false);

    const result = unwrap(finishPrep(s, ['t3']));
    expect(result.carried).toEqual([{ uid: 't3', cardId: 'rumor' }]);
    expect(s.hand).toHaveLength(2); // 5枚配られて3枚使い、2枚余る
  });

  it('持ち越し上限を超えられない', () => {
    const s: PrepState = { ...stateWithHand(['work', 'work', 'work', 'work']), phase: 'ready' };
    expect(finishPrep(s, ['t0', 't1', 't2', 't3']).ok).toBe(false);
  });
});

describe('toPlayerView', () => {
  it('UI向けの状態には正解の特性と乱数状態が含まれない', () => {
    const view = toPlayerView(createPrep(3));
    expect(view).not.toHaveProperty('trait');
    expect(view).not.toHaveProperty('rngState');
    expect(view).not.toHaveProperty('seed');
  });
});
