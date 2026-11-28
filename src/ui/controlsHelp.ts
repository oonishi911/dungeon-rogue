// 操作の説明（2026-11-28）：初めて探索に入ったときに一度だけ自動で開く。そのあとは「操作」ボタンで開く。
// 見たかどうかはブラウザに保存する（手触りの設定 feelSettings.ts と同じく、読めない・書けない環境では、毎回は開かない）

const KEY = 'dungeon-rogue:controls-seen';

/** 自動で開くか（まだ見ていなければ開く）。保存が読めない環境では開かない（毎回じゃまにならないように） */
export function shouldAutoOpenHelp(storage: Pick<Storage, 'getItem'> | null = safeStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(KEY) !== '1';
  } catch {
    return false;
  }
}

/** 見たことを覚える */
export function markHelpSeen(storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(KEY, '1');
  } catch {
    // 保存できなくても、遊ぶのには困らない
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** 操作の説明の1行（何をすると・どうなる） */
export interface HelpRow {
  how: string;
  what: string;
}

/** キーボードとマウス */
export const KEYBOARD_HELP: HelpRow[] = [
  { how: '矢印キー／W A S D', what: '歩く（押しているあいだ歩き続ける。敵が見えた・宝箱を見つけた・攻撃を受けたら立ち止まる）。敵のいる方へ歩くと攻撃' },
  { how: 'マスをクリック', what: 'そこまで歩く（敵なら攻撃しに行く。歩いている途中にクリックで止まる）' },
  { how: 'スペース', what: 'その場で1ターン待つ' },
  { how: 'Z X C V B', what: '呪文を構える。矢印で向きを変え、同じキーか Enter で唱える（Esc でやめる）' },
  { how: 'F', what: '武器の技（技ゲージが満タンのとき）' },
  { how: 'Q', what: '武器を持ち替える（サブ武器があるとき）' },
  { how: '1〜9', what: '道具を使う' },
  { how: '左上の敵の札', what: '押すと、その敵の方を向く' },
];

/** スマホ（指） */
export const TOUCH_HELP: HelpRow[] = [
  { how: 'マスをタップ', what: 'そこまで歩く（敵なら攻撃しに行く。歩いている途中にタップで止まる）' },
  { how: '画面をなぞる', what: 'なぞった向きに歩き続ける（指を離すと止まる。敵が見えた・宝箱を見つけた・攻撃を受けたら立ち止まる）' },
  { how: '主人公をダブルタップ', what: 'その場で1ターン待つ（「待機」ボタンでも）' },
  { how: '呪文のボタン', what: '押したまま指をずらして向きを選び、離すと唱える。軽く押すと構え、もう一度押すと唱える' },
  { how: '「装備と敵」', what: '装備・見えている敵・記録を見る。リタイアもここから' },
  { how: '左上の敵の札', what: '押すと、その敵の方を向く' },
];

/** どちらでも */
export const COMMON_HELP: HelpRow[] = [
  { how: '階段', what: '踏むと、そのまま次の階へ降りる' },
  { how: '頭上の色の丸', what: 'その敵の弱点（効く武器・属性・魔法）' },
];
