// 残響と刻印武器の働き。設計は docs/echo-spec.md、数字は echoes.json（管理画面の「残響」タブ。echoMaster.ts）。
// ・効果：装備している刻印武器にはめた残響（PlayerStats.echoes）から、攻撃力・魔力・ダメージの増減・属性の力・通常攻撃のおまけ（追加ダメージ・毒の霧・足止め・回復）・満腹度・技ゲージ・視界・敵に気付かれる距離・お金を決める
// ・落とし物：敵を倒したとき、ごく稀に刻印武器を、少し稀に残響を落とす。残響は、敵の属性・体質・行動の個性・ランク・眠っていたかに合うものが落ちる
// 落とすくじは、探索の乱数を使わない（シードと行動の回数と敵の番号から決める）。今までの探索の流れを変えないため。
// ほかのロジックと同じく、状態を受け取って値を返す純粋関数でできている。

import { ECHO_MASTER, ITEMS } from './data';
import { ECHO_CAPS, GENERAL_ECHOES, HUSH_FLOOR, PULSE_FLOOR, ECHO_INFO, type FoeRank } from './echoMaster';
import { DUAL_PAIRS, dualRingId, gearId } from './itemMaster';
import { nextInt, nextRandom } from './rng';
import type { Body, EchoId, Element, EnemyDef, EnemyId, GearBaseId, ItemId } from './types';

export const echoName = (id: EchoId): string => ECHO_MASTER.effects[id].name;

// ===== 効果 =====
// 残響は、刻印武器のスロットにはめる（防具にスロットはない）。echoes は、装備している刻印武器にはめた残響

const value = (id: EchoId): number => ECHO_MASTER.effects[id].weapon;
const total = (ids: readonly EchoId[], match: (id: EchoId) => boolean): number => ids.filter(match).reduce((sum, id) => sum + value(id), 0);

/** 「ただの残響」の分の攻撃力 */
export const echoAtk = (echoes?: readonly EchoId[]): number => total(echoes ?? [], (id) => id === 'plain');

/** 「ささやきの残響」の分の魔力 */
export const echoMag = (echoes?: readonly EchoId[]): number => total(echoes ?? [], (id) => id === 'whisper');

/** その残響の数字の合計（はめた数だけ足し算。linger・slumber・stagnant・falter・share・lamp・pocket などに使う） */
export const echoSum = (echoes: readonly EchoId[] | undefined, id: EchoId): number => total(echoes ?? [], (x) => x === id);

/** 眠っている敵へのダメージの倍率（寝息の残響。足し算） */
export const slumberRate = (echoes: readonly EchoId[] | undefined, asleep: boolean | undefined): number => (asleep ? 1 + echoSum(echoes, 'slumber') / 100 : 1);

/** 余韻の残響の追加ダメージ（当てたダメージの割合。残響がなければ0、あれば1より減らない） */
export function lingerDamage(echoes: readonly EchoId[] | undefined, dealt: number): number {
  const rate = echoSum(echoes, 'linger');
  return rate > 0 && dealt > 0 ? Math.max(1, Math.round((dealt * rate) / 100)) : 0;
}

/** 分け合いの残響で回復するHP（与えたダメージの割合。残響がなければ0、あれば1より減らない） */
export function shareHeal(echoes: readonly EchoId[] | undefined, dealt: number): number {
  const rate = echoSum(echoes, 'share');
  return rate > 0 && dealt > 0 ? Math.max(1, Math.round((dealt * rate) / 100)) : 0;
}

/** ひそやかの残響を付けたあとの、敵に気付かれる距離（HUSH_FLOOR マスより縮まない。もとから短ければそのまま） */
export function hushedRange(range: number, echoes?: readonly EchoId[]): number {
  const cut = echoSum(echoes, 'hush');
  return cut > 0 ? Math.max(Math.min(range, HUSH_FLOOR), range - cut) : range;
}

/** 灯の残響で広がる視界（マス） */
export const lampRadius = (echoes?: readonly EchoId[]): number => echoSum(echoes, 'lamp');

/** 拾い癖の残響を付けたあとの、敵が落とすお金 */
export const pocketGold = (gold: number, echoes?: readonly EchoId[]): number => (gold > 0 ? Math.round(gold * (1 + echoSum(echoes, 'pocket') / 100)) : gold);

/** 残響が付ける属性（なければ null。複数あれば、先にはめたもの）。砥石などの力が付いているときは、そちらが先に効く */
export function imbuedElement(echoes?: readonly EchoId[]): Element | null {
  for (const id of echoes ?? []) {
    const element = ECHO_INFO[id].element;
    if (element) return element;
  }
  return null;
}

/** その体質の敵へのダメージの倍率（柔らかい・硬い・霊体の残響。足し算） */
export function bodyDamageRate(echoes: readonly EchoId[] | undefined, body: Body): number {
  return 1 + total(echoes ?? [], (id) => ECHO_INFO[id].body === body) / 100;
}

/** 満腹度の減りを何%遅くするか（ぬくもりの残響の足し算。90%まで） */
export const satietySaving = (echoes?: readonly EchoId[]): number => Math.min(ECHO_CAPS.saving, total(echoes ?? [], (id) => id === 'warmth'));

/** 行動1回で、満腹度を減らさずに済むか（turn はその行動を終えたあとの回数）。割合を決まった間隔で配るので、乱数は使わない */
export const savesSatiety = (saving: number, turn: number): boolean => Math.floor((turn * saving) / 100) > Math.floor(((turn - 1) * saving) / 100);

