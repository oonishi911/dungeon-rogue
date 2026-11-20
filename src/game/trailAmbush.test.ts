// 敵の個性：炎の足跡（trail）と待ち伏せ（ambush）。docs/combat-spec.md の1
import { afterEach, describe, expect, it } from 'vitest';
import { ENEMIES } from './data';
import { ENEMY_CONFIG, type MapEnemy } from './enemies';
import { FIELD_ENEMY } from './enemies.fixtures';
import { startExplore, step } from './explore';
import type { ExploreState } from './exploreTypes';
import { FIELD_CONFIG, fieldAt } from './fields';
import { tileAt, type Pos } from './map';
import type { EnemyDef, Result } from './types';

const unwrap = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const wait = (s: ExploreState) => unwrap(step(s, { kind: 'wait' }));

const saved = new Map<string, EnemyDef['behaviors']>();
/** 敵に、一時的に個性を付ける（afterEach で戻す） */
const give = (behaviors: EnemyDef['behaviors']) => {
  const def = ENEMIES[FIELD_ENEMY]!;
  if (!saved.has(FIELD_ENEMY)) saved.set(FIELD_ENEMY, def.behaviors);
  if (behaviors) def.behaviors = behaviors;
  else delete def.behaviors;
};
afterEach(() => {
  for (const [id, b] of saved) {
    if (b === undefined) delete ENEMIES[id]!.behaviors;
    else ENEMIES[id]!.behaviors = b;
  }
  saved.clear();
});

/** 主人公から、まっすぐ len マス先まで床が続く場所（と、その向き）を探して、主人公をそこに置く。敵はいない・HPは多め */
function corridor(len: number, seed = 3): { state: ExploreState; at: (n: number) => Pos } {
  const s0 = startExplore(seed, { trait: 'neutral', loadout: [] });
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  for (let y = 1; y < s0.map.height - 1; y++) {
    for (let x = 1; x < s0.map.width - 1; x++) {
      for (const [dx, dy] of dirs) {
        const cells = Array.from({ length: len + 1 }, (_, n) => ({ x: x + dx * n, y: y + dy * n }));
        if (cells.every((p) => tileAt(s0.map, p) === 'floor')) {
          const state: ExploreState = { ...s0, player: cells[0]!, enemies: [], fields: [], stats: { ...s0.stats, hp: 500, maxHp: 500 } };
          return { state, at: (n) => cells[n]! };
        }
      }
    }
  }
  throw new Error('まっすぐな床がない');
}

const foeAt = (pos: Pos, extra: Partial<MapEnemy> = {}): MapEnemy => ({ uid: 900, id: FIELD_ENEMY, elite: false, pos, hp: 999, mode: 'wander', justNoticed: false, lastSeen: null, searchTurns: 0, ...extra });

describe('待ち伏せ（ambush）', () => {
  it('ふつうの敵は、視界（5マス）に入ると気付く。待ち伏せの敵は、4マス先では気付かない', () => {
    const { state, at } = corridor(4);
    give(undefined);
    expect(wait({ ...state, enemies: [foeAt(at(4))] }).enemies[0]!.mode).toBe('chase');
    give(['ambush']);
    const after = wait({ ...state, enemies: [foeAt(at(4))] });
    expect(after.enemies[0]!.mode).toBe('wander');
    expect(after.enemies[0]!.pos).toEqual(at(4));
  });

  it('気付かれていないあいだは、その場から動かない（何ターンたっても）', () => {
    const { state, at } = corridor(4);
    give(['ambush']);
    let s: ExploreState = { ...state, enemies: [foeAt(at(4))] };
    for (let i = 0; i < 25; i++) s = wait(s);
    expect(s.enemies[0]!.pos).toEqual(at(4));
    expect(s.enemies[0]!.mode).toBe('wander');
  });

  it('2マス以内に来られると、気付いたそのターンに動く（隣まで来る）', () => {
    const { state, at } = corridor(4);
    give(['ambush']);
    const s = wait({ ...state, enemies: [foeAt(at(ENEMY_CONFIG.ambushRange))] });
    expect(s.enemies[0]!.mode).toBe('chase');
    expect(s.enemies[0]!.justNoticed).toBe(true);
    expect(s.enemies[0]!.pos).toEqual(at(1));
    expect(s.log.some((l) => l.includes('襲いかかってきた'))).toBe(true);
  });

  it('隣にいるなら、気付いたそのターンに殴る。ふつうの敵は、気付いたターンは殴らない', () => {
    const { state, at } = corridor(2);
    give(undefined);
    expect(wait({ ...state, enemies: [foeAt(at(1))] }).stats.hp).toBe(state.stats.hp);
    give(['ambush']);
    const hit = wait({ ...state, enemies: [foeAt(at(1))] });
    expect(hit.stats.hp).toBeLessThan(state.stats.hp);
  });

  it('気付いて追ってきている敵は、遠くからもふつうに追う（待ち伏せは、気付かれていないあいだだけ）', () => {
    const { state, at } = corridor(4);
    give(['ambush']);
    const s = wait({ ...state, enemies: [foeAt(at(4), { mode: 'chase', lastSeen: state.player })] });
    expect(s.enemies[0]!.mode).toBe('chase');
    expect(s.enemies[0]!.pos).toEqual(at(3));
  });
});

describe('炎の足跡（trail）', () => {
  it('歩いたら、離れたマスに燃える床を残す。残りのターンは、設定どおり', () => {
    const { state, at } = corridor(4);
    give(['trail']);
    const s = wait({ ...state, enemies: [foeAt(at(3), { mode: 'chase', lastSeen: state.player })] });
    expect(s.enemies[0]!.pos).toEqual(at(2));
    const fire = fieldAt(s.fields, at(3));
    expect(fire?.kind).toBe('fire');
    // 置いたターンの終わりに1つ減る
    expect(fire?.turns).toBe(FIELD_CONFIG.fireTurns - 1);
  });

  it('個性のない敵は、床を残さない。歩かなかった（殴った）ときも残さない', () => {
    const { state, at } = corridor(4);
    give(undefined);
    expect(wait({ ...state, enemies: [foeAt(at(3), { mode: 'chase', lastSeen: state.player })] }).fields).toEqual([]);
    give(['trail']);
    expect(wait({ ...state, enemies: [foeAt(at(1), { mode: 'chase', lastSeen: state.player })] }).fields).toEqual([]);
  });

  it('燃える床に乗ると、主人公もダメージを受ける（足跡をたどると燃える）', () => {
    const { state, at } = corridor(4);
    give(['trail']);
    const s = wait({ ...state, enemies: [foeAt(at(2), { mode: 'chase', lastSeen: state.player })] });
    expect(s.enemies[0]!.pos).toEqual(at(1));
    expect(fieldAt(s.fields, at(2))?.kind).toBe('fire');
    // 足跡の上に立つと、ターンの終わりに燃える
    const onFire = wait({ ...s, enemies: [], player: at(2) });
    expect(onFire.stats.hp).toBe(s.stats.hp - FIELD_CONFIG.fireDamage);
  });
});
