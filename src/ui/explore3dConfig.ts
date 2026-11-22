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
export const CAMERA = { height: 15, back: 11.7 }; // 主人公の真上15・手前11.7から見下ろす（約52度。主人公の脚やマントの動きが横から見える角度）
// 画面の大きさによらず、主人公のいるあたりの1マスが画面上でこの大きさ（CSSピクセル）に映るよう、視野の広さを決める。
// スマホの縦画面（幅約390px）で横に約8マス、PCの探索画面（幅約670px）で横に約14マス映る（2026-11-15 に、1マスを48pxから36pxに小さくして映る範囲を広げたが、その日のうちに、主人公と敵の模型を作り込んで大きく見せるため、48pxに戻した）
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
// 連矢でまわりの敵を倒したとき、最初の敵に当たってから、さらに残す時間（演出の間 spellFx.ts の FX.chain が、敵8体まで）
export const SPLASH_EXTRA_MS = 480;
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
// 手応え（2026-11-20。docs/combat-fun-spec.md ⑥）。遊んでみて、ここの数字を変えて調整する
// ヒットストップ：当てた一瞬、画面が止まる時間（ミリ秒）。弱点を突く・コンボ・倒したときは長め、効きにくいときは短め。重なったら、長いほうを使う
export const HIT_STOP = { base: 60, weak: 80, resist: 40, combo: 90, kill: 85, max: 100 } as const;
// ダメージの数字の見た目：scale は大きさの倍率、color は文字の色（なければ ふつうの色）。相性が弱点なら大きく黄色、効きにくいなら小さく灰色、コンボは技ごとの色
export const DAMAGE_STYLE = {
  weak: { scale: 1.45, color: '#ffd84a' },
  resist: { scale: 0.8, color: '#9aa39f' },
  smash: { scale: 1.65, color: '#bfeaff' },
  sear: { scale: 1.65, color: '#ff9a3c' },
  arcane: { scale: 1.5, color: '#c8a0ff' },
  kill: { scale: 1.15 }, // 倒した一撃は、さらに少し大きく（相性の大きさに掛ける）
} as const;
// 連続で倒したとき：間があいていなければ連続（chainMs）。倒すたびに音を stepSemitones 半音ずつ上げ、maxSteps 回で頭打ち。2連から「n連」を出す
export const KILL_CHAIN = { chainMs: 2600, stepSemitones: 2, maxSteps: 6, gap: 0.09, color: '#ffe27a' } as const;
// 低いHPの画面のふち（赤）：HPの割合がこれ以下で出す。critical 以下では、脈打つ（心音のように）
export const LOW_HP = { warn: 0.4, critical: 0.2 } as const;

