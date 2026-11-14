// 敵のマスターデータ（src/game/enemies.json）を読み、正しい形かを確かめる。
// enemies.json は、すべての敵の強さ・見た目・報酬の一覧（マスター）。どのダンジョンにどの敵が出るかは、ここではなく、
// ダンジョンの設定ファイル（src/game/dungeons/*.json の encounters）で、このマスターの中から選ぶ。
// enemies.json は、開発用の管理画面（?view=admin の「敵」タブ。src/ui/Admin.tsx、src/ui/EnemyPanels.tsx）から書き換えて公開できる。
// 敵を足す・消すこともできる（敵の種類はプログラムに決め打ちせず、このデータにある敵がすべて）。
// 読めない値が入っていたら、ゲームを動かさずにエラーにする（テストで見つかるので、公開はされない）

import { SPRITES, type SpriteId } from '../sprites/data';
import type { Body, Element, EnemyDef, EnemyId, TraitId } from './types';

export const ELEMENTS = ['neutral', 'fire', 'ice', 'light', 'dark'] as const satisfies readonly Element[];
export const BODIES = ['normal', 'soft', 'hard', 'spirit'] as const satisfies readonly Body[];
export const MASTER_TRAITS: readonly TraitId[] = ELEMENTS;
/** 敵の見た目に使える、もとのドット絵（主人公の絵は使えない） */
export const ENEMY_SPRITES = (Object.keys(SPRITES) as SpriteId[]).filter((s) => s !== 'hero');

/** 敵の見た目：もとのドット絵と、色の差し替え（ドット絵の文字ごとの色） */
export type EnemyLook = { sprite: SpriteId; recolor?: Record<string, string> };

/**
 * 倒したときの報酬。gold：落とす金貨、exp：経験値（たまるとその挑戦のあいだレベルが上がる）、
 * drop：回復薬か食料を落とす確率（%）。強敵は data.ts の REWARD_CONFIG の倍率で増え、道具は必ず宝箱で落とす。ボスは使わない
 */
export type EnemyReward = { gold: number; exp: number; drop: number };

/** 敵1体分（id は enemies.json のキー） */
export type EnemyRecord = Omit<EnemyDef, 'id'> & { look: EnemyLook; reward: EnemyReward };

/**
 * ダンジョンの属性ごとに出る敵（ダンジョンの設定ファイルの encounters に、属性ごとに1つずつ書く）。
 * pool は道中に出る敵で、同じ敵を何度も並べると出やすくなる（並び順も乱数の結果に関わる）。boss はボスの階に出る敵
 */
export type DungeonEnemies = { pool: EnemyId[]; boss: EnemyId };

/** 属性ごとに出る敵（5つの属性すべて） */
export type Encounters = Record<TraitId, DungeonEnemies>;

export type EnemyMaster = {
  enemies: Record<EnemyId, EnemyRecord>;
};

/** 値の範囲（管理画面の入力欄も、この範囲にする） */
export const LIMITS = {
  hp: { min: 1, max: 999 },
  atk: { min: 0, max: 99 },
  def: { min: 0, max: 99 },
  name: { max: 12 },
  /** 敵の ID：英小文字で始まり、英小文字・数字・_ だけ */
  id: { pattern: /^[a-z][a-z0-9_]{1,23}$/, max: 24 },
  gold: { min: 0, max: 999 },
  exp: { min: 0, max: 999 },
  drop: { min: 0, max: 100 },
  /** 1つのダンジョンで、同じ敵を並べられる数（出やすさ） */
  weight: { max: 9 },
} as const;

/** 敵の ID（enemies.json に書いてある順） */
export function enemyIds(master: Pick<EnemyMaster, 'enemies'>): EnemyId[] {
  return Object.keys(master.enemies);
}

