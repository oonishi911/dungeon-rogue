import { describe, expect, it } from 'vitest';
import { DEFAULT_DUNGEON_ID } from './dungeons';
import { ENEMIES } from './data';
import { newSave } from './save';
import { ask, startInformant } from './informant';
import { VOICES } from './informantVoice';
import { ENDING, FRAGMENTS, HOTLINES, ROOM_STAGE_MAX, lost, LOST, roomStage, toneOf, MEMORIES, MEMORY_COUNT, NOTICE, REWIND_LINES, recall, rewindLines, roomScene, ROOM_CHANGES, ROOM_FIRST, ROOM_WISH } from './story';

const BOSSES = Object.keys(MEMORIES);

describe('記憶と、ボス', () => {
  it('記憶は、ゲームにいるボス5体と、ぴったり対応する', () => {
    const real = Object.values(ENEMIES).filter((e) => e.boss).map((e) => e.id).sort();
    expect([...BOSSES].sort()).toEqual(real);
    expect(MEMORY_COUNT).toBe(5);
  });
});

describe('recall（ダンジョンを踏破したとき）', () => {
  it('まだ思い出していないボスなら、その記憶が戻り、最初の部屋の場面がつく', () => {
    const r = recall(newSave(), 'flame_beast');
    expect(r.save.memories).toEqual(['flame_beast']);
    expect(r.scene).toMatchObject({ kind: 'memory', boss: 'flame_beast', room: ROOM_FIRST, ending: null });
  });

  it('2つめ以降は、部屋が少しだけ変わる', () => {
    const r = recall({ ...newSave(), memories: ['flame_beast'] }, 'ice_colossus');
    expect(r.scene).toMatchObject({ kind: 'memory', room: [ROOM_CHANGES[0], ROOM_WISH] });
  });

  it('5つそろう前に、すでに思い出したボスを倒しても、何も出さない（記録も変わらない）', () => {
    const save = { ...newSave(), memories: ['flame_beast', 'ice_colossus'] };
    const r = recall(save, 'flame_beast');
    expect(r.scene).toBeNull();
    expect(r.save).toEqual(save);
  });

  it('5つめを思い出したとき、最後の場面がつく', () => {
    const save = { ...newSave(), memories: BOSSES.slice(0, 4) };
    const r = recall(save, BOSSES[4]!);
    expect(r.save.memories).toHaveLength(5);
    expect(r.scene).toMatchObject({ kind: 'memory', ending: ENDING });
  });

  it('5つそろったあとは、ボスを倒すたびに、かけらが1つずつ出る。使い切ったら最後のものを繰り返す', () => {
    let save = { ...newSave(), memories: BOSSES };
    const seen: string[] = [];
    for (let i = 0; i < FRAGMENTS.length + 2; i++) {
      const r = recall(save, BOSSES[i % 5]!);
      expect(r.scene).toMatchObject({ kind: 'fragment' });
      seen.push((r.scene as { fragment: string }).fragment);
      save = r.save;
    }
    expect(seen.slice(0, FRAGMENTS.length)).toEqual(FRAGMENTS);
    expect(seen.slice(FRAGMENTS.length)).toEqual([FRAGMENTS.at(-1), FRAGMENTS.at(-1)]);
    expect(save.fragments).toBe(FRAGMENTS.length + 2);
  });

  it('同じ記録から、何度計算しても、同じ結果になる（途中で閉じても、二重に進まない）', () => {
    const save = { ...newSave(), memories: ['dark_lord'] };
    expect(recall(save, 'ogre_chief')).toEqual(recall(save, 'ogre_chief'));
  });

  it('知らないボスでは、何も起きない', () => {
    expect(recall(newSave(), 'slime')).toEqual({ save: newSave(), scene: null });
  });
});