// 敵の行動の個性の演出（遠距離の矢・盾・突進の構え・召喚）
export const FOE_FX = {
  shot: { ms: 260, height: 0.6, size: 0.13 }, // 遠距離の矢：飛ぶ時間・飛ぶ高さ・玉の大きさ（マス）
  shotColors: { fire: 0xff8a3c, ice: 0x9fe8ff, light: 0xfff2a8, dark: 0xa070e0, neutral: 0xe6dcc0 }, // 敵の体質ごとの矢の色
  shield: { size: 0.62, thick: 0.07, reach: 0.4, y: 0.5, color: 0xbfc7d1 }, // 盾持ちの盾：板の大きさ・厚さ・体からの距離・高さ・色
  field: { y: 0.02, size: 0.94, fireOpacity: 0.85, frostOpacity: 0.8, poisonOpacity: 0.75, lastTurn: 0.55, flicker: 0.18 }, // 床の跡：床からの高さ・1マスに対する大きさ・濃さ（燃える床・霜・毒の霧）・最後のターンの薄さ・燃える床のちらつき
  stone: { size: 0.9, height: 0.85, color: 0x8a7e6a, lastOpacity: 0.6 }, // 石の壁の呪文の壁：1マスに対する幅・高さ（マス）・色・最後のターンの濃さ
  steam: { ms: 800, count: 4, rise: 0.9, size: 0.7 }, // 水蒸気：立ち上る時間・粒の数・立ち上る高さ・粒の大きさ（マス）
  skill: {
    slash: { ms: 220, stagger: 170, size: 1.5, y: 0.55 }, // 剣の連斬り：斬撃の残光が消えるまで・2回目までの間隔・大きさ（マス）・高さ
    slam: { ms: 340, from: 0.4, to: 1.9, y: 0.06, color: 0xffd27a }, // 槌の地響き：輪が広がる時間・はじめと終わりの半径（マス）・床からの高さ・色
    bolt: { color: 0xb48cff, scale: 1.7 }, // 杖の魔力弾：玉の色・矢の玉に対する大きさ
  },
  marks: { charge: '#ff5a4a', bump: '#ffe27a', summon: '#c08aff', blocked: '#9fb4c8', alarm: '#ffb347' }, // 突進の構え・壁にぶつかった・召喚・盾に防がれた・見張りが叫んだときの色
  alarm: { color: 0xffb347, ms: 700, ringRadius: 0.44 }, // 見張りの叫びの輪：色・広がりきるまで（ミリ秒）・輪の元の半径（マス。shared.ring の太さの真ん中）
  phase: { colors: [0xb48d35, 0xe07a30, 0xd03030], grow: 0.08, ringGrow: 0.25, roarMs: 900, roarReach: 2.2, shake: 0.3 }, // ボスの段階：足元の輪の色（第1〜3段階）・体の大きくなり方・輪の大きくなり方・咆哮の輪の時間と広がり・揺れ
} as const;
// 敵の燃焼・凍結の見た目（2026-11-20）。凍った敵は氷の殻に包まれ、燃えている敵は火の粉を出し続ける
export const FOE_STATUS_FX = {
  shell: { color: 0xa6e4ff, opacity: 0.4, width: 0.78, height: 0.95, y: 0.48 }, // 氷の殻：色・濃さ・横の大きさ・高さ・床からの高さ（マス）
  flame: { perSecond: 9, color: [0xffd060, 0xff8a2a, 0xff5a1a] as const, size: 0.2, speed: 0.25, up: 1.5, gravity: -1.2, ms: 560, y: 0.35 }, // 燃えている敵の火の粉：1秒に出す数・色・大きさ・広がり・上がる勢い・重力・消えるまで・高さ
  burst: {
    burn: { pieces: 14, speed: 1.6, up: 2.2, gravity: 4, size: 0.2, color: 0xff8a2a, ms: 650 }, // 燃え上がった瞬間
    freeze: { pieces: 14, speed: 1.4, up: 1.6, gravity: 5, size: 0.22, color: 0xbfeaff, ms: 650 }, // 凍りついた瞬間
    smash: { pieces: 26, speed: 3, up: 3.2, gravity: 9, size: 0.3, color: 0xe8f8ff, ms: 800 }, // 砕く：氷の破片
    sear: { pieces: 20, speed: 2.4, up: 2.6, gravity: 5, size: 0.24, color: 0xffb040, ms: 650 }, // 焼き斬り：火の粉
    arcane: { pieces: 16, speed: 1.8, up: 2.2, gravity: 2, size: 0.2, color: 0xc8a0ff, ms: 700 }, // 杖の共鳴：紫の光
  },
  marks: { burn: '#ff8a3c', freeze: '#bfeaff' }, // 頭上のマークの色
} as const;
export const REMEMBERED = 0.3; // 一度見たが今は見えていないマスの明るさ
// 見える範囲の明るさ。主人公のそばは1で、視界の端へ向かってなめらかに edge まで暗くする。
// マスの明るさは、見え始め・見えなくなるときに fade の速さ（1秒あたり）で少しずつ変える。
// 明るさはピクセルごとに決める（霧の地図 → FogState と applyFog）ので、マスの形の段は出ない
export const SIGHT_LIGHT = { edge: 0.5, fade: 9 };
// 霧の見え方（2026-11-14）。模様は、ゆっくり流れる、もやもやした模様（ノイズ）で作る
export const FOG_LOOK = {
  wobble: 0.16, // 視界の端のゆらぎの大きさ（半径の何割）
  scale: 0.55, // 模様の細かさ（1マスあたりの模様の数。小さいほど大きなうねり）
  drift: 0.18, // 模様が流れる速さ（マス/秒）
  edgeWarp: 0.45, // 一度見た場所とまだ見ていない場所の境目を、どれだけゆらがせるか（マス）
  clearFrom: 0.72, // 視界の端（半径の何割から）を、一度見た場所の見え方へ切り替え始めるか
  saturation: 0.3, // 一度見た場所の色の残り方（0で灰色、1でそのまま）
  mist: [0.022, 0.03, 0.038] as const, // 一度見た場所にかかる、もやの色（青白い。光の強さの単位）
  mistAmount: 0.35, // 一度見た場所に、もやの色をどれだけ混ぜるか（模様で濃い・薄いがある）
};
// 地面をはう霧：床の少し上に、ゆっくり流れる半透明の霧の層を置く。主人公のそばは晴れ、視界の外ほど濃い。
// ?mist=off、または処理の弱い端末（コアが4つ未満）では出さない
export const GROUND_MIST = {
  height: 0.14, // 床からの高さ（マス。壁より低いので、壁の前では隠れる）
  color: 0x6f818a, // 霧の色
  opacity: 0.18, // いちばん濃いところの濃さ
  clearTo: 0.55, // 主人公から、視界の半径の何割までは晴れているか
  thickTo: 1.6, // 視界の半径の何倍で、いちばん濃くなるか
  scale: 0.32, // 模様の細かさ（1マスあたり）
  drift: 0.22, // 流れる速さ（マス/秒）
};
// たいまつのゆらぎ：光の強さと、視界の端を、炎のように小さくちらつかせる（「動きを減らす」設定では止める）
export const TORCH_FLICKER = { light: 0.12, sight: 0.035, speed: 1 };
// 壁の根元の影：壁に接する床の辺に敷く帯。幅（マスの何倍か）と、壁際でのいちばん濃いところ、薄くなり方
export const WALL_SHADOW = { depth: 0.4, darkness: 0.8, falloff: 1.5 };
// 壁と床の隅の暗がり（2026-11-15）：壁の側面の根元ほど暗くする（min：床の高さでの明るさ、height：暗がりが届く高さ）。床側は影の帯（WALL_SHADOW）
export const CORNER_SHADE = { min: 0.45, height: 0.35 }; // falloff：大きいほど壁際で急に薄くなる
// 影の帯を敷く向き。dx・dz は壁のある方向、angle は帯の暗い側をその方向へ向ける回転
export const SHADOW_SIDES = [
  { dx: 0, dz: -1, angle: 0 },
  { dx: 1, dz: 0, angle: -Math.PI / 2 },
  { dx: 0, dz: 1, angle: Math.PI },
  { dx: -1, dz: 0, angle: Math.PI / 2 },
] as const;
export const BACKGROUND = 0x0b1413;
// 床と壁を描く範囲（主人公からのマス数）。画面に映る範囲（1マス36pxで、PCなら横19×縦15、スマホの縦画面なら横11×縦21マスほど）より、
// 動いている途中の分と、大きな画面の分だけ広くとる。奥は、explore3d.ts の resize が、この範囲の外が映らないように視野の広さを抑える
export const DRAW_RANGE = { x: 20, z: 26 };
export const DRAW_CAPACITY = (DRAW_RANGE.x * 2 + 1) * (DRAW_RANGE.z * 2 + 1);
export const PATH_CAPACITY = 256; // 歩く道筋の点を、いくつまで描くか