/** 形のおかしいところを、すべて日本語の文で返す（なければ空） */
export function masterProblems(data: unknown): string[] {
  const problems: string[] = [];
  if (!isObject(data) || !isObject(data.enemies)) return ['enemies がない'];
  const enemies = data.enemies;
  const ids = Object.keys(enemies);
  if (ids.length === 0) problems.push('敵が1体もいない');
  const names = new Map<string, string>();
  for (const id of ids) {
    const e = enemies[id];
    if (!LIMITS.id.pattern.test(id)) problems.push(`ID「${id}」：英小文字で始まり、英小文字・数字・_ だけの2〜${LIMITS.id.max}文字にする`);
    if (!isObject(e)) {
      problems.push(`${id}：中身がない`);
      continue;
    }
    const label = typeof e.name === 'string' && e.name ? e.name : id;
    if (typeof e.name !== 'string' || !e.name.trim()) problems.push(`${id}：名前がない`);
    else if (e.name.length > LIMITS.name.max) problems.push(`${label}：名前は${LIMITS.name.max}文字まで`);
    else if (names.has(e.name)) problems.push(`${label}：同じ名前の敵がほかにもいる（${names.get(e.name)}）`);
    else names.set(e.name, id);
    for (const key of ['hp', 'atk', 'def'] as const) {
      const v = e[key];
      const { min, max } = LIMITS[key];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
        problems.push(`${label}：${STAT_LABELS[key]}は${min}〜${max}の整数にする`);
      }
    }
    if (!(ELEMENTS as readonly unknown[]).includes(e.element)) problems.push(`${label}：属性が正しくない`);
    if (!(BODIES as readonly unknown[]).includes(e.body)) problems.push(`${label}：体質が正しくない`);
    if (e.boss !== undefined && typeof e.boss !== 'boolean') problems.push(`${label}：ボスかどうかが正しくない`);
    problems.push(...lookProblems(label, e.look));
    if (!isObject(e.reward)) problems.push(`${label}：倒したときの報酬がない`);
    else {
      for (const key of ['gold', 'exp', 'drop'] as const) {
        const v = e.reward[key];
        const { min, max } = LIMITS[key];
        if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) problems.push(`${label}：${REWARD_LABELS[key]}は${min}〜${max}の整数にする`);
      }
    }
  }
  return problems;
}

/**
 * ダンジョンの設定ファイルの encounters（属性ごとに出る敵）の、おかしいところ。
 * 敵は、マスター（enemies.json）にいる敵から選ぶ。道中にはボスを出せず、ボスにはボスにした敵だけを選べる
 */
export function encounterProblems(data: unknown, master: Pick<EnemyMaster, 'enemies'>): string[] {
  if (!isObject(data)) return ['属性ごとに出る敵（encounters）がない'];
  const problems: string[] = [];
  const enemies = master.enemies as Record<string, EnemyRecord | undefined>;
  const isBoss = (id: unknown) => typeof id === 'string' && enemies[id]?.boss === true;
  for (const trait of MASTER_TRAITS) {
    const d = data[trait];
    const where = `${TRAIT_LABELS[trait]}の属性`;
    if (!isObject(d)) {
      problems.push(`${where}の敵がない`);
      continue;
    }
    if (!Array.isArray(d.pool) || d.pool.length === 0) problems.push(`${where}：道中に出る敵が1体もいない`);
    else {
      const counts = new Map<unknown, number>();
      for (const id of d.pool) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
        if (counts.get(id) !== 1) continue;
        if (typeof id !== 'string' || !enemies[id]) problems.push(`${where}：敵のデータにいない敵が入っている（${String(id)}）`);
        else if (isBoss(id)) problems.push(`${where}：ボスは道中に出せない（${String(id)}）`);
      }
      for (const [id, c] of counts) if (c > LIMITS.weight.max) problems.push(`${where}：同じ敵（${String(id)}）は${LIMITS.weight.max}まで`);
    }
    if (typeof d.boss !== 'string' || !enemies[d.boss]) problems.push(`${where}：ボスがいない`);
    else if (!isBoss(d.boss)) problems.push(`${where}：ボスに選んだ敵が、ボスになっていない（${d.boss}）`);
  }
  for (const key of Object.keys(data)) if (!(MASTER_TRAITS as readonly string[]).includes(key)) problems.push(`知らない属性がある：${key}`);
  return problems;
}

