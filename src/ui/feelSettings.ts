// 手応えの設定（2026-11-20。docs/combat-fun-spec.md ⑥）：画面の揺れと、ヒットストップ（当てた一瞬、画面が止まる）を、切れるようにする。
// ブラウザに保存し、次に遊ぶときも同じ設定にする。音の設定（audio/settings.ts）と同じ作り。
// 2026-11-28：設定の画面（SettingsDialog.tsx）を作り、文字の大きさ・頭上の弱点の印・キーの割り当ても、ここに入れた

import { DEFAULT_BINDINGS, parseBindings, type KeyBindings } from './keyBindings';

export const TEXT_SIZES = ['small', 'normal', 'large'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
/** 文字の大きさごとの、ページの基準の文字の大きさ（画面の大きさはほとんど rem で決めているので、全体が同じ割合で大きくなる） */
export const TEXT_SCALE: Record<TextSize, number> = { small: 0.9, normal: 1, large: 1.15 };
export const TEXT_SIZE_NAMES: Record<TextSize, string> = { small: '小', normal: '中', large: '大' };

export type FeelSettings = {
  /** 画面の揺れ（呪文・ボスの咆哮の揺れ、攻撃したときの寄り引き、低いHPの赤いふちの脈打ち）を出すか */
  shake: boolean;
  /** ヒットストップ（当てた一瞬、画面が止まる）を出すか */
  hitStop: boolean;
  /** 敵の頭上に、弱点の印を出すか */
  weakMarks: boolean;
  /** 文字の大きさ */
  textSize: TextSize;
  /** キーの割り当て */
  keys: KeyBindings;
};

export const DEFAULT_FEEL_SETTINGS: FeelSettings = { shake: true, hitStop: true, weakMarks: true, textSize: 'normal', keys: DEFAULT_BINDINGS };

const KEY = 'dungeon-rogue:feel';

/** 保存された文字列から設定を読む。形がおかしいところ・ないところは、ふだんの設定にする */
export function parseFeelSettings(raw: string | null): FeelSettings {
  if (!raw) return { ...DEFAULT_FEEL_SETTINGS };
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return { ...DEFAULT_FEEL_SETTINGS };
    const { shake, hitStop, weakMarks, textSize, keys } = data as Record<string, unknown>;
    return {
      shake: typeof shake === 'boolean' ? shake : DEFAULT_FEEL_SETTINGS.shake,
      hitStop: typeof hitStop === 'boolean' ? hitStop : DEFAULT_FEEL_SETTINGS.hitStop,
      weakMarks: typeof weakMarks === 'boolean' ? weakMarks : DEFAULT_FEEL_SETTINGS.weakMarks,
      textSize: TEXT_SIZES.includes(textSize as TextSize) ? (textSize as TextSize) : DEFAULT_FEEL_SETTINGS.textSize,
      keys: parseBindings(keys),
    };
  } catch {
    return { ...DEFAULT_FEEL_SETTINGS };
  }
}

function load(): FeelSettings {
  try {
    return parseFeelSettings(localStorage.getItem(KEY));
  } catch {
    return { ...DEFAULT_FEEL_SETTINGS };
  }
}

let settings: FeelSettings | null = null;
const listeners = new Set<() => void>();

export function feelSettings(): FeelSettings {
  settings ??= load();
  return settings;
}

/** 設定を変えて保存する。見ている画面にもすぐ知らせる */
export function setFeelSettings(next: FeelSettings) {
  settings = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 保存できなくても、このあいだは設定のとおりに動く
  }
  applyTextSize(next.textSize);
  for (const fn of listeners) fn();
}

/** 文字の大きさを、ページに当てる（起動したときと、設定を変えたときに呼ぶ） */
export function applyTextSize(size: TextSize = feelSettings().textSize) {
  if (typeof document === 'undefined') return;
  document.documentElement.style.fontSize = size === 'normal' ? '' : `${TEXT_SCALE[size] * 100}%`;
}

/** 設定が変わったときに呼ぶ関数を登録する（外すための関数を返す。useSyncExternalStore 用） */
export function subscribeFeel(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