/** 鼓動の残響を付けたあとの、技ゲージの満タン（max は付ける前。PULSE_FLOOR 回より減らない） */
export function gaugeWithPulse(max: number, echoes?: readonly EchoId[]): number {
  const cut = total(echoes ?? [], (id) => id === 'pulse');
  return cut > 0 ? Math.max(Math.min(max, PULSE_FLOOR), max - cut) : max;
}

// ===== 落とし物 =====

/** 落とした刻印武器。base：元の武器の品物（段階つき）、slots：スロットの数 */
export interface DroppedGear {
  base: ItemId;
  slots: number;
}

/** 探索のあいだに拾った刻印武器と残響。探索が終わったとき（力尽きても、リタイアしても）倉庫に入る */
export interface Found {
  echoes: EchoId[];
  gear: DroppedGear[];
  rings: ItemId[]; // 二重耐性の指輪
  met: EnemyId[]; // 出会った敵（見えた敵。敵の図鑑に載る。docs/enemy-weakness.md）
}

export const noFound = (): Found => ({ echoes: [], gear: [], rings: [], met: [] });

/** 刻印武器の名前 */
export const gearName = (base: ItemId): string => `刻まれた${ITEMS[base].name}`;

/** 敵の体質に効く武器の種類（普通の体は、どれでも）。刻印武器は、倒した敵に合う種類が落ちる */
const WEAPON_FOR_BODY: Record<Body, readonly GearBaseId[]> = { soft: ['sword'], hard: ['hammer'], spirit: ['staff'], normal: ['sword', 'hammer', 'staff'] };

/** 倒したときの敵のようす（落とす残響の候補に効く） */
export interface LootContext {
  rank?: FoeRank; // 強敵・ボスは、余韻の残響も落とす
  asleep?: boolean; // 眠っているあいだに倒すと、寝息の残響も落とす
}

/** 行動の個性に合う残響（毒→澱み、突進→ためらい、見張り→ひそやか、遠距離→ささやき） */
const ECHO_FOR_BEHAVIOR: Partial<Record<NonNullable<EnemyDef['behaviors']>[number], EchoId>> = { poison: 'stagnant', charger: 'falter', alarm: 'hush', ranged: 'whisper' };

/**
 * 敵が落とす残響の候補（この中から同じ割合で1つ選ぶ）。
 * 属性に合うものと、体質に合うもの（無属性・普通の体は、ただの残響）。そのうえで、闇の敵は分け合い、行動の個性に合うもの、強敵・ボスは余韻、眠っていたら寝息も加わる
 */
export function echoesFor(enemy: Pick<EnemyDef, 'element' | 'body' | 'behaviors'>, context: LootContext = {}): EchoId[] {
  const out: EchoId[] = [enemy.element === 'neutral' ? 'plain' : enemy.element, enemy.body === 'normal' ? 'plain' : enemy.body];
  if (enemy.element === 'dark') out.push('share');
  for (const b of enemy.behaviors ?? []) {
    const id = ECHO_FOR_BEHAVIOR[b];
    if (id && !out.includes(id)) out.push(id);
  }
  if (context.rank === 'elite' || context.rank === 'boss') out.push('linger');
  if (context.asleep) out.push('slumber');
  return out;
}

/** 落とすくじに使う種。探索の乱数とは別に、シードと階・行動の回数・敵の番号から決める */
export function lootSeed(state: { seed: number; floor: number; turn: number }, enemyUid: number): number {
  return (state.seed ^ Math.imul(enemyUid + 1, 2654435761) ^ Math.imul(state.turn + 1, 40503) ^ Math.imul(state.floor + 1, 97)) >>> 0;
}

export interface Loot {
  gear: DroppedGear | null;
  echo: EchoId | null;
  ring: ItemId | null; // 二重耐性の指輪
}

/** 倒した敵が落とすもの（刻印武器と残響。どちらも落とさないこともあれば、両方落とすこともある） */
export function rollLoot(seed: number, enemy: Pick<EnemyDef, 'element' | 'body' | 'behaviors'>, rank: FoeRank, context: Omit<LootContext, 'rank'> = {}): Loot {
  const { engraved, echo, ring } = ECHO_MASTER;
  let state = seed;
  const roll = () => {
    const r = nextRandom(state);
    state = r.state;
    return r.value;
  };
  const pick = <T>(list: readonly T[]): T => {
    const r = nextInt(state, list.length);
    state = r.state;
    return list[r.value]!;
  };

  let gear: DroppedGear | null = null;
  if (roll() * 100 < engraved.drop[rank]) {
    const base = pick(WEAPON_FOR_BODY[enemy.body]);
    const t = nextInt(state, engraved.tierMax - engraved.tierMin + 1);
    state = t.state;
    const tier = engraved.tierMin + t.value;
    const { one, two, three } = engraved.slots;
    const at = roll() * (one + two + three);
    gear = { base: gearId(base, tier), slots: at < one ? 1 : at < one + two ? 2 : 3 };
  }

  let found: EchoId | null = null;
  if (roll() * 100 < echo.drop[rank]) {
    found = roll() * 100 < echo.generalShare ? pick<EchoId>(GENERAL_ECHOES) : pick<EchoId>(echoesFor(enemy, { ...context, rank }));
  }

  // 二重耐性の指輪：倒した敵の属性と、もう1つの属性（くじ）の組み合わせ。ここは最後に引く（前のくじの結果を変えないため）
  let dual: ItemId | null = null;
  if (roll() * 100 < ring.dual.drop[rank]) {
    const other = pick(DUAL_PAIRS.filter((p) => p.split('_').includes(enemy.element)));
    const t = nextInt(state, ring.dual.tierMax - ring.dual.tierMin + 1);
    state = t.state;
    dual = dualRingId(other, ring.dual.tierMin + t.value);
  }
  return { gear, echo: found, ring: dual };
}
