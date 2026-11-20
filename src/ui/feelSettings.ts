// 手応えの設定（2026-11-20。docs/combat-fun-spec.md ⑥）：画面の揺れと、ヒットストップ（当てた一瞬、画面が止まる）を、切れるようにする。
// ブラウザに保存し、次に遊ぶときも同じ設定にする。音の設定（audio/settings.ts）と同じ作りで、画面は SoundButton の設定のなかに出す

export type FeelSettings = {
  /** 画面の揺れ（呪文・ボスの咆哮の揺れ、攻撃したときの寄り引き、低いHPの赤いふちの脈打ち）を出すか */
  shake: boolean;
  /** ヒットストップ（当てた一瞬、画面が止まる）を出すか */
  hitStop: boolean;
};

export const DEFAULT_FEEL_SETTINGS: FeelSettings = { shake: true, hitStop: true };

const KEY = 'dungeon-rogue:feel';

/** 保存された文字列から設定を読む。形がおかしいところ・ないところは、ふだんの設定にする */
export function parseFeelSettings(raw: string | null): FeelSettings {
  if (!raw) return { ...DEFAULT_FEEL_SETTINGS };
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return { ...DEFAULT_FEEL_SETTINGS };
    const { shake, hitStop } = data as Record<string, unknown>;
    return {
      shake: typeof shake === 'boolean' ? shake : DEFAULT_FEEL_SETTINGS.shake,
      hitStop: typeof hitStop === 'boolean' ? hitStop : DEFAULT_FEEL_SETTINGS.hitStop,
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
  for (const fn of listeners) fn();
}

/** 設定が変わったときに呼ぶ関数を登録する（外すための関数を返す。useSyncExternalStore 用） */
export function subscribeFeel(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
