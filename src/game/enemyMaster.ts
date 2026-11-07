// 敵のマスターデータ（src/game/enemies.json）を読み、正しい形かを確かめる。
// enemies.json は、開発用の管理画面（?view=enemies、src/ui/EnemyAdmin.tsx）から書き換えて公開できる。
// 読めない値が入っていたら、ゲームを動かさずにエラーにする（テストで見つかるので、公開はされない）

import type { Body, Element, EnemyDef, EnemyId, TraitId } from './types';

export const ENEMY_IDS = [
  'goblin',
  'giant_rat',
  'stone_golem',
  'fire_imp',
  'flame_hound',
  'lava_lizard',
  'ice_imp',
  'ice_slime',
  'ice_beetle',
  'light_bird',
  'holy_armor',
  'light_wisp',
  'dark_bat',
  'shadow',
  'phantom',
  'flame_beast',
  'ice_colossus',
  'ogre_chief',
  'light_guardian',
  'dark_lord',
] as const satisfies readonly EnemyId[];

export const ELEMENTS = ['neutral', 'fire', 'ice', 'light', 'dark'] as const satisfies readonly Element[];
export const BODIES = ['normal', 'soft', 'hard', 'spirit'] as const satisfies readonly Body[];
export const MASTER_TRAITS: readonly TraitId[] = ELEMENTS;

/** 敵1体分（id は enemies.json のキー） */
export type EnemyRecord = Omit<EnemyDef, 'id'>;

/** ダンジョンごとに出る敵。pool は同じ敵を何度も並べると出やすくなる（並び順も乱数の結果に関わる） */
export type DungeonEnemies = { pool: EnemyId[]; boss: EnemyId };

export type EnemyMaster = {
  enemies: Record<EnemyId, EnemyRecord>;
  dungeons: Record<TraitId, DungeonEnemies>;
};

/** 値の範囲（管理画面の入力欄も、この範囲にする） */
export const LIMITS = {
  hp: { min: 1, max: 999 },
  atk: { min: 0, max: 99 },
  def: { min: 0, max: 99 },
  name: { max: 12 },
  /** 1つのダンジョンで、同じ敵を並べられる数（出やすさ） */
  weight: { max: 9 },
} as const;

/** 形のおかしいところを、すべて日本語の文で返す（なければ空） */
export function masterProblems(data: unknown): string[] {
  const problems: string[] = [];
  if (!isObject(data) || !isObject(data.enemies) || !isObject(data.dungeons)) return ['enemies と dungeons がない'];
  const enemies = data.enemies;
  const dungeons = data.dungeons;
  const ids = new Set<string>(ENEMY_IDS);
  for (const key of Object.keys(enemies)) if (!ids.has(key)) problems.push(`知らない敵がいる：${key}`);
  for (const id of ENEMY_IDS) {
    const e = enemies[id];
    if (!isObject(e)) {
      problems.push(`${id} がない`);
      continue;
    }
    const label = typeof e.name === 'string' && e.name ? e.name : id;
    if (typeof e.name !== 'string' || !e.name.trim()) problems.push(`${id}：名前がない`);
    else if (e.name.length > LIMITS.name.max) problems.push(`${label}：名前は${LIMITS.name.max}文字まで`);
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
  }
  for (const trait of MASTER_TRAITS) {
    const d = dungeons[trait];
    const where = `${TRAIT_LABELS[trait]}のダンジョン`;
    if (!isObject(d)) {
      problems.push(`${where}がない`);
      continue;
    }
    if (!Array.isArray(d.pool) || d.pool.length === 0) problems.push(`${where}：道中に出る敵が1体もいない`);
    else {
      for (const id of d.pool) {
        if (!ids.has(id as string)) problems.push(`${where}：知らない敵がいる：${String(id)}`);
        else if (isObject(enemies[id as string]) && (enemies[id as string] as Record<string, unknown>).boss) {
          problems.push(`${where}：ボスは道中に出せない（${String(id)}）`);
        }
      }
      const counts = new Map<unknown, number>();
      for (const id of d.pool) counts.set(id, (counts.get(id) ?? 0) + 1);
      for (const [id, c] of counts) if (c > LIMITS.weight.max) problems.push(`${where}：同じ敵（${String(id)}）は${LIMITS.weight.max}まで`);
    }
    if (typeof d.boss !== 'string' || !ids.has(d.boss)) problems.push(`${where}：ボスがいない`);
    else if (!(isObject(enemies[d.boss]) && (enemies[d.boss] as Record<string, unknown>).boss)) {
      problems.push(`${where}：ボスに選んだ敵が、ボスになっていない（${d.boss}）`);
    }
  }
  for (const key of Object.keys(dungeons)) if (!(MASTER_TRAITS as readonly string[]).includes(key)) problems.push(`知らないダンジョンがある：${key}`);
  return problems;
}

