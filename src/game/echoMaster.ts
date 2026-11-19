// 残響と刻印武器の設定（src/game/echoes.json）を読み、正しい形かを確かめる。設計は docs/echo-spec.md。
// 刻印武器は、買えない。敵がごく稀に落とす（スロットが1〜3個付いた武器。防具にスロットはない）。スロットにはめるのが残響で、これも敵が落とす。
// echoes.json には、落とす確率、スロット数の割合、落とす装備の段階の範囲、残響ごとの効果の数字がある。
// 残響の働き（炎の残響は武器に炎の力を付ける、など）はここではなくプログラムで決まっていて、数字だけを設定で変える。
// echoes.json は、開発用の管理画面（?view=admin の「残響」タブ。src/ui/EchoPanels.tsx）から書き換えて公開できる。
// 読めない値が入っていたら、ゲームを動かさずにエラーにする（テストで見つかるので、公開はされない）

import type { Body, EchoId, Element } from './types';

export const ECHO_IDS = ['fire', 'ice', 'light', 'dark', 'soft', 'hard', 'spirit', 'plain', 'warmth', 'pulse'] as const satisfies readonly EchoId[];

/** 敵のランク。通常の敵・強敵・ボス */
export const FOE_RANKS = ['normal', 'elite', 'boss'] as const;
export type FoeRank = (typeof FOE_RANKS)[number];
export const RANK_LABELS: Record<FoeRank, string> = { normal: '通常の敵', elite: '強敵', boss: 'ボス' };

export type DropRates = Record<FoeRank, number>; // %
export type SlotWeights = { one: number; two: number; three: number };
export const SLOT_KEYS = ['one', 'two', 'three'] as const satisfies readonly (keyof SlotWeights)[];
export const SLOT_LABELS: Record<keyof SlotWeights, string> = { one: 'スロット1個', two: 'スロット2個', three: 'スロット3個' };

export type EchoEffect = { name: string; weapon: number }; // weapon：武器にはめたときの数字（属性の残響は使わない）

export type EchoMaster = {
  engraved: { drop: DropRates; slots: SlotWeights; tierMin: number; tierMax: number };
  echo: { drop: DropRates; generalShare: number };
  effects: Record<EchoId, EchoEffect>;
};

export const ECHO_LIMITS = {
  name: { max: 16 },
  rate: { min: 0, max: 100 }, // 落とす確率（%）。小数第2位まで
  weight: { min: 0, max: 100 },
  tier: { min: 1, max: 10 },
  share: { min: 0, max: 100 },
  value: { min: 0, max: 100 },
} as const;

/** 満腹度の軽減の合計の上限（%） */
export const ECHO_CAPS = { saving: 90 } as const;
/** 鼓動の残響を付けても、技ゲージが満タンになるまでの回数は、これより減らない */
export const PULSE_FLOOR = 2;

// ===== 種類ごとに決まっていること（プログラムで決める） =====

export interface EchoInfo {
  element?: Element; // この属性の力が、武器の通常攻撃に付く
  body?: Body; // この体質の敵へのダメージが増える
  unit: string | null; // 数字の単位。null なら数字は使わない（設定の欄は「―」）
  text: (v: number) => string; // 武器にはめたときの効果
  flavor: string; // 静かな一言（物語の約束：感情は抽象的に）
}

const ELEMENT_NAME: Record<Element, string> = { fire: '炎', ice: '氷', neutral: '無', light: '光', dark: '闇' };
const BODY_NAME: Record<Body, string> = { normal: '普通の体', soft: '柔らかい体', hard: '硬い体', spirit: '霊体' };

const elementEcho = (element: Element, flavor: string): EchoInfo => ({
  element,
  unit: null,
  text: () => `通常攻撃に${ELEMENT_NAME[element]}の力が付く（砥石などの力が先に効く）`,
  flavor,
});
const bodyEcho = (body: Body, flavor: string): EchoInfo => ({
  body,
  unit: '%',
  text: (v) => `${BODY_NAME[body]}の敵へのダメージが${v}%増える`,
  flavor,
});

export const ECHO_INFO: Record<EchoId, EchoInfo> = {
  fire: elementEcho('fire', '熱の名残。耳の奥で、まだ鳴っている。'),
  ice: elementEcho('ice', '冷たさの名残。息だけが白い。'),
  light: elementEcho('light', 'まぶしさの名残。目を閉じても、消えない。'),
  dark: elementEcho('dark', '暗がりの名残。静かに、足元にある。'),
  soft: bodyEcho('soft', 'やわらかなものの名残。触れると、すぐ形が変わる。'),
  hard: bodyEcho('hard', 'かたいものの名残。重さだけが残っている。'),
  spirit: bodyEcho('spirit', '輪郭のないものの名残。近づくと、揺れる。'),
  plain: { unit: '', text: (v) => `攻撃力が${v}上がる`, flavor: 'なんでもない日の名残。それでも、手放せない。' },
  warmth: { unit: '%', text: (v) => `満腹度の減りが${v}%遅くなる`, flavor: 'あたたかいものの名残。手のひらに、少しだけ残る。' },
  pulse: { unit: '回', text: (v) => `技ゲージが満タンになるまでの回数が${v}減る（${PULSE_FLOOR}回より減らない）`, flavor: '胸の奥の名残。止まりそうで、止まらない。' },
};

/** 残響の効果の説明（武器にはめたとき） */
export function echoText(master: EchoMaster, id: EchoId): string {
  return ECHO_INFO[id].text(master.effects[id].weapon);
}

// ===== 確かめる =====

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const intIn = (v: unknown, r: { min: number; max: number }) => typeof v === 'number' && Number.isInteger(v) && v >= r.min && v <= r.max;
const rateIn = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= ECHO_LIMITS.rate.min && v <= ECHO_LIMITS.rate.max && Math.round(v * 100) === v * 100;