/**
 * テクスチャの画像（public/textures/{特性}/ の中）。なめらかな質感の絵。詳しくは docs/textures.md。
 * 床も壁も、1枚の絵を何マスにもまたがって貼る（床と壁の上面は TEXTURE_SPAN×TEXTURE_SPAN マス、壁の側面は横 TEXTURE_SPAN マス×高さ1）。
 * マスごとに絵のどこを使うかはダンジョンの中の位置で決めるので、隣り合うマスの模様がつながり、マスの境目が見えない
 */
export const TEXTURE_FILES = {
  floor: 'floor.jpg',
  wallTop: 'wall-top.jpg',
  wallSide: 'wall-side.jpg',
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
  height: 1.25, // 掲げた高さ（主人公の頭より上。体の正面が光りすぎず、脚やマントの動きが見えるように）
  forward: 0.45, // 主人公より少し手前（カメラ側）に掲げる。主人公の体の中に光があると、体が照らされず暗くなるため
  // 敵が動いている・倒れているあいだに影を描き直す間隔の下限（ミリ秒）。毎フレーム描き直すと重いので、1秒に30回まで
  shadowRefreshMs: 33,
};
export const AMBIENT = 0.3; // 全体を均等に照らす弱い光。光の届かない場所や、一度見ただけのマスがかろうじて見える明るさ
export const SUN = 0.25; // 上からの弱い光。壁の側面に陰をつける
// 画質の段階（きれいな順）。描くのが間に合わない端末では、1段ずつ下げ、余裕が戻れば1段ずつ元に戻す。
// - ratio：画面の1ピクセルを何ピクセルで描くか（端末の細かさがこれより小さければ、端末の細かさまで）
// - mist（地面の霧）・particles（空気の粒）・post（画面の仕上げ）：その段で使うか（端末が弱くて最初から使わないものは、ここでも使わない）
// - shadow：たいまつの影の地図の大きさ
// 下げる順番は、見た目の損が小さいものから：影の細かさ → 解像度 3→2 → 粒と霧 → 仕上げ → 解像度 1.5
export const QUALITY = {
  levels: [
    { ratio: 3, mist: true, particles: true, post: true, shadow: 1024 },
    { ratio: 2, mist: true, particles: true, post: true, shadow: 1024 },
    { ratio: 2, mist: true, particles: true, post: true, shadow: 512 },
    { ratio: 2, mist: false, particles: false, post: true, shadow: 512 },
    { ratio: 2, mist: false, particles: false, post: false, shadow: 512 },
    { ratio: 1.5, mist: false, particles: false, post: false, shadow: 512 },
  ],
  fastStartCores: 6, // コアがこの数以上の端末は、いちばんきれいな段から始める（それ以外は、2番目の段から）
  slowMs: 26, // 1コマがこれより長くかかったら「遅い」コマ（50ms を超えたら3コマぶんに数える）。遅いコマが slowFrames たまったら1段下げる
  slowFrames: 60,
  fastMs: 20, // 1コマがこれより短いコマが fastFrames 続いたら、1段上げてみる
  fastFrames: 300,
  retryMs: 20000, // 上げてから、この時間のうちにまた下がったら、その段へは二度と上げない
} as const;
export const MAX_ANISOTROPY = 16; // 斜めから見た床がぼけないようにする強さの上限（端末が対応する範囲まで）
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
// ツヤを決めていない特性（無属性・闇）の床と壁：湿った石の、弱い照り返し（2026-11-15）。
// 床と壁は、テクスチャの明るいところ（石の面）ほど照り返し、暗いところ（継ぎ目・ひび）は照り返さない（specularMap）
export const WET_STONE = { shininess: 32, specular: 0x262626 } as const;

