// 操作の説明を自動で開くか（controlsHelp.ts）
import { describe, expect, it } from 'vitest';
import { COMMON_HELP, countStickUse, KEYBOARD_HELP, keyboardHelp, markHelpSeen, shouldAutoOpenHelp, shouldShowStickHint, STICK_HINT_UNTIL, TOUCH_HELP } from './controlsHelp';
import { DEFAULT_BINDINGS, rebind } from './keyBindings';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('操作の説明', () => {
  it('まだ見ていなければ自動で開き、見たら開かない', () => {
    const s = memory();
    expect(shouldAutoOpenHelp(s)).toBe(true);
    markHelpSeen(s);
    expect(shouldAutoOpenHelp(s)).toBe(false);
  });

  it('保存が読めない環境では、自動では開かない（毎回じゃまにならないように）', () => {
    expect(shouldAutoOpenHelp(null)).toBe(false);
    const broken = { getItem: () => { throw new Error('denied'); } };
    expect(shouldAutoOpenHelp(broken)).toBe(false);
    expect(() => markHelpSeen({ setItem: () => { throw new Error('full'); } })).not.toThrow();
  });

  it('説明のキーは、実際の割り当てと同じ', () => {
    const keys = KEYBOARD_HELP.map((r) => r.how).join(' ');
    expect(keys).toContain('Z X C V B');
    expect(keys).toContain('W A S D');
    for (const k of ['F', 'Q', 'G']) expect(keys).toContain(k);
    expect(KEYBOARD_HELP).toEqual(keyboardHelp(DEFAULT_BINDINGS));
    // 割り当てを変えると、説明も変わる
    const changed = keyboardHelp(rebind(DEFAULT_BINDINGS, 'stairs', 'e'));
    expect(changed.find((r) => r.what.startsWith('見つけた階段'))!.how).toBe('E');
    expect(TOUCH_HELP.length).toBeGreaterThan(0);
    expect(COMMON_HELP.length).toBeGreaterThan(0);
  });
});

describe('なぞって歩く目印', () => {
  it('決まった回数なぞるまで出し、そのあとは出さない', () => {
    const s = memory();
    expect(shouldShowStickHint(s)).toBe(true);
    for (let i = 1; i < STICK_HINT_UNTIL; i++) expect(countStickUse(s)).toBe(true);
    expect(countStickUse(s)).toBe(false);
    expect(shouldShowStickHint(s)).toBe(false);
  });
});