/** enemies.json の中身を読む。おかしいところがあれば、まとめてエラーにする */
export function parseEnemyMaster(data: unknown): EnemyMaster {
  const problems = masterProblems(data);
  if (problems.length) throw new Error(`敵のデータ（enemies.json）が正しくない：\n${problems.join('\n')}`);
  return data as EnemyMaster;
}

/** ゲームで使う形（id 付き） */
export function enemyDefs(master: EnemyMaster): Record<EnemyId, EnemyDef> {
  return Object.fromEntries(ENEMY_IDS.map((id) => [id, { id, ...master.enemies[id] }])) as Record<EnemyId, EnemyDef>;
}

/** enemies.json に書く文字列（並び順をそろえ、2文字下げ。最後に改行） */
export function serializeEnemyMaster(master: EnemyMaster): string {
  const enemies = Object.fromEntries(
    ENEMY_IDS.map((id) => {
      const { name, hp, atk, def, element, body, boss } = master.enemies[id];
      return [id, boss ? { name, hp, atk, def, element, body, boss: true } : { name, hp, atk, def, element, body }];
    }),
  );
  const dungeons = Object.fromEntries(
    (['fire', 'ice', 'neutral', 'light', 'dark'] as const).map((t) => [t, { pool: master.dungeons[t].pool, boss: master.dungeons[t].boss }]),
  );
  return `${JSON.stringify({ enemies, dungeons }, null, 2)}\n`;
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

export const STAT_LABELS = { hp: 'HP', atk: '攻撃', def: '防御' } as const;
export const TRAIT_LABELS: Record<TraitId, string> = { neutral: '無属性', fire: '炎', ice: '氷', light: '光', dark: '闇' };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 2つのデータの違いを、日本語の文で並べる（管理画面で、公開する前に確かめる） */
export function describeChanges(before: EnemyMaster, after: EnemyMaster, names: Record<string, string> = {}): string[] {
  const out: string[] = [];
  const name = (id: EnemyId) => after.enemies[id]?.name || names[id] || id;
  for (const id of ENEMY_IDS) {
    const a = before.enemies[id];
    const b = after.enemies[id];
    if (a.name !== b.name) out.push(`${a.name}：名前 → ${b.name}`);
    for (const key of ['hp', 'atk', 'def'] as const) if (a[key] !== b[key]) out.push(`${b.name}：${STAT_LABELS[key]} ${a[key]} → ${b[key]}`);
    if (a.element !== b.element) out.push(`${b.name}：属性 ${TRAIT_LABELS[a.element]} → ${TRAIT_LABELS[b.element]}`);
    if (a.body !== b.body) out.push(`${b.name}：体質を変更`);
    if (Boolean(a.boss) !== Boolean(b.boss)) out.push(`${b.name}：${b.boss ? 'ボスにする' : 'ボスではなくする'}`);
  }
  for (const trait of MASTER_TRAITS) {
    const a = before.dungeons[trait];
    const b = after.dungeons[trait];
    const where = `${TRAIT_LABELS[trait]}のダンジョン`;
    if (a.boss !== b.boss) out.push(`${where}：ボス ${name(a.boss)} → ${name(b.boss)}`);
    for (const id of ENEMY_IDS) {
      const wa = weightOf(a.pool, id);
      const wb = weightOf(b.pool, id);
      if (wa !== wb) out.push(`${where}：${name(id)}の出やすさ ${wa} → ${wb}`);
    }
    if (a.pool.join() !== b.pool.join() && ENEMY_IDS.every((id) => weightOf(a.pool, id) === weightOf(b.pool, id))) {
      out.push(`${where}：道中の敵の並び順`);
    }
  }
  return out;
}
