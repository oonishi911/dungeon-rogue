// 増やした残響（余韻・寝息・澱み・ためらい・分け合い・ひそやか・ささやき・灯・拾い癖）の効果と、落とす敵（docs/echo-spec.md）
import { describe, expect, it } from 'vitest';
import { buildPlayer, swapWeapons } from './combat';
import { ECHO_MASTER } from './data';
import { echoesFor, echoMag, hushedRange, lampRadius, lingerDamage, pocketGold, shareHeal, slumberRate } from './echo';
import { ECHO_IDS, ECHO_INFO, echoText, HUSH_FLOOR, STAGNANT_MIST } from './echoMaster';
import { BOSS_ENEMY, FIELD_ENEMY } from './enemies.fixtures';
import { DEFAULT_DUNGEON_ID, dungeonOf } from './dungeons';
import { enemyDef, type MapEnemy } from './enemies';
import { startExplore, step, viewRadius } from './explore';
import type { ExploreAction, ExploreState } from './exploreTypes';
import type { FloorMap, Pos } from './map';
import type { EchoId, EnemyDef, Result } from './types';

const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const v = (id: EchoId) => ECHO_MASTER.effects[id].weapon;
const foe = (change: Partial<EnemyDef> = {}): EnemyDef => ({ id: 'x', name: 'x', hp: 10, atk: 5, def: 2, element: 'neutral', body: 'normal', ...change });
const many = (id: EchoId, n: number): EchoId[] => Array.from({ length: n }, () => id);

const ROOM = ['###########', '#.........#', '#.........#', '#.........#', '###########'];

function enemy(pos: Pos, overrides: Partial<MapEnemy> = {}): MapEnemy {
  return { uid: 0, id: FIELD_ENEMY, elite: false, pos, hp: 999, mode: 'chase', justNoticed: false, lastSeen: null, searchTurns: 0, ...overrides };
}

/** 手書きの部屋に、剣（はめた残響つき）を持った主人公と敵を置く */
function arena(echoes: EchoId[], player: Pos, enemies: MapEnemy[]): ExploreState {
  const base = startExplore(1, { enemyDensity: 0, loadout: ['sword'], echoes });
  const map: FloorMap = {
    width: ROOM[0]!.length,
    height: ROOM.length,
    tiles: ROOM.join('').split('').map((c) => (c === '#' ? 'wall' : 'floor')),
    rooms: [],
    start: player,
    stairs: { x: 9, y: 3 },
    boss: null,
    mainPath: [],
    features: [],
  };
  return { ...base, map, player, fields: [], enemies: enemies.map((e, i) => ({ ...e, uid: i })), seen: new Array<boolean>(map.tiles.length).fill(true) };
}

const RIGHT: ExploreAction = { kind: 'move', dir: 'right' };
/** 右隣の敵を1回殴ったあとの状態 */
const hitOnce = (echoes: EchoId[], change: Partial<MapEnemy> = {}, from: (s: ExploreState) => ExploreState = (s) => s) =>
  must(step(from(arena(echoes, { x: 2, y: 2 }, [enemy({ x: 3, y: 2 }, change)])), RIGHT));

describe('設定と説明', () => {
  it('どの残響にも、名前・数字・説明がある', () => {
    for (const id of ECHO_IDS) {
      expect(ECHO_MASTER.effects[id].name).not.toBe('');
      expect(echoText(ECHO_MASTER, id)).not.toBe('');
      expect(ECHO_INFO[id].flavor).not.toBe('');
    }
  });
});

describe('余韻の残響', () => {
  it('通常攻撃のあと、当てたダメージの割合の追加ダメージが入る（1より減らない）', () => {
    expect(lingerDamage([], 40)).toBe(0);
    expect(lingerDamage(['linger'], 40)).toBe(Math.round((40 * v('linger')) / 100));
    expect(lingerDamage(['linger'], 1)).toBe(1);
    const plain = hitOnce([]);
    const echoed = hitOnce(['linger']);
    const dealt = plain.hits.filter((h) => h.kind === 'dealt');
    const twice = echoed.hits.filter((h) => h.kind === 'dealt');
    expect(dealt).toHaveLength(1);
    expect(twice).toHaveLength(2);
    expect(twice[1]!.amount).toBe(lingerDamage(['linger'], dealt[0]!.amount));
    expect(echoed.enemies[0]!.hp).toBe(999 - dealt[0]!.amount - twice[1]!.amount);
  });

  it('1回目で倒したら、追加ダメージは出ない', () => {
    const s = hitOnce(['linger'], { hp: 1 });
    expect(s.enemies).toHaveLength(0);
    expect(s.hits.filter((h) => h.kind === 'dealt')).toHaveLength(1);
  });
});

