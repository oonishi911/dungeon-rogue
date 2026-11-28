// 操作の説明を自動で開くか（controlsHelp.ts）
import { describe, expect, it } from 'vitest';
import { COMMON_HELP, KEYBOARD_HELP, markHelpSeen, shouldAutoOpenHelp, TOUCH_HELP } from './controlsHelp';
import { SKILL_KEY, SPELL_KEYS, SWAP_KEY } from './exploreKeys';

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
    expect(keys).toContain(SPELL_KEYS.join(' ').toUpperCase());
    expect(keys).toContain(SKILL_KEY.toUpperCase());
    expect(keys).toContain(SWAP_KEY.toUpperCase());
    expect(TOUCH_HELP.length).toBeGreaterThan(0);
    expect(COMMON_HELP.length).toBeGreaterThan(0);
  });
});