function lookProblems(label: string, look: unknown): string[] {
  if (!isObject(look) || typeof look.sprite !== 'string' || !(ENEMY_SPRITES as readonly string[]).includes(look.sprite)) {
    return [`${label}：見た目のもとの絵が正しくない`];
  }
  if (look.recolor === undefined) return [];
  if (!isObject(look.recolor)) return [`${label}：見た目の色が正しくない`];
  const used = new Set(SPRITES[look.sprite as SpriteId].join(''));
  const out: string[] = [];
  for (const [ch, color] of Object.entries(look.recolor)) {
    if (!used.has(ch)) out.push(`${label}：見た目の色に、絵で使っていない文字（${ch}）がある`);
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) out.push(`${label}：見た目の色（${ch}）は #rrggbb で書く`);
  }
  return out;
}

/** enemies.json の中身を読む。おかしいところがあれば、まとめてエラーにする */
export function parseEnemyMaster(data: unknown): EnemyMaster {
  const problems = masterProblems(data);
  if (problems.length) throw new Error(`敵のデータ（enemies.json）が正しくない：\n${problems.join('\n')}`);
  return data as EnemyMaster;
}

/** ゲームで使う形（id 付き。見た目は含めない） */
export function enemyDefs(master: EnemyMaster): Record<EnemyId, EnemyDef> {
  return Object.fromEntries(
    enemyIds(master).map((id) => {
      const { look: _look, reward: _reward, ...rest } = master.enemies[id]!;
      return [id, { id, ...rest }];
    }),
  );
}

/** enemies.json に書く文字列（項目の並び順をそろえ、2文字下げ。最後に改行） */
export function serializeEnemyMaster(master: EnemyMaster): string {
  const enemies = Object.fromEntries(
    enemyIds(master).map((id) => {
      const { name, hp, atk, def, element, body, boss, look, reward } = master.enemies[id]!;
      const cleanLook = look.recolor && Object.keys(look.recolor).length ? { sprite: look.sprite, recolor: look.recolor } : { sprite: look.sprite };
      const cleanReward = { gold: reward.gold, exp: reward.exp, drop: reward.drop };
      return [id, { name, hp, atk, def, element, body, ...(boss ? { boss: true } : {}), look: cleanLook, reward: cleanReward }];
    }),
  );
  return `${JSON.stringify({ enemies }, null, 2)}\n`;
}

/** ファイルに書く encounters（属性の並び順と、項目の並び順をそろえる） */
export function cleanEncounters(encounters: Encounters): Encounters {
  return Object.fromEntries(ENCOUNTER_ORDER.map((t) => [t, { pool: [...encounters[t].pool], boss: encounters[t].boss }])) as Encounters;
}

/** ファイルに書くときの、属性の並び順 */
const ENCOUNTER_ORDER = ['fire', 'ice', 'neutral', 'light', 'dark'] as const satisfies readonly TraitId[];

/** 敵を足す（データの最後に入る。どのダンジョンにもまだ出ない） */
export function addEnemy(master: EnemyMaster, id: EnemyId, record: EnemyRecord): EnemyMaster {
  return { ...master, enemies: { ...master.enemies, [id]: record } };
}

/** 敵をマスターから消す（ダンジョンの道中から外すのは、encountersWithout で、ダンジョンの設定ごとに行う） */
export function removeEnemy(master: EnemyMaster, id: EnemyId): EnemyMaster {
  const enemies = { ...master.enemies };
  delete enemies[id];
  return { ...master, enemies };
}

/** その敵を、道中から外した encounters（ボスに選ばれているときは、そのまま。ボスは先に変える） */
export function encountersWithout(encounters: Encounters, id: EnemyId): Encounters {
  return Object.fromEntries(MASTER_TRAITS.map((t) => [t, { ...encounters[t], pool: encounters[t].pool.filter((p) => p !== id) }])) as Encounters;
}

/** その敵をボスにしている属性 */
export function traitsWithBoss(encounters: Encounters, id: EnemyId): TraitId[] {
  return MASTER_TRAITS.filter((t) => encounters[t].boss === id);
}

/** ダンジョンの道中に、その敵がいくつ並んでいるか（出やすさ） */
export function weightOf(pool: readonly EnemyId[], id: EnemyId): number {
  return pool.filter((p) => p === id).length;
}

/**
 * 出やすさを変えた pool を作る。並び順は乱数の結果に関わるので、今の並び順をできるだけ保つ
 * （減らすときは後ろから外し、増やすときは同じ敵の最後の後ろに足す。新しく入る敵は末尾に足す）
 */
