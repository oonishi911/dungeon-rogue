// セーブデータをブラウザに保存する。
// プライベートブラウズなどで localStorage が使えないこともあるので、失敗しても遊べるようにする。

import { parseSave, type SaveData } from './game/save';

const KEY = 'dungeon-prep/save';

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
