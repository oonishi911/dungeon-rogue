// 唱える前に床に出す範囲（spellArea.ts）が、唱えたときに届くマス（CastEvent の path・area）と同じになるか
import { describe, expect, it } from 'vitest';
import { DEFAULT_DUNGEON } from './dungeons';
import { FIELD_ENEMY } from './enemies.fixtures';
import type { MapEnemy } from './enemies';
import { startExplore, step } from './explore';
import type { ExploreState } from './exploreTypes';
import type { FloorMap, Pos } from './map';
import { dirToward } from './exploreSight';
import { spellPreview } from './spellArea';
import type { SpellId } from './types';

const ROOM = ['#####################', '#...................#', '#...................#', '#...................#', '#####################'];
const ALL: SpellId[] = ['fire_bolt', 'fire_chain', 'sweep', 'sweep_bleed', 'poison_mist', 'stone_wall', 'prism_fan', 'drain', 'thunder_chain'];

function arena(player: Pos, foes: Pos[]): ExploreState {
  const base = startExplore(1, { enemyDensity: 0, loadout: [] });
  const map: FloorMap = { width: 21, height: 5, tiles: ROOM.join('').split('').map((c) => (c === '#' ? 'wall' : 'floor')), rooms: [], start: player, stairs: { x: 19, y: 1 }, boss: null, mainPath: [], features: [] };
  const enemies: MapEnemy[] = foes.map((pos, uid) => ({ uid, id: FIELD_ENEMY, elite: false, pos, hp: 999, mode: 'wander', justNoticed: false, lastSeen: null, searchTurns: 0 }));
  return { ...base, map, chests: [], player, enemies, spells: ALL, mp: 99, maxMp: 99, seen: new Array<boolean>(105).fill(true), stats: { ...base.stats, hp: 500, maxHp: 500 } };
}

describe('唱える前に出す範囲', () => {
  it('向きのない呪文は出さない', () => {
    expect(spellPreview(arena({ x: 2, y: 2 }, []), 'heal', 'right', DEFAULT_DUNGEON.spells)).toBeNull();
  });

  it.each(ALL)('%s：出す道すじは、唱えたときに飛ぶ道すじと同じ', (spell) => {
    const s0 = arena({ x: 2, y: 2 }, [{ x: 5, y: 2 }, { x: 6, y: 1 }]);
    const preview = spellPreview(s0, spell, 'right', DEFAULT_DUNGEON.spells)!;
    const r = step(s0, { kind: 'cast', spell, dir: 'right' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cast = r.value.cast!;
    if (spell === 'prism_fan') expect(preview.area).toEqual(cast.path);
    else if (spell === 'stone_wall' || spell === 'poison_mist') expect([...preview.area].sort((a, b) => a.y - b.y || a.x - b.x)).toEqual([...(cast.area ?? [])].sort((a, b) => a.y - b.y || a.x - b.x));
    else expect(preview.path).toEqual(cast.path);
  });

  it('矢は最初の敵で止まり、なぎ払いは貫く。壁の手前で止まる', () => {
    const s = arena({ x: 2, y: 2 }, [{ x: 4, y: 2 }]);
    expect(spellPreview(s, 'fire_bolt', 'right', DEFAULT_DUNGEON.spells)!.area).toEqual([{ x: 4, y: 2 }]);
    expect(spellPreview(s, 'sweep', 'right', DEFAULT_DUNGEON.spells)!.path.length).toBe(DEFAULT_DUNGEON.spells.sweep.range);
    expect(spellPreview(s, 'fire_bolt', 'up', DEFAULT_DUNGEON.spells)!.path).toEqual([{ x: 2, y: 1 }]);
  });
});

describe('向き（dirToward）', () => {
  it('縦横のうち、離れている方を向く。同じなら横。同じマスなら null', () => {
    expect(dirToward({ x: 2, y: 2 }, { x: 6, y: 3 })).toBe('right');
    expect(dirToward({ x: 2, y: 2 }, { x: 1, y: 7 })).toBe('down');
    expect(dirToward({ x: 2, y: 2 }, { x: 0, y: 0 })).toBe('left');
    expect(dirToward({ x: 2, y: 2 }, { x: 2, y: 0 })).toBe('up');
    expect(dirToward({ x: 2, y: 2 }, { x: 2, y: 2 })).toBeNull();
  });
});