describe('寝息の残響', () => {
  it('眠っている敵へのダメージだけが増える', () => {
    expect(slumberRate(['slumber'], true)).toBeCloseTo(1 + v('slumber') / 100);
    expect(slumberRate(['slumber'], false)).toBe(1);
    const dealt = (echoes: EchoId[]) => hitOnce(echoes, { asleep: true, mode: 'wander' }).hits.find((h) => h.kind === 'dealt')!.amount;
    expect(dealt(['slumber'])).toBeGreaterThan(dealt([]));
    const awake = (echoes: EchoId[]) => hitOnce(echoes).hits.find((h) => h.kind === 'dealt')!.amount;
    expect(awake(['slumber'])).toBe(awake([]));
  });
});

describe('澱みの残響', () => {
  it('確率で、殴った敵の足元に毒の霧を残す（100%なら必ず）', () => {
    const sure = many('stagnant', Math.ceil(100 / v('stagnant')));
    const s = hitOnce(sure);
    const mist = s.fields.find((f) => f.kind === 'poison');
    expect(mist).toBeDefined();
    expect(mist!.turns).toBeLessThanOrEqual(STAGNANT_MIST.turns);
    expect(s.log.some((l) => l.includes('毒の霧がにじんだ'))).toBe(true);
    expect(hitOnce([]).fields.some((f) => f.kind === 'poison')).toBe(false);
  });
});

describe('ためらいの残響', () => {
  it('確率で、殴った敵がそのターン動けなくなる（100%なら必ず。ボスには効かない）', () => {
    const sure = many('falter', Math.ceil(100 / v('falter')));
    const s = hitOnce(sure);
    expect(s.log.some((l) => l.includes('ためらって動けない'))).toBe(true);
    expect(s.hits.some((h) => h.kind === 'taken')).toBe(false);
    // 残響がなければ、隣の敵は殴り返してくる
    expect(hitOnce([]).hits.some((h) => h.kind === 'taken')).toBe(true);
  });
});

describe('分け合いの残響', () => {
  it('与えたダメージの割合だけHPが戻る（最大HPは超えない）', () => {
    expect(shareHeal([], 40)).toBe(0);
    expect(shareHeal(['share', 'share'], 40)).toBe(Math.round((40 * 2 * v('share')) / 100));
    const hurt = (s: ExploreState) => ({ ...s, stats: { ...s.stats, hp: 1 } });
    const s = hitOnce(many('share', 3), {}, hurt);
    expect(s.log.some((l) => l.includes('分け合って'))).toBe(true);
    const full = hitOnce(many('share', 3));
    expect(full.log.some((l) => l.includes('分け合って'))).toBe(false);
  });
});

describe('ひそやかの残響', () => {
  it('まだ気付いていない敵に気付かれる距離が縮む（1マスより縮まない）', () => {
    expect(hushedRange(5, ['hush'])).toBe(5 - v('hush'));
    expect(hushedRange(5, many('hush', 20))).toBe(HUSH_FLOOR);
    expect(hushedRange(5, [])).toBe(5);
    // 5マス先の、まだ気付いていない敵
    const watch = (echoes: EchoId[]) => must(step(arena(echoes, { x: 1, y: 2 }, [enemy({ x: 6, y: 2 }, { mode: 'wander' })]), { kind: 'wait' })).enemies[0]!.mode;
    expect(watch([])).toBe('chase');
    expect(watch(many('hush', 3))).toBe('wander');
  });
});

