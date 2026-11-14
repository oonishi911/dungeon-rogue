// 3D表示（explore3d.ts）の見た目の数値。壁の高さ・カメラ・霧の濃さ・たいまつの光・演出の強さなど、ここを変えると見た目が変わる。

import type { TraitId } from '../game/types';

// マスの大きさを1とした壁の高さ。高くすると通路が深く見える。
// 今のカメラの角度（約63度）では、高さ1までなら、すぐ手前の壁は隣のマスに立つキャラクターの足元に届く程度で、体は隠れない
export const WALL_HEIGHT = 1;
// 壁の角の丸み：床に面した縁と、出っ張った縦の角を丸める半径（マス）
export const WALL_ROUND = 0.16;
// 壁の表面のでこぼこ：岩肌のように、面をその向きへ少し押し出したり引っ込めたりする。
// amount はいちばん大きくずらす距離（マス）、scale は1マスあたりの波の細かさ。上面は top を掛けて控えめにする。
// ずらし方はダンジョンの中の位置で決めるので、となり合う壁の面はつながったまま波打つ
export const WALL_ROUGH = { amount: 0.045, scale: 2.6, top: 0.5 } as const;
export const WALL_SHAPES = 16; // 4つの側面のどれが床に面しているかの組み合わせ（softWall.ts の exposureIndex）
export const CAMERA = { height: 15, back: 7.5 }; // 主人公の真上15・手前7.5から見下ろす（約63度）
// 画面の大きさによらず、主人公のいるあたりの1マスが画面上でこの大きさ（CSSピクセル）に映るよう、視野の広さを決める。
// スマホの縦画面（幅約390px）で横に約8マス、PCの探索画面（幅約670px）で横に約14マス映る
export const TILE_PX = 48;
export const FOV_LIMIT = { min: 10, max: 75 }; // 極端に大きい・小さい画面でもゆがみすぎないように
// 攻撃したとき・攻撃されたときの画面効果：カメラを少し寄せて戻す（拡大縮小）。zoom は 1 からのずれの最大、ms は長さ
export const HIT_PULSE = {
  attack: { zoom: 0.05, ms: 180 }, // 自分の攻撃：ぐっと寄って戻る
  hurt: { zoom: 0.08, ms: 260 }, // 敵の攻撃：寄ったあと少し引いて戻る
} as const;
export type HitPulse = keyof typeof HIT_PULSE;
// 戦闘中は、主人公を中心に画面を寄せる。戦闘中とは、追ってきた敵が主人公の隣（上下左右）にいるか、攻撃が起きてから
// holdMs 以内のこと（敵を倒した直後や、敵が1歩離れてまた来たときに、寄ったり引いたりをくり返さないように）。
// zoom は寄せたときの倍率。inSec・outSec は寄せる・戻すときのなめらかさで、その3倍ほどの時間でほぼ着く（寄せるのは約0.4秒、戻すのは約0.75秒）
// 呪文が当たった敵ののけぞり：当たった向きへ amount マス押されて、ms で元に戻る（相性の強さを掛ける）
export const SPELL_KNOCK = { amount: 0.3, ms: 280 } as const;
// 呪文で倒した敵は、矢が当たるまで（と少しのあいだ）消さずに残す
export const DYING_EXTRA_MS = 160;
export const COMBAT_ZOOM = { zoom: 1.35, inSec: 0.12, outSec: 0.25, holdMs: 900 } as const;
// ダメージの数字：受けた側の頭の上に小さく出て、なめらかに大きくなりながら少し浮かび、透けて消える
export const DAMAGE_POP = {
  ms: 250, // 出てから消えるまで
  from: 0.6, // 出たときの大きさ（マス）
  to: 1.3, // 消えるときの大きさ（マス）
  height: 1.05, // 出る高さ（マス）
  rise: 0.35, // 消えるまでに浮かぶ高さ（マス）
  colors: { dealt: '#ece5d3', taken: '#e5624f' }, // 与えた：明るい生成り / 受けた：赤
} as const;
export const REMEMBERED = 0.3; // 一度見たが今は見えていないマスの明るさ
// 見える範囲の明るさ。主人公のそばは1で、視界の端へ向かってなめらかに edge まで暗くする。
// マスの明るさは、見え始め・見えなくなるときに fade の速さ（1秒あたり）で少しずつ変える。
// 明るさはピクセルごとに決める（霧の地図 → FogState と applyFog）ので、マスの形の段は出ない
export const SIGHT_LIGHT = { edge: 0.5, fade: 9 };
// 壁の根元の影：壁に接する床の辺に敷く帯。幅（マスの何倍か）と、壁際でのいちばん濃いところ、薄くなり方
export const WALL_SHADOW = { depth: 0.4, darkness: 0.8, falloff: 1.5 }; // falloff：大きいほど壁際で急に薄くなる
// 影の帯を敷く向き。dx・dz は壁のある方向、angle は帯の暗い側をその方向へ向ける回転
export const SHADOW_SIDES = [
  { dx: 0, dz: -1, angle: 0 },
  { dx: 1, dz: 0, angle: -Math.PI / 2 },
  { dx: 0, dz: 1, angle: Math.PI },
  { dx: -1, dz: 0, angle: Math.PI / 2 },
] as const;
export const BACKGROUND = 0x0b1413;
// 床と壁を描く範囲（主人公からのマス数）。画面に映る範囲（1マス48pxで、PCなら横14×縦11、スマホの縦画面なら横8×縦16マスほど）より、
// 動いている途中の分と、大きな画面の分だけ広くとる
export const DRAW_RANGE = { x: 13, z: 17 };
export const DRAW_CAPACITY = (DRAW_RANGE.x * 2 + 1) * (DRAW_RANGE.z * 2 + 1);
export const PATH_CAPACITY = 256; // 歩く道筋の点を、いくつまで描くか