/** 設定の直すところ（日本語の文）。なければ空 */
export function echoProblems(data: unknown): string[] {
  const out: string[] = [];
  if (!isObj(data)) return ['残響の設定が読めない'];
  const rates = (group: unknown, label: string) => {
    for (const r of FOE_RANKS) {
      if (!rateIn(isObj(group) ? group[r] : undefined)) out.push(`${label}（${RANK_LABELS[r]}）：確率は0〜100%の数（小数第2位まで）にする`);
    }
  };
  const engraved = data.engraved;
  if (!isObj(engraved)) out.push('刻印武器の設定が読めない');
  else {
    rates(engraved.drop, '刻印武器を落とす確率');
    const slots = engraved.slots;
    const weights = SLOT_KEYS.map((k) => (isObj(slots) ? slots[k] : undefined));
    SLOT_KEYS.forEach((k, i) => {
      if (!intIn(weights[i], ECHO_LIMITS.weight)) out.push(`${SLOT_LABELS[k]}の割合は${ECHO_LIMITS.weight.min}〜${ECHO_LIMITS.weight.max}の整数にする`);
    });
    if (weights.every((w) => typeof w === 'number') && (weights as number[]).reduce((a, b) => a + b, 0) <= 0) out.push('スロット数の割合は、どれかを1以上にする');
    if (!intIn(engraved.tierMin, ECHO_LIMITS.tier)) out.push(`落とす装備の最小の段階は${ECHO_LIMITS.tier.min}〜${ECHO_LIMITS.tier.max}の整数にする`);
    if (!intIn(engraved.tierMax, ECHO_LIMITS.tier)) out.push(`落とす装備の最大の段階は${ECHO_LIMITS.tier.min}〜${ECHO_LIMITS.tier.max}の整数にする`);
    if (typeof engraved.tierMin === 'number' && typeof engraved.tierMax === 'number' && engraved.tierMin > engraved.tierMax) out.push('落とす装備の最小の段階は、最大の段階以下にする');
  }
  const echo = data.echo;
  if (!isObj(echo)) out.push('残響の落とし方の設定が読めない');
  else {
    rates(echo.drop, '残響を落とす確率');
    if (!intIn(echo.generalShare, ECHO_LIMITS.share)) out.push(`ぬくもり・鼓動を落とす割合は${ECHO_LIMITS.share.min}〜${ECHO_LIMITS.share.max}%の整数にする`);
  }
  const names = new Map<string, string>();
  for (const id of ECHO_IDS) {
    const v = isObj(data.effects) ? data.effects[id] : undefined;
    const at = `残響（${id}）`;
    if (!isObj(v)) {
      out.push(`${at}：読めない`);
      continue;
    }
    if (typeof v.name !== 'string' || !v.name.trim()) out.push(`${at}：名前が空になっている`);
    else if (v.name.length > ECHO_LIMITS.name.max) out.push(`${at}：名前は${ECHO_LIMITS.name.max}文字までにする`);
    else if (names.has(v.name.trim())) out.push(`${at}：名前「${v.name}」が、${names.get(v.name.trim())}と同じになっている`);
    else names.set(v.name.trim(), at);
    if (!intIn(v.weapon, ECHO_LIMITS.value)) out.push(`${at}：数字は${ECHO_LIMITS.value.min}〜${ECHO_LIMITS.value.max}の整数にする`);
  }
  return out;
}

export function parseEchoMaster(data: unknown): EchoMaster {
  const problems = echoProblems(data);
  if (problems.length) throw new Error(`残響の設定（echoes.json）が正しくない：\n${problems.join('\n')}`);
  return data as EchoMaster;
}

export function serializeEchoMaster(master: EchoMaster): string {
  return `${JSON.stringify(master, null, 2)}\n`;
}

/** 変えたところを、日本語の文で並べる（公開の欄とコミットの説明に使う） */
export function describeEchoChanges(before: EchoMaster, after: EchoMaster): string[] {
  const out: string[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  for (const r of FOE_RANKS) {
    if (before.engraved.drop[r] !== after.engraved.drop[r]) out.push(`刻印武器を落とす確率（${RANK_LABELS[r]}）：${before.engraved.drop[r]}% → ${after.engraved.drop[r]}%`);
    if (before.echo.drop[r] !== after.echo.drop[r]) out.push(`残響を落とす確率（${RANK_LABELS[r]}）：${before.echo.drop[r]}% → ${after.echo.drop[r]}%`);
  }
  for (const k of SLOT_KEYS) if (before.engraved.slots[k] !== after.engraved.slots[k]) out.push(`${SLOT_LABELS[k]}の割合：${before.engraved.slots[k]} → ${after.engraved.slots[k]}`);
  if (before.engraved.tierMin !== after.engraved.tierMin) out.push(`落とす装備の最小の段階：${before.engraved.tierMin} → ${after.engraved.tierMin}`);
  if (before.engraved.tierMax !== after.engraved.tierMax) out.push(`落とす装備の最大の段階：${before.engraved.tierMax} → ${after.engraved.tierMax}`);
  if (before.echo.generalShare !== after.echo.generalShare) out.push(`ぬくもり・鼓動を落とす割合：${before.echo.generalShare}% → ${after.echo.generalShare}%`);
  for (const id of ECHO_IDS) {
    const a = before.effects[id];
    const b = after.effects[id];
    if (same(a, b)) continue;
    if (a.name !== b.name) out.push(`${a.name}：名前 ${a.name} → ${b.name}`);
    if (a.weapon !== b.weapon) out.push(`${b.name}：数字 ${a.weapon} → ${b.weapon}`);
  }
  return out;
}
