// 指輪の持ち物（セーブデータ）の扱い。設計は docs/ring-spec.md。
// ・指輪は、買ったもの・敵が落とした二重耐性の指輪が owned に入る。付けるのは kit.rings（指の数まで）
// ・指の数は、思い出した記憶の数で増える（echoes.json の ring.fingers。初期は 0〜1個で1つ、2〜3個で2つ、4個以上で3つ）
// ・同じ種類の指輪は1つだけ（段階がちがっても同じ種類）。ちがう種類の指輪は、効果が掛け算
// ・探索中は付け替えられない（店でだけ）
// ほかのロジックと同じく、状態を受け取り新しい状態を返す純粋関数でできている。

import { ITEMS, ECHO_MASTER } from './data';
import { ringKey } from './itemMaster';
import type { SaveData } from './save';
import type { ItemId, Result } from './types';

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T>(error: string): Result<T> => ({ ok: false, error });

/** 思い出した記憶の数から決まる、指輪を付けられる数 */
export function fingers(memories: number): number {
  const { two, three } = ECHO_MASTER.ring.fingers;
  return memories >= three ? 3 : memories >= two ? 2 : 1;
}

export const isRing = (id: ItemId): boolean => ITEMS[id]?.effect.kind === 'ring';

/** 付けている指輪（ない昔の記録は、なし） */
export const kitRings = (save: Pick<SaveData, 'kit'>): ItemId[] => save.kit.rings ?? [];

/** 付ける指輪の並びを整える：持っていないもの・同じ種類の重なり・指の数を超えた分を外す（前のものを残す） */
export function fitRingList(list: readonly ItemId[], owned: readonly ItemId[], limit: number): ItemId[] {
  const keys = new Set<string>();
  const out: ItemId[] = [];
  for (const id of list) {
    const key = ringKey(id);
    if (key === null || !owned.includes(id) || keys.has(key) || out.length >= limit) continue;
    keys.add(key);
    out.push(id);
  }
  return out;
}

/** kit.rings を、指の数と持ち物に合わせる（記憶が変わったとき・買ったとき・店を開くとき）。空なら、欄ごと外す */
export function fitRings(save: SaveData): SaveData {
  const rings = fitRingList(kitRings(save), save.owned, fingers(save.memories.length));
  const { rings: _old, ...kit } = save.kit;
  return { ...save, kit: rings.length ? { ...kit, rings } : kit };
}

/** 指輪を付ける。同じ種類の指輪を付けていれば、それと入れ替える。空いた指がなければ付けられない */
export function equipRing(save: SaveData, id: ItemId): Result<SaveData> {
  const key = ringKey(id);
  if (key === null || !save.owned.includes(id)) return err('持っていない');
  const current = kitRings(save);
  if (current.includes(id)) return err('もう付けている');
  const same = current.findIndex((r) => ringKey(r) === key);
  if (same < 0 && current.length >= fingers(save.memories.length)) return err('空いている指がない');
  const rings = same < 0 ? [...current, id] : current.map((r, i) => (i === same ? id : r));
  return ok({ ...save, kit: { ...save.kit, rings } });
}

/** 指輪を外す */
export function unequipRing(save: SaveData, id: ItemId): Result<SaveData> {
  const current = kitRings(save);
  if (!current.includes(id)) return err('付けていない');
  const rings = current.filter((r) => r !== id);
  const { rings: _old, ...kit } = save.kit;
  return ok({ ...save, kit: rings.length ? { ...kit, rings } : kit });
}
