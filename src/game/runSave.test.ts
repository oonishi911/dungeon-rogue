import { describe, expect, it } from 'vitest';
import { autoAction } from './autoplay';
import { DEFAULT_DUNGEON_ID } from './dungeons';
import { startExplore, step, type ExploreState } from './explore';
import { packRun, packSeen, parseRun, unpackSeen, type RunSave } from './runSave';
import { newSave } from './save';
import type { Departure } from './types';

const outcome: Departure = { dungeon: DEFAULT_DUNGEON_ID, trait: 'fire', loadout: ['potion'] };
const SEED = 7;

/** 自動プレイで turns 手まで進める（探索が終わったら、その手前で止める） */
function play(state: ExploreState, turns: number): ExploreState {
  for (let i = 0; i < turns; i++) {
    const next = step(state, autoAction(state));
    if (!next.ok || next.value.outcome !== 'ongoing') break;
    state = next.value;
  }
  return state;
}

/** 2つ目の階へ降りるまで進める（降りられなければ、そこまで） */
function playToSecondFloor(state: ExploreState): ExploreState {
  for (let i = 0; i < 3000 && state.floor === 0; i++) {
    const next = step(state, autoAction(state));
    if (!next.ok || next.value.outcome !== 'ongoing') break;
    state = next.value;
  }
  return state;
}

const start = () => startExplore(SEED, { dungeon: outcome.dungeon, trait: outcome.trait, loadout: outcome.loadout });
const saved = (state: ExploreState) => JSON.stringify(packRun(newSave(), outcome, SEED, state));
/** 保存した文字列の中身を書き換える */
const edited = (state: ExploreState, edit: (run: RunSave) => void) => {
  const run = JSON.parse(saved(state)) as RunSave;
  edit(run);
  return JSON.stringify(run);
};

describe('packSeen / unpackSeen', () => {
  it('まとめたものを元に戻せる（4の倍数でない長さも）', () => {
    for (const length of [0, 1, 4, 7, 25, 400]) {
      const seen = Array.from({ length }, (_, i) => (i * 7) % 3 === 0);
      expect(unpackSeen(packSeen(seen), length)).toEqual(seen);
    }
  });

  it('長さや文字が合わなければ null', () => {
    expect(unpackSeen('ff', 4)).toBeNull();
    expect(unpackSeen('z', 4)).toBeNull();
  });
});

describe('packRun / parseRun', () => {
  it('保存して読み込むと、同じ状態に戻る', () => {
    const state = play(start(), 40);
    const run = parseRun(saved(state));
    expect(run).not.toBeNull();
    expect(run!.seed).toBe(SEED);
    expect(run!.outcome).toEqual(outcome);
    expect(run!.base).toEqual(newSave());
    expect(run!.state).toEqual({ ...state, hits: [], cast: null });
  });

  it('始まったばかりの状態も保存できる', () => {
    const state = start();
    expect(parseRun(saved(state))!.state).toEqual(state);
  });

  it('読み込んだ続きは、中断しなかったときと同じように進む', () => {
    const state = play(start(), 40);
    const resumed = parseRun(saved(state))!.state;
    expect(play(resumed, 60)).toEqual(play(state, 60));
  });

  it('一度離れた階の様子も戻る', () => {
    const state = playToSecondFloor(start());
    expect(state.floor).toBe(1);
    const resumed = parseRun(saved(state))!.state;
    expect(resumed.visited[0]).toEqual(state.visited[0]);
    expect(resumed.map).toEqual(state.map);
  });

  it('マップそのものは保存しない（小さく保存する）', () => {
    const state = play(start(), 40);
    expect(saved(state)).not.toContain('"tiles"');
    expect(saved(state).length).toBeLessThan(JSON.stringify(state).length / 2);
  });

  it('記録は新しい方から200行だけ残す', () => {
    const state = { ...start(), log: Array.from({ length: 500 }, (_, i) => `記録${i}`) };
    const log = parseRun(saved(state))!.state.log;
    expect(log).toHaveLength(200);
    expect(log.at(-1)).toBe('記録499');
  });

  it('何も保存されていなければ null', () => {
    expect(parseRun(null)).toBeNull();
    expect(parseRun('')).toBeNull();
  });

  it('壊れたデータや形の違うデータは null', () => {
    const state = play(start(), 40);
    expect(parseRun('{not json')).toBeNull();
    expect(parseRun('42')).toBeNull();
    expect(parseRun(edited(state, (r) => void ((r as { version: number }).version = 0)))).toBeNull();
    expect(parseRun(edited(state, (r) => void (r.base.run = 0)))).toBeNull();
    expect(parseRun(edited(state, (r) => void (r.outcome.loadout = ['no_such_item' as never])))).toBeNull();
    expect(parseRun(edited(state, (r) => void (r.state.stats.hp = 0)))).toBeNull();
    expect(parseRun(edited(state, (r) => void (r.state.current.seen = r.state.current.seen.slice(1))))).toBeNull();
    expect(parseRun(edited(state, (r) => void (r.state.current.enemies[0]!.id = 'no_such_enemy')))).toBeNull();
  });

  it('終わった探索は読み込まない', () => {
    const state = play(start(), 40);
    expect(parseRun(edited(state, (r) => void (r.state.outcome = 'defeated')))).toBeNull();
  });

  it('壁の中にいるなど、マップと合わない位置は null', () => {
    const state = play(start(), 40);
    const wall = state.map.tiles.indexOf('wall');
    const pos = { x: wall % state.map.width, y: Math.floor(wall / state.map.width) };
    expect(parseRun(edited(state, (r) => void (r.state.player = pos)))).toBeNull();
    expect(parseRun(edited(state, (r) => void (r.state.current.enemies[0]!.pos = pos)))).toBeNull();
  });

  it('ダンジョンを選べるようになる前の中断データ（ダンジョンの ID がない）は、標準のダンジョンとして読む', () => {
    const state = play(start(), 40);
    const old = edited(state, (r) => {
      delete (r.outcome as Partial<Departure>).dungeon;
      delete (r.state as { dungeon?: string }).dungeon;
    });
    const run = parseRun(old);
    expect(run).not.toBeNull();
    expect(run!.outcome.dungeon).toBe(DEFAULT_DUNGEON_ID);
    expect(run!.state.dungeon).toBe(DEFAULT_DUNGEON_ID);
  });

  it('遊んでいたダンジョンの設定ファイルがもうない、または結果と食い違うときは null', () => {
    const state = play(start(), 40);
    expect(parseRun(edited(state, (r) => void (r.outcome.dungeon = 'no_such_dungeon')))).toBeNull();
    expect(parseRun(edited(state, (r) => void (r.state.dungeon = 'no_such_dungeon')))).toBeNull();
    expect(parseRun(edited(state, (r) => void (r.state.dungeon = 42 as never)))).toBeNull();
  });

  it('マップの作り方が変わっていたら（作り直した形が違えば）null', () => {
    const state = play(start(), 40);
    expect(parseRun(edited(state, (r) => void (r.state.current.mapCheck += 1)))).toBeNull();
    // シードが違えば、作り直した形も違う
    expect(parseRun(edited(state, (r) => void (r.state.seed += 1)))).toBeNull();
  });
});