export function setWeight(pool: readonly EnemyId[], id: EnemyId, weight: number): EnemyId[] {
  const next = [...pool];
  let current = weightOf(next, id);
  while (current > weight) {
    next.splice(next.lastIndexOf(id), 1);
    current--;
  }
  while (current < weight) {
    const last = next.lastIndexOf(id);
    if (last < 0) next.push(id);
    else next.splice(last + 1, 0, id);
    current++;
  }
  return next;
}

/** 2つのデータの違いを、日本語の文で並べる（管理画面で、公開する前に確かめる） */
export function describeChanges(before: EnemyMaster, after: EnemyMaster): string[] {
  const out: string[] = [];
  for (const id of enemyIds(before)) if (!(id in after.enemies)) out.push(`${before.enemies[id]!.name}（${id}）を消す`);
  for (const id of enemyIds(after)) if (!(id in before.enemies)) out.push(`${after.enemies[id]!.name}（${id}）を足す`);
  for (const id of enemyIds(after)) {
    const a = before.enemies[id];
    const b = after.enemies[id]!;
    if (!a) continue;
    if (a.name !== b.name) out.push(`${a.name}：名前 → ${b.name}`);
    for (const key of ['hp', 'atk', 'def'] as const) if (a[key] !== b[key]) out.push(`${b.name}：${STAT_LABELS[key]} ${a[key]} → ${b[key]}`);
    if (a.element !== b.element) out.push(`${b.name}：属性 ${TRAIT_LABELS[a.element]} → ${TRAIT_LABELS[b.element]}`);
    if (a.body !== b.body) out.push(`${b.name}：体質を変更`);
    if (Boolean(a.boss) !== Boolean(b.boss)) out.push(`${b.name}：${b.boss ? 'ボスにする' : 'ボスではなくする'}`);
    if (JSON.stringify(a.look) !== JSON.stringify(b.look)) out.push(`${b.name}：見た目を変更`);
    for (const key of ['gold', 'exp', 'drop'] as const) {
      if (a.reward[key] !== b.reward[key]) out.push(`${b.name}：${REWARD_LABELS[key]} ${a.reward[key]} → ${b.reward[key]}`);
    }
  }
  return out;
}

/**
 * 属性ごとに出る敵の違いを、日本語の文で並べる。names は敵の名前（消した敵の名前も引けるように、公開版と変えたあとの両方）。
 * alive は、今も敵のデータにいる敵か（消した敵が道中から外れるのは、敵を「消す」に含めるので書かない）
 */
export function describeEncounterChanges(before: Encounters, after: Encounters, names: (id: EnemyId) => string, alive: (id: EnemyId) => boolean): string[] {
  const out: string[] = [];
  for (const trait of MASTER_TRAITS) {
    const a = before[trait];
    const b = after[trait];
    const where = `${TRAIT_LABELS[trait]}の属性`;
    if (a.boss !== b.boss) out.push(`${where}：ボス ${names(a.boss)} → ${names(b.boss)}`);
    const all = [...new Set([...a.pool, ...b.pool])];
    for (const id of all) {
      const wa = weightOf(a.pool, id);
      const wb = weightOf(b.pool, id);
      if (wa !== wb && alive(id)) out.push(`${where}：${names(id)}の出やすさ ${wa} → ${wb}`);
    }
    if (a.pool.join() !== b.pool.join() && all.every((id) => weightOf(a.pool, id) === weightOf(b.pool, id))) {
      out.push(`${where}：道中の敵の並び順`);
    }
  }
  return out;
}

export const STAT_LABELS = { hp: 'HP', atk: '攻撃', def: '防御' } as const;
export const REWARD_LABELS = { gold: '金貨', exp: '経験値', drop: '道具を落とす確率（%）' } as const;

/** 倒したときの報酬（敵の ID ごと） */
export function enemyRewards(master: EnemyMaster): Record<EnemyId, EnemyReward> {
  return Object.fromEntries(enemyIds(master).map((id) => [id, master.enemies[id]!.reward]));
}
export const TRAIT_LABELS: Record<TraitId, string> = { neutral: '無属性', fire: '炎', ice: '氷', light: '光', dark: '闇' };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