describe('ささやきの残響', () => {
  it('魔力が上がる。武器を持ち替えると、持った武器の残響のものになる', () => {
    expect(echoMag(['whisper', 'whisper'])).toBe(2 * v('whisper'));
    expect(buildPlayer(['sword'], ['whisper']).mag).toBe(v('whisper'));
    expect(buildPlayer([], ['whisper']).mag).toBe(0);
    const held = buildPlayer(['sword', 'hammer'], ['whisper']);
    const swapped = swapWeapons(held, 0)!;
    expect(swapped.stats.mag).toBe(0);
    expect(swapWeapons(swapped.stats, 0)!.stats.mag).toBe(v('whisper'));
  });
});

describe('灯の残響', () => {
  it('視界が広がる', () => {
    expect(lampRadius(['lamp', 'lamp'])).toBe(2 * v('lamp'));
    const plain = startExplore(1, { loadout: ['sword'] });
    const lit = startExplore(1, { loadout: ['sword'], echoes: ['lamp'] });
    expect(viewRadius(lit)).toBe(viewRadius(plain) + v('lamp'));
  });
});

describe('拾い癖の残響', () => {
  it('敵が落とすお金が増える', () => {
    expect(pocketGold(100, ['pocket'])).toBe(100 + v('pocket'));
    expect(pocketGold(0, ['pocket'])).toBe(0);
    expect(pocketGold(100, [])).toBe(100);
    const gold = (echoes: EchoId[]) => hitOnce(echoes, { hp: 1 }).gold;
    expect(gold(many('pocket', 4))).toBeGreaterThanOrEqual(gold([]));
    if (gold([]) > 0) expect(gold(many('pocket', 4))).toBeGreaterThan(gold([]));
  });
});

describe('落とす敵', () => {
  it('闇の敵は分け合い、行動の個性に合うもの、強敵・ボスは余韻、眠っていたら寝息も候補に入る', () => {
    expect(echoesFor(foe({ element: 'dark', body: 'spirit' }))).toEqual(['dark', 'spirit', 'share']);
    expect(echoesFor(foe({ behaviors: ['poison', 'charger', 'alarm', 'ranged', 'shield'] }))).toEqual(['plain', 'plain', 'stagnant', 'falter', 'hush', 'whisper', 'pierce']);
    expect(echoesFor(foe(), { rank: 'elite' })).toContain('linger');
    expect(echoesFor(foe(), { rank: 'normal' })).not.toContain('linger');
    expect(echoesFor(foe(), { asleep: true })).toContain('slumber');
  });

  it('テスト用の敵の定義は読める', () => {
    expect(enemyDef({ id: FIELD_ENEMY, elite: false }).hp).toBeGreaterThan(0);
  });
});

describe('ダンジョンの設定で落とさない', () => {
  /** ボスを1撃で倒すのを、敵の番号を変えて何度もやり、拾った残響・刻印武器の数を数える */
  const loot = () => {
    let echoes = 0;
    let gear = 0;
    for (let uid = 0; uid < 120; uid++) {
      const start = arena([], { x: 2, y: 2 }, [enemy({ x: 3, y: 2 }, { id: BOSS_ENEMY, elite: true, hp: 1 })]);
      const s = must(step({ ...start, enemies: start.enemies.map((e) => ({ ...e, uid: uid + 1 })) }, RIGHT));
      echoes += s.found.echoes.length;
      gear += s.found.gear.length;
    }
    return { echoes, gear };
  };
  const withDrops = (echoDrop: boolean, engravedDrop: boolean, run: () => void) => {
    const enemies = dungeonOf(DEFAULT_DUNGEON_ID).enemies as { echoDrop: boolean; engravedDrop: boolean };
    const before = { ...enemies };
    Object.assign(enemies, { echoDrop, engravedDrop });
    try {
      run();
    } finally {
      Object.assign(enemies, before);
    }
  };

  it('オンなら落とし、残響・刻印武器を、それぞれオフにできる', () => {
    withDrops(true, true, () => {
      const got = loot();
      expect(got.echoes).toBeGreaterThan(0);
      expect(got.gear).toBeGreaterThan(0);
    });
    withDrops(false, true, () => {
      const got = loot();
      expect(got.echoes).toBe(0);
      expect(got.gear).toBeGreaterThan(0);
    });
    withDrops(true, false, () => {
      const got = loot();
      expect(got.echoes).toBeGreaterThan(0);
      expect(got.gear).toBe(0);
    });
  });
});
