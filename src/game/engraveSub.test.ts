// 刻印武器を、サブ武器（持ち替えて使う2本目）にする（docs/echo-spec.md）
import { describe, expect, it } from 'vitest';
import { swapWeapons } from './combat';
import { depart } from './depart';
import { equipEngraved, equipSubEngraved, isEquipped, isSubGear, kitEchoes, kitSubEchoes, receiveLoot, setEcho, unequipEngraved } from './engrave';
import { startExplore } from './explore';
import { packRun, parseRun } from './runSave';
import { newSave, parseSave, type SaveData } from './save';
import { buy, equip, equipSub, kitLoadout } from './shop';
import type { EchoId, Result } from './types';

const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

/** 刻印武器を3本（1：剣、2：槌、3：槌）持ち、剣に炎、槌（2）にささやきをはめたセーブ */
function armory(): SaveData {
  let s = receiveLoot(
    { ...newSave(), echoes: ['fire', 'whisper', 'plain'] },
    { echoes: [], gear: [{ base: 'sword_3', slots: 1 }, { base: 'hammer_2', slots: 2 }, { base: 'hammer_4', slots: 1 }], rings: [], met: [] },
  );
  s = must(setEcho(s, 1, 0, 'fire'));
  s = must(setEcho(s, 2, 0, 'whisper'));
  return must(equipEngraved(s, 1));
}

describe('刻印武器をサブ武器にする', () => {
  it('メインとちがう種類の刻印武器を、サブにできる。サブの残響を持って出発し、持ち替えると効く', () => {
    const s = must(equipSubEngraved(armory(), 2));
    expect(s.kit.weapon2).toBe('hammer_2');
    expect(s.kit.weapon2Gear).toBe(2);
    expect(isSubGear(s, 2)).toBe(true);
    expect(isEquipped(s, 2)).toBe(false);
    expect(kitLoadout(s)).toEqual(['sword_3', 'hammer_2']);
    expect(kitEchoes(s)).toEqual(['fire']);
    expect(kitSubEchoes(s)).toEqual(['whisper']);

    const d = depart(1, 'standard', kitLoadout(s), kitEchoes(s), kitSubEchoes(s));
    expect(d.subEchoes).toEqual(['whisper']);
    const state = startExplore(3, { loadout: d.loadout, echoes: d.echoes, subEchoes: d.subEchoes });
    expect(state.stats.echoes).toEqual(['fire']);
    expect(state.stats.sub).toEqual({ weapon: 'hammer_2', skill: 0, echoes: ['whisper'] });
    // 持ち替えると、サブの残響（ささやき：魔力+10）が効き、メインの残響は外れる
    const swapped = swapWeapons(state.stats, 0)!.stats;
    expect(swapped.weapon).toBe('hammer_2');
    expect(swapped.echoes).toEqual(['whisper']);
    expect(swapped.mag).toBe(state.stats.mag + 10);
  });

  it('メインと同じ種類・メインと同じ刻印武器・メインがないときは、サブにできない', () => {
    const s = armory();
    expect(equipSubEngraved(s, 1).ok).toBe(false); // メインに付けている
    const sameType = must(equipEngraved(s, 2)); // メインが槌
    expect(equipSubEngraved(sameType, 3).ok).toBe(false); // 槌どうし
    expect(equipSubEngraved(must(unequipEngraved(s, 1)), 2).ok).toBe(false); // メインがない
    expect(equipSubEngraved(s, 99).ok).toBe(false);
  });

  it('サブにした刻印武器をメインにすると、サブは外れる。メインを同じ種類に替えても、サブは外れる', () => {
    const s = must(equipSubEngraved(armory(), 2));
    const moved = must(equipEngraved(s, 2));
    expect(moved.kit.weaponGear).toBe(2);
    expect(moved.kit.weapon2).toBeUndefined();
    expect(moved.kit.weapon2Gear).toBeUndefined();
    const bought = must(buy({ ...s, gold: 9999 }, 'hammer'));
    expect(bought.kit.weapon2Gear).toBeUndefined();
  });

  it('ちがう種類のメインに替えても、サブの刻印武器は残る。ふつうの武器をサブにすると、刻印武器は外れる', () => {
    let s = must(equipSubEngraved(armory(), 2));
    s = { ...s, owned: [...s.owned, 'staff'] };
    const staff = must(equip(s, 'weapon', 'staff'));
    expect(staff.kit.weapon2Gear).toBe(2);
    expect(kitSubEchoes(staff)).toEqual(['whisper']);
    const plain = must(equipSub({ ...s, owned: [...s.owned, 'hammer'] }, 'hammer'));
    expect(plain.kit.weapon2).toBe('hammer');
    expect(plain.kit.weapon2Gear).toBeUndefined();
    expect(kitSubEchoes(plain)).toBeUndefined();
  });

  it('外す：サブなら、サブだけ外れる。メインなら、サブも外れる', () => {
    const s = must(equipSubEngraved(armory(), 2));
    const noSub = must(unequipEngraved(s, 2));
    expect(noSub.kit.weapon2).toBeUndefined();
    expect(noSub.kit.weaponGear).toBe(1);
    const noMain = must(unequipEngraved(s, 1));
    expect(noMain.kit.weapon).toBeNull();
    expect(noMain.kit.weapon2Gear).toBeUndefined();
    expect(must(equipSubEngraved(s, null)).kit.weapon2Gear).toBeUndefined();
  });

  it('保存して読み込んでも同じ。おかしなサブ（メインと同じ刻印武器・同じ種類）は外す', () => {
    const s = must(equipSubEngraved(armory(), 2));
    expect(parseSave(JSON.stringify(s))).toEqual(s);
    const same = parseSave(JSON.stringify({ ...s, kit: { ...s.kit, weapon2: 'sword_3', weapon2Gear: 1 } }))!;
    expect(same.kit.weapon2Gear).toBeUndefined();
    expect(same.kit.weapon2).toBeUndefined();
    const hammerMain = must(equipEngraved(s, 3));
    const clash = parseSave(JSON.stringify({ ...hammerMain, kit: { ...hammerMain.kit, weapon2: 'hammer_2', weapon2Gear: 2 } }))!;
    expect(clash.kit.weapon2Gear).toBeUndefined();
  });

  it('中断データにも、サブの残響が残る', () => {
    const outcome = { dungeon: 'standard', trait: 'fire' as const, loadout: ['sword_3' as const, 'hammer_2' as const], echoes: ['fire'] as EchoId[], subEchoes: ['whisper'] as EchoId[] };
    const state = startExplore(7, { loadout: outcome.loadout, echoes: outcome.echoes, subEchoes: outcome.subEchoes });
    const run = parseRun(JSON.stringify(packRun(newSave(), outcome, 7, state)))!;
    expect(run.outcome.subEchoes).toEqual(['whisper']);
    expect(run.state.stats.sub?.echoes).toEqual(['whisper']);
  });
});
