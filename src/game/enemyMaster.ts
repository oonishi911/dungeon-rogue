// 敵のマスターデータ（src/game/enemies.json）を読み、正しい形かを確かめる。
// enemies.json は、開発用の管理画面（?view=enemies、src/ui/EnemyAdmin.tsx）から書き換えて公開できる。
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

/** 敵1体分（id は enemies.json のキー） */
export type EnemyRecord = Omit<EnemyDef, 'id'> & { look: EnemyLook };

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
  /** 敵の ID：英小文字で始まり、英小文字・数字・_ だけ */
  id: { pattern: /^[a-z][a-z0-9_]{1,23}$/, max: 24 },
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
  if (!isObject(data) || !isObject(data.enemies) || !isObject(data.dungeons)) return ['enemies と dungeons がない'];
  const enemies = data.enemies;
  const dungeons = data.dungeons;
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
  }
  const isBoss = (id: unknown) => typeof id === 'string' && isObject(enemies[id]) && (enemies[id] as Record<string, unknown>).boss === true;
  for (const trait of MASTER_TRAITS) {
    const d = dungeons[trait];
    const where = `${TRAIT_LABELS[trait]}のダンジョン`;
    if (!isObject(d)) {
      problems.push(`${where}がない`);
      continue;
    }
    if (!Array.isArray(d.pool) || d.pool.length === 0) problems.push(`${where}：道中に出る敵が1体もいない`);
    else {
      const counts = new Map<unknown, number>();
      for (const id of d.pool) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
        if (counts.get(id) !== 1) continue;
        if (typeof id !== 'string' || !(id in enemies)) problems.push(`${where}：いない敵が入っている（${String(id)}）`);
        else if (isBoss(id)) problems.push(`${where}：ボスは道中に出せない（${String(id)}）`);
      }
      for (const [id, c] of counts) if (c > LIMITS.weight.max) problems.push(`${where}：同じ敵（${String(id)}）は${LIMITS.weight.max}まで`);
    }
    if (typeof d.boss !== 'string' || !(d.boss in enemies)) problems.push(`${where}：ボスがいない`);
    else if (!isBoss(d.boss)) problems.push(`${where}：ボスに選んだ敵が、ボスになっていない（${d.boss}）`);
  }
  for (const key of Object.keys(dungeons)) if (!(MASTER_TRAITS as readonly string[]).includes(key)) problems.push(`知らないダンジョンがある：${key}`);
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
      const { look: _look, ...rest } = master.enemies[id]!;
      return [id, { id, ...rest }];
    }),
  );
}

/** enemies.json に書く文字列（項目の並び順をそろえ、2文字下げ。最後に改行） */
export function serializeEnemyMaster(master: EnemyMaster): string {
  const enemies = Object.fromEntries(
    enemyIds(master).map((id) => {
      const { name, hp, atk, def, element, body, boss, look } = master.enemies[id]!;
      const cleanLook = look.recolor && Object.keys(look.recolor).length ? { sprite: look.sprite, recolor: look.recolor } : { sprite: look.sprite };
      return [id, { name, hp, atk, def, element, body, ...(boss ? { boss: true } : {}), look: cleanLook }];
    }),
  );
  const dungeons = Object.fromEntries(
    (['fire', 'ice', 'neutral', 'light', 'dark'] as const).map((t) => [t, { pool: master.dungeons[t].pool, boss: master.dungeons[t].boss }]),
  );
  return `${JSON.stringify({ enemies, dungeons }, null, 2)}\n`;
}

/** 敵を足す（データの最後に入る。どのダンジョンにもまだ出ない） */
export function addEnemy(master: EnemyMaster, id: EnemyId, record: EnemyRecord): EnemyMaster {
  return { ...master, enemies: { ...master.enemies, [id]: record } };
}

/** 敵を消す。道中の敵からも外す（ボスに選ばれているダンジョンがあるときは、消すとボスがいなくなる） */
export function removeEnemy(master: EnemyMaster, id: EnemyId): EnemyMaster {
  const enemies = { ...master.enemies };
  delete enemies[id];
  const dungeons = Object.fromEntries(
    MASTER_TRAITS.map((t) => [t, { ...master.dungeons[t], pool: master.dungeons[t].pool.filter((p) => p !== id) }]),
  ) as Record<TraitId, DungeonEnemies>;
  return { enemies, dungeons };
}

/** その敵をボスにしているダンジョン */
export function dungeonsWithBoss(master: EnemyMaster, id: EnemyId): TraitId[] {
  return MASTER_TRAITS.filter((t) => master.dungeons[t].boss === id);
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
  const name = (id: EnemyId) => after.enemies[id]?.name || before.enemies[id]?.name || id;
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
  }
  for (const trait of MASTER_TRAITS) {
    const a = before.dungeons[trait];
    const b = after.dungeons[trait];
    const where = `${TRAIT_LABELS[trait]}のダンジョン`;
    if (a.boss !== b.boss) out.push(`${where}：ボス ${name(a.boss)} → ${name(b.boss)}`);
    const all = [...new Set([...a.pool, ...b.pool])];
    for (const id of all) {
      const wa = weightOf(a.pool, id);
      const wb = weightOf(b.pool, id);
      // 消した敵が道中から外れるのは「消す」に含める
      if (wa !== wb && id in after.enemies) out.push(`${where}：${name(id)}の出やすさ ${wa} → ${wb}`);
    }
    if (a.pool.join() !== b.pool.join() && all.every((id) => weightOf(a.pool, id) === weightOf(b.pool, id))) {
      out.push(`${where}：道中の敵の並び順`);
    }
  }
  return out;
}

export const STAT_LABELS = { hp: 'HP', atk: '攻撃', def: '防御' } as const;
export const TRAIT_LABELS: Record<TraitId, string> = { neutral: '無属性', fire: '炎', ice: '氷', light: '光', dark: '闇' };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
