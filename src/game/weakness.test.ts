// 敵の弱点・図鑑・出会った敵の記録（docs/enemy-weakness.md）
import { describe, expect, it } from 'vitest';
import { appearingEnemies, bestiary, bestiaryProgress } from './bestiary';
import { receiveLoot } from './engrave';
import { ENEMIES } from './data';
import { noFound } from './echo';
import { startExplore, step } from './explore';
import { tileAt } from './map';
import { parseSave, newSave } from './save';
import type { EnemyDef, EnemyId } from './types';
import { resistLine, weaknessLine, weaknessOf, weakMarks } from './weakness';

const foe = (change: Partial<EnemyDef> = {}): EnemyDef => ({ id: 'x', name: 'x', hp: 10, atk: 5, def: 2, element: 'neutral', body: 'normal', ...change });

describe('弱点', () => {
  it('体質に効く武器、属性に効く属性を、強い順に返す。効きにくいものも返す', () => {
    const w = weaknessOf(foe({ element: 'ice', body: 'hard' }));
    expect(w.weapons).toEqual([{ id: 'hammer', rate: 1.5 }]);
    expect(w.resistWeapons).toEqual([{ id: 'sword', rate: 0.6 }]);
    expect(w.elements).toEqual([{ id: 'fire', rate: 2 }]);
    expect(w.resistElements).toEqual([{ id: 'ice', rate: 0.5 }]);
    // 闇の敵には、光がいちばん効き、炎も少し効く。氷は少し効きにくい
    const dark = weaknessOf(foe({ element: 'dark' }));
    expect(dark.elements).toEqual([
      { id: 'light', rate: 2 },
      { id: 'fire', rate: 1.5 },
    ]);
    expect(dark.resistElements).toEqual([
      { id: 'dark', rate: 0.5 },
      { id: 'ice', rate: 0.75 },
    ]);
  });

  it('普通の体・無属性の敵は、武器・属性の弱点がない', () => {
    const w = weaknessOf(foe());
    expect(w.weapons).toEqual([]);
    expect(w.elements).toEqual([]);
    expect(weakMarks(foe())).toEqual([]);
    expect(weaknessLine(w)).toBe('とくに弱点はない');
    expect(resistLine(w)).toBe('効きにくいものはない');
  });

  it('頭上の印は、いちばん効く武器・属性と、魔法か物理の弱さ', () => {
    expect(weakMarks(foe({ element: 'dark', body: 'spirit', magic: 1.5 })).map((m) => m.text)).toEqual(['杖', '光', '魔']);
    expect(weakMarks(foe({ body: 'soft', physical: 1.3 })).map((m) => m.text)).toEqual(['剣', '物']);
    expect(weakMarks(foe({ magic: 0.5 })).map((m) => m.text)).toEqual([]);
    // アイコンは、武器の種類・属性・魔法・物理
    expect(weakMarks(foe({ element: 'dark', body: 'spirit', magic: 1.5 })).map((m) => m.icon)).toEqual(['staff', 'light', 'magic']);
    expect(weakMarks(foe({ body: 'soft', physical: 1.3 })).map((m) => m.icon)).toEqual(['sword', 'physical']);
  });

  it('文にする', () => {
    expect(weaknessLine(weaknessOf(foe({ element: 'fire', body: 'soft' })))).toBe('剣×1.5・氷×2がよく効く');
    expect(resistLine(weaknessOf(foe({ element: 'fire', body: 'soft', magic: 0.5 })))).toBe('杖×0.6・炎×0.5・魔法×0.5が効きにくい');
  });
});

describe('図鑑', () => {
  it('どれかのダンジョンに出る敵が、属性ごと・ボスに分かれて並ぶ。出会っていない敵はわからない', () => {
    const all = appearingEnemies();
    expect(all.length).toBeGreaterThan(0);
    const first = all[0]!;
    const groups = bestiary([first]);
    const entries = groups.flatMap((g) => g.entries);
    expect(entries.map((e) => e.id).sort()).toEqual([...all].sort());
    expect(entries.filter((e) => e.met).map((e) => e.id)).toEqual([first]);
    for (const g of groups) {
      for (const e of g.entries) expect(g.id === 'boss' ? e.def.boss : e.def.element).toBe(g.id === 'boss' ? true : g.id);
    }
    expect(bestiaryProgress([first, first, 'nobody' as EnemyId])).toEqual({ met: 1, total: all.length });
  });
});

describe('出会った敵の記録', () => {
  it('探索で見えた敵が記録され、終わったらセーブに入る（重ねない）', () => {
    // 主人公の隣の床に、まだうろついている敵を置いて、1回待つ
    let s = startExplore(7, { loadout: ['sword'], enemyDensity: 0 });
    expect(s.found.met).toEqual([]);
    const near = [
      { x: s.player.x + 1, y: s.player.y },
      { x: s.player.x - 1, y: s.player.y },
      { x: s.player.x, y: s.player.y + 1 },
      { x: s.player.x, y: s.player.y - 1 },
    ].find((p) => tileAt(s.map, p) === 'floor')!;
    const id = Object.keys(ENEMIES).find((k) => !ENEMIES[k as EnemyId]!.boss) as EnemyId;
    s = { ...s, enemies: [{ uid: 99, id, elite: false, pos: near, hp: 999, mode: 'wander', justNoticed: false, lastSeen: null, searchTurns: 0 }] };
    const r = step(s, { kind: 'wait' });
    if (!r.ok) throw new Error(r.error);
    s = r.value;
    expect(s.found.met).toEqual([id]);
    expect(s.found.met.length).toBeGreaterThan(0);
    const saved = receiveLoot({ ...newSave(), met: [s.found.met[0]!] }, s.found);
    expect(saved.met).toEqual([...new Set(s.found.met)]);
    expect(receiveLoot(saved, { ...noFound(), met: s.found.met }).met).toEqual(saved.met);
  });

  it('セーブの出会った敵は、今いる敵だけ読む。ない昔の記録は空', () => {
    const id = Object.keys(ENEMIES)[0] as EnemyId;
    const raw = { ...newSave(), met: [id, 'nobody', id] };
    expect(parseSave(JSON.stringify(raw))?.met).toEqual([id]);
    const { met: _drop, ...old } = newSave();
    expect(parseSave(JSON.stringify(old))?.met).toEqual([]);
  });
});