/**
 * テクスチャの画像（public/textures/{特性}/ の中）。なめらかな質感の絵。詳しくは docs/textures.md。
 * 床も壁も、1枚の絵を何マスにもまたがって貼る（床と壁の上面は TEXTURE_SPAN×TEXTURE_SPAN マス、壁の側面は横 TEXTURE_SPAN マス×高さ1）。
 * マスごとに絵のどこを使うかはダンジョンの中の位置で決めるので、隣り合うマスの模様がつながり、マスの境目が見えない
 */
export const TEXTURE_FILES = {
  floor: 'floor.png',
  wallTop: 'wall-top.png',
  wallSide: 'wall-side.png',
} as const;
// たいまつの光と影。環境光と上からの光を弱くして、たいまつの光が見える範囲を決めるようにする。
// 影の地図（シャドウマップ）は6方向から描くので重い。たいまつが動いたときと、壁が入れ替わったときだけ描き直す
export const TORCH = {
  color: 0xffd9a0, // 暖かいオレンジ色の炎
  // 特性ごとに光の色を変えるときの色。暖かい光は氷の青を打ち消して黄色っぽい灰色に見せてしまうので、氷は青白い光にする
  colorByTrait: { ice: 0xd6ecff } as Partial<Record<TraitId, number>>,
  intensity: 10,
  distance: 9, // 光が届く距離（マス）。視界の半径6より少し遠くまで
  decay: 1,
  height: 0.85, // 手に持った高さ（壁の上面1より低い）
  forward: 0.3, // 主人公より少し手前（カメラ側）に掲げる。主人公の体の中に光があると、体が照らされず暗くなるため
  shadowMapSize: 512,
};
export const AMBIENT = 0.3; // 全体を均等に照らす弱い光。光の届かない場所や、一度見ただけのマスがかろうじて見える明るさ
export const SUN = 0.25; // 上からの弱い光。壁の側面に陰をつける
// 描く解像度（画面の1ピクセルを何ピクセルで描くか）。細かい画面でも max まで。
// 描くのが間に合わない端末では、滑らかに動く方を優先して low まで下げる：1コマに slowMs より長くかかることが frames 回たまったら下げる
// （速いコマが続けば数え直す。一度下げたら戻さない。low は、ぼやけが目立たない程度にとどめる）
export const RESOLUTION = { max: 2, low: 1.5, slowMs: 26, frames: 60 } as const;
export const MAX_ANISOTROPY = 8; // 斜めから見た床がぼけないようにする強さの上限（スマホで重くなりすぎないように）
// 宝箱の大きさ（マス）。ふたは奥行きを直径とするかまぼこ形で、本体の上に載る（いちばん上は高さ + 奥行き/2）
export const CHEST = { width: 0.56, height: 0.3, depth: 0.38 };
// 開けた宝箱：ふたを奥の縁（蝶番）を軸に後ろへ倒す角度（ラジアン）と、箱の口に見える中の暗さ
export const OPENED_CHEST = { lidAngle: 1.75, inside: 0x1c130c, lidInside: 0x3e2a1a };
export const TEXTURE_SPAN = 4; // 床と壁の絵1枚が何マス分にまたがるか（scripts/build-textures.ts・build-photo-textures.py と合わせる）
export const FLOOR_KINDS = 4; // テクスチャがないとき、床を何通りの明るさで描き分けるか

/** テクスチャを読み込む前（または読み込めなかったとき）の、ダンジョン特性ごとの床と壁の色 */
// 床と壁のツヤ（フォンシェーディングの照り返し）。たいまつの光が、主人公のすぐ手前の床に映り込む。
// 氷は強く（凍った床が濡れたように光る）、光は中くらい（磨いた石）、炎は弱く（照った黒い岩）。ほかの特性はツヤなし
export const TRAIT_GLOSS: Partial<Record<TraitId, { shininess: number; specular: number }>> = {
  ice: { shininess: 90, specular: 0x5f7180 },
  light: { shininess: 45, specular: 0x403c34 },
  fire: { shininess: 22, specular: 0x2e2220 },
};
export const NO_GLOSS = { shininess: 30, specular: 0x000000 } as const;

export const TRAIT_COLORS: Record<TraitId, { floor: number; wall: number }> = {
  fire: { floor: 0x4a2a22, wall: 0x8a3a26 },
  ice: { floor: 0x253a48, wall: 0x6a9cbc },
  neutral: { floor: 0x2e3a36, wall: 0x66766f },
  light: { floor: 0x4a4430, wall: 0xc9bb8a },
  dark: { floor: 0x241d32, wall: 0x52466e },
};
