// 画質の設定（2026-11-29。docs/graphics-quality.md）。設定の画面で「軽い／ふつう／きれい」を選ぶ。
// 3D 画面の画質の段（explore3dConfig.ts の QUALITY.levels）のうち、どの段を使ってよいかを決める。音を出さない・描かない、純粋な関数だけ。

export const GRAPHICS = ['light', 'normal', 'high'] as const;
export type Graphics = (typeof GRAPHICS)[number];
export const GRAPHICS_NAMES: Record<Graphics, string> = { light: '軽い', normal: 'ふつう', high: 'きれい' };
export const GRAPHICS_HINTS: Record<Graphics, string> = {
  light: '解像度を下げ、霧・粒・仕上げを切り、1秒に30コマまでにする。古いスマホや電池が気になるとき',
  normal: '端末の速さに合わせて、自動で上げ下げする',
  high: 'いちばんきれいな段に固定する（影も細かく）。重い端末では、カクつくことがある',
};

/** 使ってよい段の範囲（min がきれいな側）と、自動で上げ下げするか */
export type QualityRange = { min: number; max: number; adaptive: boolean };

/** 設定ごとの段の範囲。段の数（levels）は QUALITY.levels.length（いちばん上が「きれい」、いちばん下が「軽い」） */
export function qualityRange(mode: Graphics, levels: number): QualityRange {
  const light = levels - 1;
  if (mode === 'high') return { min: 0, max: 0, adaptive: false };
  if (mode === 'light') return { min: light, max: light, adaptive: false };
  return { min: 1, max: light - 1, adaptive: true };
}

/** 始める段：ふつうは、速い端末（コアが fastCores 以上）なら範囲のいちばん上、それ以外はその次 */
export function startLevelOf(range: QualityRange, cores: number, fastCores: number): number {
  if (!range.adaptive) return range.min;
  return Math.min(range.max, cores >= fastCores ? range.min : range.min + 1);
}

/**
 * 今の段 level から、dir（1：下げる、-1：上げる）の向きで、効果が今と変わる最初の段（範囲の中で）。なければ今の段。
 * sameLook(a, b) は、2つの段の見た目が同じか（端末の細かさの上限で、解像度が同じになるときなど）
 */
export function neighborLevel(level: number, dir: 1 | -1, range: QualityRange, sameLook: (a: number, b: number) => boolean): number {
  for (let l = level + dir; l >= range.min && l <= range.max; l += dir) if (!sameLook(l, level)) return l;
  return level;
}

/** この画質で、今のコマを描くか（「軽い」は、前に描いてから frameMs たっていなければ描かない） */
export function shouldDraw(mode: Graphics, sinceLast: number, frameMs: number): boolean {
  return mode !== 'light' || sinceLast >= frameMs - 2; // 画面の更新の間隔（約16.7ms）の2回分で描けるよう、少し早めに許す
}
