// セーブデータをブラウザに保存する。
// プライベートブラウズなどで localStorage が使えないこともあるので、失敗しても遊べるようにする。

import { parseSoundSettings, type SoundSettings } from './audio/settings';
import { parseSave, type SaveData } from './game/save';

const KEY = 'dungeon-prep/save';
const SOUND_KEY = 'dungeon-prep/sound';

export function loadSave(): SaveData | null {
  try {
    return parseSave(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 保存できなくても遊び続けられる
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 消せなくても次の読み込みで形を確かめるので問題ない
  }
}

/** 効果音の設定（オン・オフと音量）。読めなければ、ふだんの設定 */
export function loadSoundSettings(): SoundSettings {
  try {
    return parseSoundSettings(localStorage.getItem(SOUND_KEY));
  } catch {
    return parseSoundSettings(null);
  }
}

export function writeSoundSettings(settings: SoundSettings): void {
  try {
    localStorage.setItem(SOUND_KEY, JSON.stringify(settings));
  } catch {
    // 保存できなくても、この回のあいだは設定どおりに鳴る
  }
}
