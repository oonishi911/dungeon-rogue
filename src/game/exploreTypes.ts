// 探索の状態・行動・出来事の型と、探索の数値。explore.ts が状態を進め、画面（src/ui）はこれを読む。

import type { MapEnemy } from './enemies';
import type { ComboKind } from './foeStatus';
import type { FloorMap, Pos } from './map';
import type { Found } from './echo';
import type { EchoId, EnemyId, ItemId, PlayerStats, SpellId, TraitId, WeaponType } from './types';

// 数値はすべて仮。バランス調整で見直す
export const EXPLORE_CONFIG = {
  sightRadius: 3, // 視界の半径（マス）。視界を広げる道具（遠見のランタン）を持っていくと広がる（ExploreState.sightRadius）
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
  | { kind: 'skill'; dir?: Dir } // 武器の固有技（技ゲージが満タンのとき）。向きを選ぶ技（剣の連斬り・杖の魔力弾）は dir が要る
  | { kind: 'swap' } // 持ち替え：手に持っている武器と、サブ武器を入れ替える（1ターン。サブ武器がないときはできない）
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
  slip?: boolean; // dealt のとき、出血のダメージ（主人公が武器を振った演出や、画面の拡大は出さない）
  blocked?: boolean; // dealt のとき、盾持ちの敵に正面から防がれた（ダメージが減っている）
  combo?: ComboKind; // dealt のとき、決まったコンボ（砕く・焼き斬り・杖の共鳴）
  affinity?: 'weak' | 'resist'; // dealt のとき、相性（弱点を突いた・効きにくい）。ダメージの数字の見た目に使う（相性がふつうならない）
  killed?: boolean; // dealt のとき、この一撃で敵を倒した
  ranged?: boolean; // taken のとき、離れたところから撃たれた（敵が飛びかかる演出は出さない）
}

/** この行動で起きた、敵の特別な行動や床の出来事（画面の演出のために使う。ルールには使わない） */
export type FoeEvent =
  | { kind: 'shot'; from: Pos; to: Pos; by: EnemyId } // 遠距離の敵が撃った
  | { kind: 'windup'; at: Pos } // 突進の構え
  | { kind: 'charge'; from: Pos; to: Pos; hit: boolean } // 突進（hit：主人公に当たった）
  | { kind: 'bump'; at: Pos } // 突進が壁にぶつかった
  | { kind: 'alarm'; at: Pos; to: Pos[] } // 見張りが叫んで、仲間（to）に気付かせた
  | { kind: 'summon'; at: Pos; from: Pos } // 敵が呼ばれた（from：呼んだ敵のいたマス）
  | { kind: 'block'; at: Pos } // 盾で防がれた
  | { kind: 'steam'; at: Pos } // 燃える床と霜の床、または敵の燃焼と凍結がぶつかって、水蒸気になった
  | { kind: 'foe_status'; at: Pos; status: 'burn' | 'freeze' } // 敵が燃えた・凍った
  | { kind: 'combo'; at: Pos; combo: ComboKind } // コンボが決まった（砕く・焼き斬り・杖の共鳴）
  | { kind: 'roar'; at: Pos; phase: number } // ボスが段階を上げて、咆哮した
  | { kind: 'sow'; at: Pos; to: Pos[]; field: Field['kind'] } // ボスが主人公のまわりに床をまいた
  | { kind: 'skill'; weapon: WeaponType; from: Pos; dir: Dir | null; path: Pos[] }; // 武器の固有技（path：当たったマス。魔力弾は、飛んだマスすべて）

/** 属性の矢と、当たった敵の相性。weak：弱点（ダメージが増える）、resist：効きにくい（減る） */
export type Affinity = 'weak' | 'normal' | 'resist';

