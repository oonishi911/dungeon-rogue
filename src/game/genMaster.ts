// ダンジョン生成の設定（src/game/dungeonGen.json）を読み、正しい形かを確かめる。
// dungeonGen.json は、開発用の管理画面（?view=gen、src/ui/GenAdmin.tsx）から書き換えて公開できる。
// rooms は小部屋の多さと大きさ、enemies は敵の数と置き方（部屋に集める・部屋には置かない・群れ部屋など）。
// 読めない値が入っていたら、ゲームを動かさずにエラーにする（テストで見つかるので、公開はされない）

import raw from './dungeonGen.json';

/** 小部屋の置き方（map.ts） */
export interface RoomSettings {
  attemptRate: number; // 迷路のセル数に対する、部屋を置こうとする回数の割合。大きいほど部屋が増え、迷路の通路が減る
  minSize: number; // 部屋の一辺の最小（奇数）
  maxSize: number; // 部屋の一辺の最大（奇数）
}

/** 敵を置く場所。mixed：部屋にも通路にも（roomWeight で部屋の選ばれやすさを変える）、rooms：部屋だけ、corridors：通路だけ */
export const PLACEMENTS = ['mixed', 'rooms', 'corridors'] as const;
export type Placement = (typeof PLACEMENTS)[number];
export const PLACEMENT_LABELS: Record<Placement, string> = { mixed: '部屋にも通路にも', rooms: '部屋だけ', corridors: '通路だけ' };

/** 敵の数と置き方（enemies.ts） */
export interface EnemySettings {
  amount: number; // 通常の敵の数の倍率（1：今の数。ランクで広くなるほど増える分は、そのまま）
  placement: Placement;
  roomWeight: number; // mixed のとき、部屋の床が通路の床の何倍選ばれやすいか（1：同じ、0：部屋に置かない）
  nestChance: number; // 部屋が「群れ部屋」（敵がまとまっている部屋）になる確率（0〜1）。群れの敵は通常の敵とは別に足す。通路だけのときは作らない
  nestMin: number; // 群れ部屋に置く敵の数の最小
  nestMax: number; // 群れ部屋に置く敵の数の最大
  stayInRoom: boolean; // 部屋に置いた敵は、主人公に気付くまで部屋の中だけを歩く
}

export interface GenSettings {
  rooms: RoomSettings;
  enemies: EnemySettings;
}

/** 値の範囲（管理画面の入力欄も、この範囲にする）。step は管理画面で1回に動かす量 */
export const GEN_LIMITS = {
  attemptRate: { min: 0, max: 0.3, step: 0.01 },
  amount: { min: 0, max: 3, step: 0.1 },
  roomSize: { min: 3, max: 15, step: 2 },
  weight: { min: 0, max: 10, step: 0.5 },
  nestChance: { min: 0, max: 1, step: 0.05 },
  nestCount: { min: 1, max: 12, step: 1 },
} as const;

/** 項目の名前（管理画面と、変更の説明で使う） */
export const GEN_LABELS = {
  attemptRate: '部屋の多さ',
  minSize: '部屋の大きさ（最小）',
  maxSize: '部屋の大きさ（最大）',
  amount: '敵の数の倍率',
  placement: '敵を置く場所',
  roomWeight: '部屋の選ばれやすさ',
  nestChance: '群れ部屋になる確率',
  nestMin: '群れの敵の数（最小）',
  nestMax: '群れの敵の数（最大）',
  stayInRoom: '部屋の敵は部屋から出ない',
} as const;

/** 形のおかしいところを、すべて日本語の文で返す（なければ空） */
export function genProblems(data: unknown): string[] {
  const problems: string[] = [];
  if (!isObject(data) || !isObject(data.rooms) || !isObject(data.enemies)) return ['rooms と enemies がない'];
  const { rooms, enemies } = data;
  const num = (v: unknown, label: string, lim: { min: number; max: number }) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lim.min || v > lim.max) problems.push(`${label}：${lim.min}〜${lim.max}の数にする`);
  };
  num(rooms.attemptRate, GEN_LABELS.attemptRate, GEN_LIMITS.attemptRate);
  for (const k of ['minSize', 'maxSize'] as const) {
    const v = rooms[k];
    num(v, GEN_LABELS[k], GEN_LIMITS.roomSize);
    if (typeof v === 'number' && (!Number.isInteger(v) || v % 2 === 0)) problems.push(`${GEN_LABELS[k]}：奇数にする`);
  }
  if (typeof rooms.minSize === 'number' && typeof rooms.maxSize === 'number' && rooms.minSize > rooms.maxSize) {
    problems.push('部屋の大きさ：最小を最大以下にする');
  }
  num(enemies.amount, GEN_LABELS.amount, GEN_LIMITS.amount);
  if (!PLACEMENTS.includes(enemies.placement as Placement)) problems.push(`${GEN_LABELS.placement}：${PLACEMENTS.join('・')}のどれかにする`);
  num(enemies.roomWeight, GEN_LABELS.roomWeight, GEN_LIMITS.weight);
  num(enemies.nestChance, GEN_LABELS.nestChance, GEN_LIMITS.nestChance);
  for (const k of ['nestMin', 'nestMax'] as const) {
    const v = enemies[k];
    num(v, GEN_LABELS[k], GEN_LIMITS.nestCount);
    if (typeof v === 'number' && !Number.isInteger(v)) problems.push(`${GEN_LABELS[k]}：整数にする`);
  }
  if (typeof enemies.nestMin === 'number' && typeof enemies.nestMax === 'number' && enemies.nestMin > enemies.nestMax) {
    problems.push('群れの敵の数：最小を最大以下にする');
  }
  if (typeof enemies.stayInRoom !== 'boolean') problems.push(`${GEN_LABELS.stayInRoom}：true か false にする`);
  return problems;
}

export function parseGenSettings(data: unknown): GenSettings {
  const problems = genProblems(data);
  if (problems.length) throw new Error(`dungeonGen.json の形が正しくありません：${problems.join(' / ')}`);
  return data as GenSettings;
}

/** リポジトリに保存する形（2つ空けの JSON。最後に改行） */
export function serializeGenSettings(settings: GenSettings): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
}

/** 変えたところを、日本語の文で返す（公開するときのコミットの説明と、画面の一覧に使う） */
export function describeGenChanges(before: GenSettings, after: GenSettings): string[] {
  const out: string[] = [];
  const show = (v: number | boolean | string) =>
    typeof v === 'boolean' ? (v ? 'する' : 'しない') : typeof v === 'string' ? (PLACEMENT_LABELS[v as Placement] ?? v) : String(v);
  for (const group of ['rooms', 'enemies'] as const) {
    const a = before[group] as unknown as Record<string, number | boolean | string>;
    const b = after[group] as unknown as Record<string, number | boolean | string>;
    for (const k of Object.keys(b)) {
      if (a[k] !== b[k]) out.push(`${GEN_LABELS[k as keyof typeof GEN_LABELS]}：${show(a[k]!)} → ${show(b[k]!)}`);
    }
  }
  return out;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** ゲームで使う設定 */
export const GEN_SETTINGS: GenSettings = parseGenSettings(raw);
