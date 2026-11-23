// 刻印武器と残響の持ち物（セーブデータ）の扱い。設計は docs/echo-spec.md。スロットがあるのは武器だけ（防具にはない）。
// ・敵が落とした分は、探索が終わったとき（力尽きても、リタイアしても）倉庫に入る（receiveLoot）。失わない
// ・刻印武器は、1つ1つに番号（uid）がある（スロットが違うので、同じ種類でも別のもの）。スロットには、倉庫の残響を何度でも付け替えられる（setEcho）
// ・刻印武器は、ふつうの武器と同じ装備枠（武器1つ）に付ける（equipEngraved）。ふつうの武器を選ぶと、刻印武器は外れる（shop.ts の equip）
// ・サブ武器（持ち替えて使う2本目）にもできる（equipSubEngraved）。メインとちがう種類で、メインと同じ刻印武器にはできない
// ほかのロジックと同じく、状態を受け取り新しい状態を返す純粋関数でできている。

import { weaponTypeOf } from './combat';
import { ECHO_IDS } from './echoMaster';
import { takeCount, takeLimit } from './shop';
import { gearName, type Found } from './echo';
import type { EngravedGear, SaveData } from './save';
import type { EchoId, Result } from './types';

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T>(error: string): Result<T> => ({ ok: false, error });

export const SLOT_MAX = 3;

/** 拾ったものを倉庫に入れる。刻印武器には、新しい番号を付ける。二重耐性の指輪は、持ち物（owned）に入る */
export function receiveLoot(save: SaveData, found: Found | undefined): SaveData {
  if (!found) return save;
  // 出会った敵は、図鑑に載せる（重ねない。出会った順）
  const met = [...save.met, ...found.met.filter((id, i, all) => !save.met.includes(id) && all.indexOf(id) === i)];
  save = met.length === save.met.length ? save : { ...save, met };
  if (found.echoes.length === 0 && found.gear.length === 0 && found.rings.length === 0) return save;
  let uid = save.engraved.reduce((top, g) => Math.max(top, g.uid), 0);
  const gear: EngravedGear[] = found.gear.map((g) => ({ uid: ++uid, base: g.base, slots: Array.from({ length: g.slots }, () => null) }));
  // 二重耐性の指輪は、同じものを持っていれば重ならない（同じ組み合わせ・段階は1つ。段階がちがえば別のもの）
  const owned = [...save.owned];
  for (const id of found.rings) if (!owned.includes(id)) owned.push(id);
  return { ...save, owned, engraved: [...save.engraved, ...gear], echoes: [...save.echoes, ...found.echoes] };
}

export const engravedName = (g: Pick<EngravedGear, 'base'>): string => gearName(g.base);
export const echoCount = (save: Pick<SaveData, 'echoes'>, id: EchoId): number => save.echoes.filter((e) => e === id).length;

/** 倉庫にある残響の種類と数（種類の決まった順） */
export const echoStock = (save: Pick<SaveData, 'echoes'>): { id: EchoId; count: number }[] =>
  ECHO_IDS.map((id) => ({ id, count: echoCount(save, id) })).filter((e) => e.count > 0);

/** メインの武器として装備しているか */
export const isEquipped = (save: Pick<SaveData, 'kit'>, uid: number): boolean => save.kit.weaponGear === uid;
/** サブ武器として装備しているか */
export const isSubGear = (save: Pick<SaveData, 'kit'>, uid: number): boolean => save.kit.weapon2Gear === uid;

/** サブ武器を外した持ち物 */
const withoutSub = (kit: SaveData['kit']): SaveData['kit'] => {
  const { weapon2: _sub, weapon2Gear: _gear, ...rest } = kit;
  return rest;
};

/**
 * 刻印武器を、メインの武器として装備する（前に付けていた武器は外れる）。
 * サブ武器が同じ種類か、この刻印武器をサブにしていたときは、サブ武器は外れる（サブはメインとちがう種類）
 */
