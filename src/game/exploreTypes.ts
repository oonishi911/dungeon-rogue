// 探索の状態・行動・出来事の型と、探索の数値。explore.ts が状態を進め、画面（src/ui）はこれを読む。

import type { MapEnemy } from './enemies';
import type { FloorMap, Pos } from './map';
import type { EnemyId, ItemId, PlayerStats, SpellId, TraitId } from './types';

// 数値はすべて仮。バランス調整で見直す
export const EXPLORE_CONFIG = {
  sightRadius: 6, // 視界の半径（マス）
  satietyPerAction: 1,
  starveDamage: 1, // 満腹度0のとき、1行動ごとに減るHP
} as const;

export type Dir = 'up' | 'down' | 'left' | 'right';

export const DIR_DELTA: Record<Dir, Pos> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** 移動先に敵がいれば、移動ではなく攻撃になる（体当たり方式）。道具を使うのも1行動 */
export type ExploreAction =
  | { kind: 'move'; dir: Dir }
  | { kind: 'wait' }
  | { kind: 'descend' }
  | { kind: 'ascend' } // 上り階段（2階目からの入口）から、1つ上の階へ戻る
  | { kind: 'use_item'; item: ItemId }
  | { kind: 'cast'; spell: SpellId; dir?: Dir } // 呪文を唱える。向きを選ぶ呪文（なぎ払い・矢）は dir が要る
  | { kind: 'retire' }; // リタイア：探索をやめてダンジョンを出る（踏破しなかった扱い。金貨は力尽きたときと同じだけ持ち帰る）

export type ExploreOutcome = 'ongoing' | 'cleared' | 'defeated' | 'retired';

/** 宝箱。持ち物がいっぱいで道具を取れなかったときは、道具だけ残る */
export interface Chest {
  pos: Pos;
  gold: number;
  item: ItemId | null;
  /** 開けたか。開けた宝箱は、空になってもその場に残す（開いた形で描く） */
  opened: boolean;
}

/** この行動で入ったダメージ。画面に数字を出すために使う（ルールには使わない） */
export interface HitEvent {
  kind: 'dealt' | 'taken'; // dealt：プレイヤーが敵に与えた / taken：プレイヤーが受けた
  at: Pos; // ダメージを受けた側がいたマス
  amount: number;
  by?: EnemyId; // taken のとき、攻撃してきた敵（毒など、敵の攻撃でないときはない）
}

/** 属性の矢と、当たった敵の相性。weak：弱点（ダメージが増える）、resist：効きにくい（減る） */
export type Affinity = 'weak' | 'normal' | 'resist';

/** この行動で唱えた呪文。画面の演出と効果音のために使う（ルールには使わない） */
export interface CastEvent {
  spell: SpellId;
  dir: Dir | null;
  path: Pos[]; // 矢・なぎ払いが通ったマス（演出で使う）
  moves: { from: Pos; to: Pos }[]; // 衝撃波で吹き飛んだ敵の、動く前と後
  affinity: Affinity | null; // 属性の矢が当たった敵との相性（演出の強さを変える）。矢でないとき・何にも当たらなかったときは null
}

/** 一度離れた階の様子。戻ってきたら、倒した敵・開けた宝箱・晴れた霧はそのまま */
export interface FloorMemory {
  map: FloorMap;
  enemies: MapEnemy[];
  chests: Chest[];
  seen: boolean[];
}

export interface ExploreState {
  seed: number;
  dungeon: string; // 遊んでいるダンジョンの ID（設定は dungeonOf で引く）
  trait: TraitId;
  floor: number; // 0始まり。floors と同じならボス階
  floors: number; // 通常の階の数（ダンジョンの設定で決まる）。その下にボス階がある
  mapSize: number;
  enemyDensity: number;
  map: FloorMap;
  player: Pos;
  stats: PlayerStats; // HP・攻撃力・装備
  satiety: number;
  maxSatiety: number;
  spells: SpellId[]; // 持ってきた呪文書の呪文
  mp: number; // 魔力（呪文を唱えると減り、歩くと少しずつ戻る）
  maxMp: number;
  regen: { amount: number; turns: number } | null; // 再生の呪文：あと何ターン、1ターンにどれだけ回復するか
  cast: CastEvent | null; // この行動で唱えた呪文（画面用）
  enemies: MapEnemy[];
  chests: Chest[]; // この階の宝箱（開けて空になったものも残す）
  gold: number; // この挑戦で手に入れた金貨
  hasMap: boolean; // 地図があれば、各階の入口から階段までの道筋が最初から見える
  nextUid: number;
  defeated: number; // 倒した敵の数
  level: number; // この挑戦のあいだのレベル（1から。敵を倒して経験値がたまると上がる）
  exp: number; // 今のレベルになってからためた経験値（expToNext(level, growth) で次のレベル）
  seen: boolean[]; // この階で一度でも見えたマス（霧が晴れた場所）
  turn: number; // 行動した回数
  rngState: number;
  outcome: ExploreOutcome;
  log: string[];
  visited: Record<number, FloorMemory>; // 一度離れた階（階の番号ごと）。今いる階は入らない
  hits: HitEvent[]; // 直前の行動で入ったダメージ（行動のたびに空からやり直す）
}

export interface ExploreOptions {
  dungeon?: string; // 遊ぶダンジョンの ID。省略時は標準のダンジョン
  floors?: number;
  mapSize?: number; // 広さ・満腹度・敵の密度は、ダンジョンの設定で決まる。個別に指定するとそちらが優先される
  maxSatiety?: number;
  trait?: TraitId; // 省略時はシードから決める
  loadout?: readonly ItemId[];
  enemyDensity?: number;
  hasMap?: boolean;
}

// ===== 結果 =====

export interface ExploreResult {
  outcome: 'cleared' | 'defeated' | 'retired';
  floorReached: number; // 1始まり
  bossFloor: boolean; // ボス階までたどり着いたか
  defeated: number;
  gold: number; // 手に入れた金貨
  goldBrought: number; // 持ち帰った金貨。踏破すれば全額、力尽きたときとリタイアしたときは一部
}
