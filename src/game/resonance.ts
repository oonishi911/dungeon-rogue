// 残響の組み合わせ「共鳴」（2026-11-28。docs/echo-resonance.md）。
// 武器のスロットに、決まった残響がそろうと、おまけの効果が付く。はめる順番は関係ない。
// 数字は、ここの RESONANCE（管理画面では変えない）。効果は、いま手に持っている武器（メイン、または持ち替えたサブ）のスロットだけで決まる。

import type { EchoId } from './types';

export const RESONANCE_IDS = ['trio', 'steam', 'eclipse', 'myriad', 'afterglow', 'lifeline', 'stealth', 'feast'] as const;
export type ResonanceId = (typeof RESONANCE_IDS)[number];

/** 共鳴の数字 */
export const RESONANCE = {
  trioMin: 3, // 同じ残響を何個そろえると「三重奏」か
  trioShare: 50, // 三重奏：その残響の効果の合計に、上乗せする割合（%）
  steamDamage: 15, // 蒸気：通常攻撃のダメージ（%）
  eclipseHeal: 5, // 日蝕：敵を倒したときに戻る、最大HPの割合（%。1より減らない）
  myriadDamage: 15, // 万象：体質を問わず、すべての敵へのダメージ（%）
  afterglowTimes: 2, // 深い余韻：余韻の追加ダメージの倍率
  lifelineTimes: 3, // 命綱：HPが半分以下のときの、分け合いの回復の倍率
  stealthTurns: 1, // 忍び足：不意打ちを決めた敵が動けなくなるターン数（ボスには効かない）
  feastTimes: 2, // 満腹：満ち足りで戻る満腹度の倍率
} as const;

export interface ResonanceDef {
  name: string;
  /** そろえる残響（trio は、同じ残響が trioMin 個） */
  needs: readonly EchoId[];
  /** 画面に出す短い言い方（「炎＋氷」） */
  recipe: string;
  text: string;
}

export const RESONANCES: Record<ResonanceId, ResonanceDef> = {
  trio: { name: '三重奏', needs: [], recipe: `同じ残響×${RESONANCE.trioMin}`, text: `同じ残響を${RESONANCE.trioMin}つ以上はめると、その残響の効果の合計が${RESONANCE.trioShare}%増える（数字のない、炎・氷・光・闇の残響は変わらない）` },
  steam: { name: '蒸気', needs: ['fire', 'ice'], recipe: '炎＋氷', text: `通常攻撃のダメージが${RESONANCE.steamDamage}%増える` },
  eclipse: { name: '日蝕', needs: ['light', 'dark'], recipe: '光＋闇', text: `敵を倒すと、最大HPの${RESONANCE.eclipseHeal}%が戻る` },
  myriad: { name: '万象', needs: ['soft', 'hard', 'spirit'], recipe: '柔らかい＋硬い＋霊体', text: `体質を問わず、すべての敵へのダメージが${RESONANCE.myriadDamage}%増える` },
  afterglow: { name: '深い余韻', needs: ['linger', 'recall'], recipe: '余韻＋追憶', text: `余韻の追加ダメージが${RESONANCE.afterglowTimes}倍になる` },
  lifeline: { name: '命綱', needs: ['backwater', 'share'], recipe: '背水＋分け合い', text: `HPが半分以下のとき、分け合いの回復が${RESONANCE.lifelineTimes}倍になる` },
  stealth: { name: '忍び足', needs: ['sneak', 'hush'], recipe: '不意＋ひそやか', text: `不意打ちを決めた敵が、${RESONANCE.stealthTurns}ターン動けなくなる（ボスには効かない）` },
  feast: { name: '満腹', needs: ['sated', 'warmth'], recipe: '満ち足り＋ぬくもり', text: `満ち足りで戻る満腹度が${RESONANCE.feastTimes}倍になる` },
};

/** この共鳴が起きているか（trio 以外。どちらもはめてあれば、1つずつで足りる） */
export function resonates(echoes: readonly EchoId[] | undefined, id: Exclude<ResonanceId, 'trio'>): boolean {
  const have = echoes ?? [];
  return RESONANCES[id].needs.every((need) => have.includes(need));
}

/** 同じものが trioMin 個以上そろっている残響（三重奏になるもの） */
export function trioEchoes(echoes: readonly EchoId[] | undefined): EchoId[] {
  const count = new Map<EchoId, number>();
  for (const id of echoes ?? []) count.set(id, (count.get(id) ?? 0) + 1);
  return [...count].filter(([, n]) => n >= RESONANCE.trioMin).map(([id]) => id);
}

/** 起きている共鳴（RESONANCE_IDS の順） */
export function activeResonances(echoes: readonly EchoId[] | undefined): ResonanceId[] {
  return RESONANCE_IDS.filter((id) => (id === 'trio' ? trioEchoes(echoes).length > 0 : resonates(echoes, id)));
}

/** あと1つで起きる共鳴（そろえる残響のうち1種類だけ足りないもの。刻印の売り場で「あと1つ」と教えるため） */
export function almostResonances(echoes: readonly EchoId[] | undefined): { id: ResonanceId; missing: EchoId }[] {
  const have = echoes ?? [];
  const out: { id: ResonanceId; missing: EchoId }[] = [];
  for (const id of RESONANCE_IDS) {
    if (id === 'trio') continue;
    const lack = RESONANCES[id].needs.filter((need) => !have.includes(need));
    if (lack.length === 1 && have.length > 0) out.push({ id, missing: lack[0]! });
  }
  return out;
}