export const TRAIT_COLORS: Record<TraitId, { floor: number; wall: number }> = {
  fire: { floor: 0x4a2a22, wall: 0x8a3a26 },
  ice: { floor: 0x253a48, wall: 0x6a9cbc },
  neutral: { floor: 0x2e3a36, wall: 0x66766f },
  light: { floor: 0x4a4430, wall: 0xc9bb8a },
  dark: { floor: 0x241d32, wall: 0x52466e },
};

// 床と壁の凹凸：テクスチャの明るさを高さとみなし、石の継ぎ目やひびに光と陰を付ける。大きいほど凹凸が強い。
// 凹凸は、絵を読み込んだときに法線マップにしておく（surfaceNormals.ts）。数値は、以前のピクセルごとの計算（bumpMap で 9・7・9）と
// 同じ見た目になるよう、仕上がりの画像のざらつきを比べて合わせたもの
export const SURFACE_BUMP = { floor: 8.2, top: 4.7, side: 7.8 };
// 床の小石とがれき：マスごとに決まった乱数で、小石を散らし、壁の根元には崩れた石を寄せる（色は壁の色を暗くしたもの）
export const DEBRIS = {
  pebbleChance: 0.0675, // 壁に接していない床のマスに、小石が1つある確率
  rubbleChance: 0.09, // 壁に接した床のマスに、崩れた石がある確率（あれば1〜3個）
  pebbleSize: [0.04, 0.09] as const, // 小石の大きさ（マス）
  rubbleSize: [0.05, 0.13] as const, // 崩れた石の大きさ（マス）
  darken: 0.6, // 壁の色に掛ける明るさ
  perTile: 4, // 1マスに置ける数の上限（入れ物の大きさを決める）
  boneChance: 0.0125, // 床のマスに骨がある確率（壁際はその2倍）
  boneSize: [0.1, 0.17] as const, // 骨の長さ（マス）
  boneColor: 0xc9bea2,
};