/** この行動で唱えた呪文。画面の演出と効果音のために使う（ルールには使わない） */
export interface CastEvent {
  spell: SpellId;
  dir: Dir | null;
  path: Pos[]; // 矢・なぎ払いが通ったマス（演出で使う）
  moves: { from: Pos; to: Pos }[]; // 衝撃波で吹き飛んだ敵の、動く前と後
  stunned: Pos[]; // 強衝撃で動けなくなった敵のいたマス（演出で使う。吹き飛んだあとの位置）
  bleeding: Pos[]; // 烈なぎ払いで出血した敵のいたマス（演出で使う）
  splash: Pos[]; // 連矢で、まわりのダメージを受けた敵のいたマス（演出で使う。唱える前の位置）
  affinity: Affinity | null; // 属性の矢が当たった敵との相性（演出の強さを変える）。矢でないとき・何にも当たらなかったときは null
  area?: Pos[]; // 静寂・眠りの霧の効いた敵のいたマス、石の壁・毒の霧を置いたマス（演出で使う）
  warp?: { from: Pos; to: Pos }; // 転移：跳ぶ前と後
  links?: Pos[]; // 雷の鎖：当たった敵のいたマス（当たった順。演出で、雷をこの順につなぐ）
  drained?: number; // 吸命：回復したHP（演出で使う）
}

/**
 * 床に残る魔法の跡。fire：燃える床（乗っていると毎ターンダメージ）、frost：霜の床（乗っていると、次の1歩に2ターンかかる）、
 * stone：石の壁の呪文の壁（主人公も敵も通れず、矢も通らない）、poison：毒の霧（上にいる敵が毎ターン amount のダメージ。主人公は受けない）。turns：あと何ターン残るか
 */
export interface Field {
  pos: Pos;
  kind: 'fire' | 'frost' | 'stone' | 'poison';
  turns: number;
  amount?: number; // 毒の霧の、1ターンのダメージ
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
  ward?: { cut: number; turns: number }; // 魔力の盾：あと何ターン、敵の攻撃のダメージを何%減らすか
  cast: CastEvent | null; // この行動で唱えた呪文（画面用）
  enemies: MapEnemy[];
  chests: Chest[]; // この階の宝箱（開けて空になったものも残す）
  gold: number; // この挑戦で手に入れた金貨
  nextUid: number;
  defeated: number; // 倒した敵の数
  level: number; // この挑戦のあいだのレベル（1から。敵を倒して経験値がたまると上がる）
  exp: number; // 今のレベルになってからためた経験値（expToNext(level, growth) で次のレベル）
  seen: boolean[]; // この階で一度でも見えたマス（霧が晴れた場所）
  sightRadius: number; // 主人公の視界の半径（マス）。持っていった道具で決まり、探索のあいだ変わらない
  maxItems: number; // 道具を持てる数。大きな袋を持っていくと増える（探索のあいだ変わらない）
  turn: number; // 行動した回数
  rngState: number;
  outcome: ExploreOutcome;
  log: string[];
  visited: Record<number, FloorMemory>; // 一度離れた階（階の番号ごと）。今いる階は入らない
  hits: HitEvent[]; // 直前の行動で入ったダメージ（行動のたびに空からやり直す）
  foes: FoeEvent[]; // 直前の行動で起きた、敵の特別な行動や床の出来事（行動のたびに空からやり直す）
  skill: number; // 技ゲージ（通常攻撃を当てた回数。満タンは武器の段階で決まる。武器がなければ0）
  fields: Field[]; // 今いる階の床に残る魔法の跡（燃える床・霜の床）。階を離れると消える
  found: Found; // この挑戦で拾った刻印武器と残響（終わったとき、力尽きても倉庫に入る。docs/echo-spec.md）
}

export interface ExploreOptions {
  dungeon?: string; // 遊ぶダンジョンの ID。省略時は標準のダンジョン
  floors?: number;
  mapSize?: number; // 広さ・満腹度・敵の密度は、ダンジョンの設定で決まる。個別に指定するとそちらが優先される
  maxSatiety?: number;
  trait?: TraitId; // 省略時はシードから決める
  loadout?: readonly ItemId[];
  echoes?: readonly EchoId[]; // 装備した刻印武器にはめた残響
  enemyDensity?: number;
}

// ===== 結果 =====

export interface ExploreResult {
  outcome: 'cleared' | 'defeated' | 'retired';
  floorReached: number; // 1始まり
  bossFloor: boolean; // ボス階までたどり着いたか
  defeated: number;
  gold: number; // 手に入れた金貨
  goldBrought: number; // 持ち帰った金貨。踏破すれば全額、力尽きたときとリタイアしたときは一部
  found?: Found; // 拾った刻印武器と残響（全部、持ち帰る）
}