export function equipEngraved(save: SaveData, uid: number): Result<SaveData> {
  const gear = save.engraved.find((g) => g.uid === uid);
  if (!gear) return err('持っていない');
  const { kit } = save;
  const dropSub = kit.weapon2Gear === uid || (kit.weapon2 && weaponTypeOf(kit.weapon2) === weaponTypeOf(gear.base));
  return ok({ ...save, kit: { ...(dropSub ? withoutSub(kit) : kit), weapon: gear.base, weaponGear: uid } });
}

/**
 * 刻印武器を、サブ武器にする（持ち替えて使う2本目。uid が null なら、サブ武器を外す）。
 * メインの武器があって、ちがう種類のときだけ。メインと同じ刻印武器にはできない。持っていける道具の数が1つ減る
 */
export function equipSubEngraved(save: SaveData, uid: number | null): Result<SaveData> {
  if (uid === null) return ok({ ...save, kit: withoutSub(save.kit) });
  const gear = save.engraved.find((g) => g.uid === uid);
  if (!gear) return err('持っていない');
  if (!save.kit.weapon) return err('先に、メインの武器を決めてください');
  if (save.kit.weaponGear === uid) return err('メインに装備している');
  if (weaponTypeOf(gear.base) === weaponTypeOf(save.kit.weapon)) return err('サブ武器は、メインとちがう種類の武器にします');
  if (!save.kit.weapon2 && takeCount(save.kit.take) > takeLimit(save.kit.take, true)) return err('道具を1つ減らすと、サブ武器を持っていけます');
  return ok({ ...save, kit: { ...withoutSub(save.kit), weapon2: gear.base, weapon2Gear: uid } });
}

/** 刻印武器を外す（メインなら武器の枠が空になり、サブ武器も外れる。サブなら、サブ武器が外れる） */
export function unequipEngraved(save: SaveData, uid: number): Result<SaveData> {
  if (!save.engraved.some((g) => g.uid === uid)) return err('持っていない');
  if (isSubGear(save, uid)) return ok({ ...save, kit: withoutSub(save.kit) });
  if (!isEquipped(save, uid)) return err('装備していない');
  const { weaponGear: _gear, ...rest } = withoutSub(save.kit);
  return ok({ ...save, kit: { ...rest, weapon: null } });
}

/**
 * 刻印武器の index 番目のスロットに、倉庫の残響をはめる（echo が null なら外す）。
 * 前にはまっていた残響は、倉庫に戻る。何度でも、無料で付け替えられる
 */
export function setEcho(save: SaveData, uid: number, index: number, echo: EchoId | null): Result<SaveData> {
  const gear = save.engraved.find((g) => g.uid === uid);
  if (!gear || index < 0 || index >= gear.slots.length) return err('そのスロットはない');
  let echoes = [...save.echoes];
  if (echo !== null) {
    const at = echoes.indexOf(echo);
    if (at < 0) return err('倉庫にもうない');
    echoes.splice(at, 1);
  }
  const before = gear.slots[index] ?? null;
  if (before !== null) echoes = [...echoes, before];
  const slots = gear.slots.map((s, i) => (i === index ? echo : s));
  return ok({ ...save, echoes, engraved: save.engraved.map((g) => (g.uid === uid ? { ...g, slots } : g)) });
}

/** 刻印武器にはめた残響（空のスロットは除く。なければ undefined） */
const gearEchoes = (save: Pick<SaveData, 'engraved'>, uid: number | null | undefined): EchoId[] | undefined => {
  const echoes = save.engraved.find((g) => g.uid === uid)?.slots.filter((s): s is EchoId => s !== null) ?? [];
  return echoes.length ? echoes : undefined;
};

/** 出発するとき、メインに装備している刻印武器にはめた残響（なければ undefined） */
export const kitEchoes = (save: Pick<SaveData, 'engraved' | 'kit'>): EchoId[] | undefined => gearEchoes(save, save.kit.weaponGear);

/** 出発するとき、サブ武器にしている刻印武器にはめた残響（なければ undefined） */
export const kitSubEchoes = (save: Pick<SaveData, 'engraved' | 'kit'>): EchoId[] | undefined => (save.kit.weapon && save.kit.weapon2 ? gearEchoes(save, save.kit.weapon2Gear) : undefined);