// 画面全体の仕上げ（postFx.ts）：光のにじみ（明るさが threshold から threshold+knee にかけて、にじみ始める。bloom はにじみの強さ）、
// 周辺減光（vignette：四隅をどれだけ暗くするか）、粒子感（grain：ざらつきの強さ）。?post=off、処理の弱い端末、描くのが間に合わないときは使わない。
// くっきりさせる（sharpen：輪郭の強調の強さ）、明るい部分を白く飛ばさず、色を残したままなだらかに明るくする（rollStart：その明るさから）。
// 軽くする工夫：にじみのぼかしは縦横1回ずつで、そのぶんぼかしの幅（spread）を広げて、前（2回ずつ）と同じくらいにじませる。
// 縁をなめらかにする重ね描き（マルチサンプル）は、描く画素が bigPixels を超える大きな画面では samplesBig 回、そうでなければ samples 回
export const POST_FX = { threshold: 0.85, knee: 0.5, bloom: 0.45, vignette: 0.38, grain: 0.035, sharpen: 0.4, rollStart: 0.85, spread: 1.5, samples: 4, samplesBig: 2, bigPixels: 1_200_000 };

// 部屋の壁掛けたいまつ（sconces.ts）。height：掛ける高さ、out：壁から前へ出す長さ、wideRoom：この幅以上の部屋には2つ掛ける。
// 光は主人公から reach マス以内の、見えているたいまつ lights 個にだけ灯す（強さ intensity、届く距離 distance）
export const SCONCE = {
  height: 0.62,
  out: 0.12,
  wideRoom: 7,
  lights: 3,
  reach: 9,
  color: 0xffb070,
  flameColor: 0xffd29a,
  intensity: 3.2,
  distance: 4.5,
  decay: 1.6,
  flicker: 0.14,
  flameSize: 0.22,
  remembered: 0.3, // 一度見ただけのときの、炎の明るさ
};

// 空気の粒（particles.ts）。air：主人公のまわりに漂う粒の数（box：漂わせる箱の幅と高さ、マス）。
// kinds：特性ごとの粒（色、動き：velocity はマス/秒、sway は揺れ幅、size は大きさ、glow なら光る粒として足し合わせる）。
// 火の粉は、灯っている壁掛けたいまつ（最大 sources 個）から立ちのぼる
export const PARTICLES = {
  air: 64,
  box: { width: 9, height: 2.2 },
  embers: 36,
  sources: 3,
  emberColor: 0xffa648,
  emberSpeed: 0.55,
  emberRise: 0.9,
  emberSize: 0.9,
  kinds: {
    fire: { color: 0x8a8580, velocity: [0.05, -0.08, 0.03] as [number, number, number], sway: 0.25, size: 1.0, opacity: 0.55, glow: false }, // 灰
    ice: { color: 0xe8f4ff, velocity: [0.08, -0.22, 0.04] as [number, number, number], sway: 0.35, size: 1.1, opacity: 0.75, glow: false }, // 細かな雪
    neutral: { color: 0xd8cfb8, velocity: [0.03, 0.02, 0.02] as [number, number, number], sway: 0.18, size: 0.7, opacity: 0.35, glow: true }, // ちり
    light: { color: 0xffe08a, velocity: [0.0, 0.07, 0.0] as [number, number, number], sway: 0.2, size: 0.8, opacity: 0.6, glow: true }, // 金色の光の粒
    dark: { color: 0x1a1024, velocity: [0.04, 0.03, -0.03] as [number, number, number], sway: 0.4, size: 2.2, opacity: 0.45, glow: false }, // 黒いもや
  },
};

