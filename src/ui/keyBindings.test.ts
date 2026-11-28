// キーの割り当て（src/ui/keyBindings.ts）
import { describe, expect, it } from 'vitest';
import { BIND_IDS, DEFAULT_BINDINGS, canBind, keyCommand, keyLabel, parseBindings, rebind, spellKeys } from './keyBindings';

describe('キーの割り当て', () => {
  it('ふだんの割り当て：WASD・スペース・Z〜B・F・Q・G。どれも重ならない', () => {
    const d = DEFAULT_BINDINGS;
    expect(keyCommand('w', d)).toEqual({ kind: 'dir', dir: 'up' });
    expect(keyCommand('D', d)).toEqual({ kind: 'dir', dir: 'right' }); // 大文字でも
    expect(keyCommand(' ', d)).toEqual({ kind: 'wait' });
    expect(keyCommand('x', d)).toEqual({ kind: 'spell', index: 1 });
    expect(keyCommand('f', d)).toEqual({ kind: 'skill' });
    expect(keyCommand('q', d)).toEqual({ kind: 'swap' });
    expect(keyCommand('g', d)).toEqual({ kind: 'stairs' });
    expect(keyCommand('k', d)).toBeNull();
    expect(new Set(BIND_IDS.map((id) => d[id])).size).toBe(BIND_IDS.length);
    expect(spellKeys(d)).toEqual(['z', 'x', 'c', 'v', 'b']);
  });

  it('矢印キーと「.」は、割り当てを変えてもいつでも使える', () => {
    const b = rebind(DEFAULT_BINDINGS, 'up', 'i');
    expect(keyCommand('ArrowUp', b)).toEqual({ kind: 'dir', dir: 'up' });
    expect(keyCommand('.', b)).toEqual({ kind: 'wait' });
    expect(keyCommand('i', b)).toEqual({ kind: 'dir', dir: 'up' });
    expect(keyCommand('w', b)).toBeNull();
  });

  it('ほかの操作が使っているキーにすると、入れ替わる', () => {
    const b = rebind(DEFAULT_BINDINGS, 'stairs', 'Q');
    expect(b.stairs).toBe('q');
    expect(b.swap).toBe('g');
  });

  it('数字・矢印・Enter・Esc・「.」には割り当てられない', () => {
    for (const k of ['1', '9', 'ArrowLeft', 'Enter', 'Escape', '.', 'Shift', 'F1']) {
      expect(canBind(k)).toBe(false);
      expect(rebind(DEFAULT_BINDINGS, 'skill', k)).toEqual(DEFAULT_BINDINGS);
    }
    expect(canBind('e')).toBe(true);
    expect(canBind(' ')).toBe(true);
  });

  it('保存を読む：おかしなキーはその操作だけ戻し、重なっていればすべて戻す', () => {
    expect(parseBindings({ ...DEFAULT_BINDINGS, skill: 'E' }).skill).toBe('e');
    expect(parseBindings({ ...DEFAULT_BINDINGS, skill: '5' }).skill).toBe('f');
    expect(parseBindings({ ...DEFAULT_BINDINGS, skill: 'q' })).toEqual(DEFAULT_BINDINGS);
    expect(parseBindings(null)).toEqual(DEFAULT_BINDINGS);
  });

  it('キーの名前：スペースは Space、文字は大文字', () => {
    expect(keyLabel(' ')).toBe('Space');
    expect(keyLabel('z')).toBe('Z');
  });
});
