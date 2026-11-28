// キーの割り当て（2026-11-28、設定の画面で変えられる）。
// 変えられるのは、歩く（上下左右）・待つ・呪文1〜5・武器の技・持ち替え・階段へ。
// 矢印キー（歩く）・「.」（待つ）・1〜9（道具）・Enter と Esc（構えて唱える・やめる）は、いつでも同じ働きで、ほかの操作には割り当てられない

import type { Dir } from '../game/exploreTypes';

export const BIND_IDS = ['up', 'down', 'left', 'right', 'wait', 'spell1', 'spell2', 'spell3', 'spell4', 'spell5', 'skill', 'swap', 'stairs'] as const;
export type BindId = (typeof BIND_IDS)[number];
export type KeyBindings = Record<BindId, string>;

export const DEFAULT_BINDINGS: KeyBindings = {
  up: 'w',
  down: 's',
  left: 'a',
  right: 'd',
  wait: ' ',
  spell1: 'z',
  spell2: 'x',
  spell3: 'c',
  spell4: 'v',
  spell5: 'b',
  skill: 'f',
  swap: 'q',
  stairs: 'g',
};

/** 設定の画面に出す、操作の名前 */
export const BIND_NAMES: Record<BindId, string> = {
  up: '上へ歩く',
  down: '下へ歩く',
  left: '左へ歩く',
  right: '右へ歩く',
  wait: '待つ',
  spell1: '呪文1',
  spell2: '呪文2',
  spell3: '呪文3',
  spell4: '呪文4',
  spell5: '呪文5',
  skill: '武器の技',
  swap: '持ち替え',
  stairs: '階段へ',
};

/** いつでも同じ働きのキー（割り当てを変えても、これらは残る） */
const FIXED_DIRS: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
const RESERVED = new Set(['.', 'Enter', 'Escape', 'Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Backspace', ...Object.keys(FIXED_DIRS)]);

/** キーボードのキー（KeyboardEvent.key）を、比べる形にする（1文字のキーは小文字） */
export function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

/** このキーを、変えられる操作に割り当ててよいか（1文字のキーだけ。数字・「.」は道具・待つで使う） */
export function canBind(key: string): boolean {
  const k = normalizeKey(key);
  if (RESERVED.has(k)) return false;
  if (k.length !== 1) return false;
  return !/[0-9]/.test(k);
}

/** 画面に出すキーの名前（スペースは「Space」、文字は大文字） */
export function keyLabel(key: string): string {
  return key === ' ' ? 'Space' : key.toUpperCase();
}

/**
 * 操作に新しいキーを割り当てる。そのキーをほかの操作が使っていたら、その操作には今のキーを渡す（入れ替える）。
 * 割り当てられないキーなら、何も変えない
 */
export function rebind(bindings: KeyBindings, id: BindId, key: string): KeyBindings {
  if (!canBind(key)) return bindings;
  const k = normalizeKey(key);
  const next = { ...bindings, [id]: k };
  const other = BIND_IDS.find((o) => o !== id && bindings[o] === k);
  if (other) next[other] = bindings[id];
  return next;
}

/** 保存されていた割り当てを読む。おかしな割り当て・重なった割り当ては、その操作だけふだんのキーに戻す（それでも重なれば、すべてふだんに戻す） */
export function parseBindings(v: unknown): KeyBindings {
  if (typeof v !== 'object' || v === null) return { ...DEFAULT_BINDINGS };
  const data = v as Record<string, unknown>;
  const out = { ...DEFAULT_BINDINGS };
  for (const id of BIND_IDS) {
    const k = data[id];
    if (typeof k === 'string' && canBind(k)) out[id] = normalizeKey(k);
  }
  const used = BIND_IDS.map((id) => out[id]);
  return new Set(used).size === used.length ? out : { ...DEFAULT_BINDINGS };
}

/** キーを押したときに行う操作 */
export type KeyCommand =
  | { kind: 'dir'; dir: Dir }
  | { kind: 'wait' }
  | { kind: 'spell'; index: number }
  | { kind: 'skill' }
  | { kind: 'swap' }
  | { kind: 'stairs' };

/** 押したキーが、どの操作か（割り当てのないキーなら null。数字キー・Enter・Esc は、ここでは扱わない） */
export function keyCommand(key: string, bindings: KeyBindings): KeyCommand | null {
  const k = normalizeKey(key);
  const fixed = FIXED_DIRS[k];
  if (fixed) return { kind: 'dir', dir: fixed };
  if (k === '.') return { kind: 'wait' };
  const id = BIND_IDS.find((b) => bindings[b] === k);
  if (!id) return null;
  if (id === 'up' || id === 'down' || id === 'left' || id === 'right') return { kind: 'dir', dir: id };
  if (id === 'wait' || id === 'skill' || id === 'swap' || id === 'stairs') return { kind: id };
  return { kind: 'spell', index: Number(id.slice(5)) - 1 };
}

/** 呪文キーの並び（画面のボタンに出す） */
export function spellKeys(bindings: KeyBindings): string[] {
  return [bindings.spell1, bindings.spell2, bindings.spell3, bindings.spell4, bindings.spell5];
}