// 敵の動き：攻撃のとき、少し身を引いてから主人公の方へ飛びかかって戻る（windUp：引く長さ、reach：飛びかかる長さ（マス）、ms：長さ）。
// 倒れたとき、その場で崩れ落ちる（ms：長さ）。「動きを減らす」設定では、どちらもしない
export const ENEMY_MOTION = { lunge: { windUp: 0.1, reach: 0.32, ms: 340 }, collapse: { ms: 650 } };

/**
 * 倒れ方（deathKind.ts）ごとの演出。hideMs：そのあいだ体を残し、過ぎたら隠して破片を飛ばす（0なら体を残して崩れる）。
 * pieces：破片・霧の数、speed：飛び散る速さ（マス/秒）、up：上向きの速さ、gravity：落ちる強さ、size：破片の大きさ、color：色
 */
export const DEATH_FX = {
  shatter: { ms: 650, hideMs: 90, pieces: 12, speed: 1.8, up: 1.6, gravity: 6, size: 1.6, color: 0xcdf1ff }, // 氷：砕けて飛び散る
  burst: { ms: 700, hideMs: 140, pieces: 10, speed: 1.4, up: 2.2, gravity: 7, size: 1.7, color: 0x7fe08a }, // スライム：ふくらんで弾け、しずくになる
  crumble: { ms: 800, hideMs: 0, pieces: 8, speed: 0.7, up: 0.8, gravity: 5, size: 1.8, color: 0x8d8272 }, // 硬い敵：崩れて、かけらが落ちる
  vanish: { ms: 900, hideMs: 0, pieces: 7, speed: 0.15, up: 0.9, gravity: -0.4, size: 3.4, color: 0xa78bff }, // 霊体：霧になって立ちのぼる
} as const;

/** 敵が自分で光る（体質ごと）。floor：足元に広がる光の半径（マス）と濃さ。強敵・ボスは eliteRate 倍の大きさ */
export const GLOW_FX = {
  colors: { fire: 0xff7a2a, light: 0xfff2b0, dark: 0x8a5ae0, ice: 0x9fe8ff } as const,
  radius: { fire: 1.7, light: 1.4, dark: 1.1, ice: 1.1 } as const,
  opacity: { fire: 0.5, light: 0.4, dark: 0.32, ice: 0.28 } as const,
  eliteRate: 1.35,
  flicker: { fire: 0.18, light: 0.06, dark: 0.1, ice: 0.04 } as const, // ちらつきの大きさ（半径の割合）
  y: 0.03,
} as const;

/** 強敵・ボスが初めて視界に入ったときの演出：カメラが寄る倍率・寄る時間・保つ時間・戻る時間（ミリ秒） */
export const INTRO_FX = { zoom: 1.2, inMs: 350, holdMs: 1100, outMs: 500, bossHoldMs: 1700 } as const;

/** 通常攻撃の斬撃の残光。武器の段階（1〜10）が上がると、大きく・本数が増え・色が華やかになる */
export const AFTERGLOW_FX = {
  tiers: [
    { upTo: 3, size: 0.9, count: 1, ms: 220, color: 'rgba(160,230,255,' }, // 1〜3段：細い白青の1本
    { upTo: 7, size: 1.15, count: 2, ms: 280, color: 'rgba(255,236,150,' }, // 4〜7段：金色の2本
    { upTo: 10, size: 1.45, count: 3, ms: 340, color: 'rgba(255,170,90,' }, // 8〜10段：橙の3本＋火花
  ],
  y: 0.55,
  stagger: 55,
  sparks: 6,
} as const;

// 床の変化（2026-11-15）：
// - corridor：通路（部屋の外）の床の明るさ。部屋の床より少し暗く、踏み固めた感じにする
// - puddle：水たまり。床のマスに chance の確率で置き、たいまつの光が強く照り返す（炎のダンジョンには置かない）
export const FLOOR_LOOK = {
  corridor: 0.8,
  puddle: { chance: 0.07, size: [0.22, 0.42] as const, color: 0x0b1012, shininess: 70, specular: 0x3a4650, opacity: 0.7 },
};