describe('部屋の場面・力尽きたとき', () => {
  it('部屋の場面は、変化を使い切っても、順に繰り返す', () => {
    expect(roomScene(0)).toEqual(ROOM_FIRST);
    expect(roomScene(ROOM_CHANGES.length + 1)[0]).toBe(ROOM_CHANGES[0]);
  });

  it('力尽きたときの文章は、挑戦の回数で順に変わる', () => {
    expect(rewindLines(1)).toEqual(REWIND_LINES[0]);
    expect(rewindLines(2)).toEqual(REWIND_LINES[1]);
    expect(rewindLines(1 + REWIND_LINES.length)).toEqual(REWIND_LINES[0]);
  });
});

describe('文章の約束（docs/story.md「表現の約束」）', () => {
  const all = [
    ...BOSSES.flatMap((b) => [...MEMORIES[b]!.lines, MEMORIES[b]!.echo, MEMORIES[b]!.crossed]),
    ...ROOM_FIRST,
    ...ROOM_CHANGES,
    ...ENDING,
    ...FRAGMENTS,
    ...REWIND_LINES.flat(),
    ...NOTICE,
  ].join('\n');

  it('自害の方法や場所に触れる言葉は、入れない', () => {
    for (const word of ['死に方', '首をつ', '飛び降', '飛びこ', '手首', '刃', '薬を', 'ロープ', '橋', '屋上', '睡眠薬']) {
      expect(all).not.toContain(word);
    }
  });

  it('相談窓口は、電話番号の形をしている', () => {
    for (const h of HOTLINES) expect(/^0\d{2,3}-\d{2,3}-\d{3,4}$/.test(h.number)).toBe(true);
  });
});

describe('店と情報屋（忘れ物・口調・部屋）', () => {
  it('忘れ物は、◇ を付けて数える', () => {
    expect(lost(30)).toBe('◇30');
    expect(LOST.shop).toBe('忘れ物屋');
  });

  it('口調は、思い出した記憶の数で、0・1・2と進む', () => {
    expect([0, 1, 2, 3, 4, 5].map(toneOf)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('部屋の背景は、記憶とかけらの数で進み、上限で止まる', () => {
    const at = (memories: number, fragments: number) => roomStage({ memories: BOSSES.slice(0, memories), fragments });
    expect(at(0, 0)).toBe(0);
    expect(at(3, 0)).toBe(3);
    expect(at(5, 0)).toBe(5);
    expect(at(5, 2)).toBe(7);
    expect(at(5, 99)).toBe(ROOM_STAGE_MAX);
  });

  it('同じことを聞いても、口調で言い方は変わるが、店のメモ（内容）は変わらない', () => {
    const answers = ([0, 1, 2] as const).map((tone) => {
      let r = ask(startInformant(DEFAULT_DUNGEON_ID, 1234, 'fire', tone), { ...newSave(), gold: 999 }, 'trait', true);
      if (!r.ok) throw new Error(r.error);
      r = ask(r.value.state, r.value.save, 'boss', true);
      if (!r.ok) throw new Error(r.error);
      return r.value.state.heard;
    });
    expect(new Set(answers.map((h) => h[0]!.text)).size).toBe(3);
    expect(new Set(answers.map((h) => h[1]!.text)).size).toBe(3);
    for (const h of answers) expect(h.map((x) => x.memo)).toEqual(answers[0]!.map((x) => x.memo));
  });

  it('3つの口調のどれにも、全部の言い回しがある（空の文はない）', () => {
    for (const tone of [0, 1, 2] as const) {
      const v = VOICES[tone];
      const all = [v.greeting('あそこ', 2), v.farewell, v.trait.clear('炎'), v.trait.vague('a', 'b'), v.body.clear('硬い', v.weak.magic), v.body.vague('a', 'b', 'c', 'd'), v.boss.clear('x', 'y', 'z'), v.boss.vague('a', 'b'), v.boss.unknown, v.weak.magic, v.weak.physical, v.weak.none];
      for (const t of all) expect(t.length).toBeGreaterThan(0);
    }
  });
});
