import { describe, expect, it } from 'vitest';
import {
  ADMIN_TABS,
  adminTabFromUrl,
  adminTabUrl,
  copyJson,
  ENEMY_FILE,
  GEN_FILE,
  planPublish,
  showsPreview,
  tabChanged,
  type AdminData,
  type AdminTab,
} from './adminScreen';
import { addEnemy, removeEnemy, serializeEnemyMaster, setWeight, type EnemyMaster } from './enemyMaster';
// 関数を確かめるための、決まった中身のデータ（管理画面で enemies.json や dungeonGen.json を変えても、こちらは変わらない）
import sample from './enemyMaster.sample.json';
import { serializeGenSettings, type GenSettings } from './genMaster';

const GEN: GenSettings = {
  floors: { count: 3, sizes: [20, 30, 40, 50, 60, 70, 80, 90, 100], satiety: [400, 900, 1600, 2500, 3600, 4900, 6400, 8100, 10000] },
  rooms: { attemptRate: 0.04, minSize: 3, maxSize: 9 },
  enemies: { amount: 1, placement: 'mixed', roomWeight: 1, nestChance: 0, nestMin: 3, nestMax: 5, stayInRoom: false },
  growth: { expBase: 30, expStep: 20, hpPerLevel: 2, atkPerLevel: 1, maxLevel: 10, eliteRate: 3 },
  magic: { maxMp: 20, regenEvery: 6, power: 8, staffPower: 1.5, staffMp: 10, noiseRadius: 3 },
  spells: {
    shockwave: { cost: 6, power: 0.3, push: 3, crash: 3 },
    sweep: { cost: 5, power: 0.8, range: 3 },
    fire_bolt: { cost: 4, power: 1, range: 6 },
    ice_bolt: { cost: 4, power: 1, range: 6 },
    light_lance: { cost: 4, power: 1, range: 6 },
    dark_bolt: { cost: 4, power: 1, range: 6 },
    heal: { cost: 6, amount: 20 },
    regen: { cost: 5, amount: 3, turns: 8 },
  },
};
const BASE: AdminData = { enemies: sample as unknown as EnemyMaster, gen: GEN };
const edited = (change: (d: AdminData) => void): AdminData => {
  const d = copyJson(BASE);
  change(d);
  return d;
};
const goblinHp = (d: AdminData) => void (d.enemies.enemies.goblin!.hp += 1);
const floorCount = (d: AdminData) => void (d.gen.floors.count += 1);

describe('管理画面の公開（敵とダンジョンの設定をまとめて扱う）', () => {
  it('何も変えていなければ、保存するものも直すところもない', () => {
    const plan = planPublish(BASE, copyJson(BASE));
    expect(plan.changes).toEqual([]);
    expect(plan.files).toEqual([]);
    expect(plan.problems).toEqual([]);
  });

  it('敵だけ変えたら、enemies.json だけを保存する', () => {
    const draft = edited(goblinHp);
    const plan = planPublish(BASE, draft);
    expect(plan.files).toEqual([{ path: ENEMY_FILE, text: serializeEnemyMaster(draft.enemies), base: serializeEnemyMaster(BASE.enemies) }]);
    expect(plan.message.split('\n')[0]).toBe('敵のデータを更新する（管理画面から）');
    expect(plan.changes).toEqual([`ゴブリン：HP 14 → 15`]);
  });

  it('ダンジョンの設定だけ変えたら、dungeonGen.json だけを保存する', () => {
    const draft = edited(floorCount);
    const plan = planPublish(BASE, draft);
    expect(plan.files).toEqual([{ path: GEN_FILE, text: serializeGenSettings(draft.gen), base: serializeGenSettings(BASE.gen) }]);
    expect(plan.message.split('\n')[0]).toBe('ダンジョンの設定を更新する（管理画面から）');
  });

  it('満腹度だけ変えても、dungeonGen.json を保存する（説明にランクごとの満腹度が出る）', () => {
    const draft = edited((d) => void (d.gen.floors.satiety[1] = 1200));
    const plan = planPublish(BASE, draft);
    expect(plan.files.map((f) => f.path)).toEqual([GEN_FILE]);
    expect(plan.changes).toEqual(['ランク2の満腹度：900 → 1200']);
    expect(JSON.parse(plan.files[0]!.text).floors.satiety[1]).toBe(1200);
  });

  it('両方変えたら、2つのファイルを、1つの説明でまとめて保存する', () => {
    const draft = edited((d) => {
      goblinHp(d);
      floorCount(d);
    });
    const plan = planPublish(BASE, draft);
    expect(plan.files.map((f) => f.path)).toEqual([ENEMY_FILE, GEN_FILE]);
    expect(plan.changes).toHaveLength(2);
    const [title, blank, ...lines] = plan.message.split('\n');
    expect(title).toBe('敵のデータとダンジョンの設定を更新する（管理画面から）');
    expect(blank).toBe('');
    expect(lines).toEqual(plan.changes.map((c) => `- ${c}`));
  });

  it('どちらかに直すところがあれば、問題として出す（両方の分をまとめて）', () => {
    const bad = edited((d) => {
      d.enemies.enemies.goblin!.hp = -5;
      d.gen.floors.count = 0;
    });
    const { problems } = planPublish(BASE, bad);
    expect(problems.length).toBeGreaterThanOrEqual(2);
    expect(planPublish(BASE, edited((d) => void (d.enemies.enemies.goblin!.hp = -5))).problems.length).toBeGreaterThan(0);
    expect(planPublish(BASE, edited((d) => void (d.gen.floors.count = 0))).problems.length).toBeGreaterThan(0);
  });
});

describe('管理画面のタブ', () => {
  it('敵のデータの2つと、ダンジョンの設定の5つがある', () => {
    expect(ADMIN_TABS.map((t) => t.id)).toEqual(['enemies', 'pool', 'floors', 'rooms', 'placement', 'growth', 'magic']);
    expect(ADMIN_TABS.filter((t) => t.part === 'enemies')).toHaveLength(2);
    expect(ADMIN_TABS.filter((t) => t.part === 'gen')).toHaveLength(5);
  });

  it('マップの見本は、ダンジョンの設定のタブでだけ出す', () => {
    expect(ADMIN_TABS.filter((t) => showsPreview(t.id)).map((t) => t.id)).toEqual(['floors', 'rooms', 'placement', 'growth', 'magic']);
  });

  it('住所の tab= で、開くタブを決める', () => {
    expect(adminTabFromUrl('?view=admin')).toBe('enemies');
    expect(adminTabFromUrl('?view=admin&tab=magic')).toBe('magic');
    expect(adminTabFromUrl('?tab=pool')).toBe('pool');
    expect(adminTabFromUrl('?view=admin&tab=でたらめ')).toBe('enemies');
  });

  it('前の住所も、合うタブを開く', () => {
    expect(adminTabFromUrl('?view=enemies')).toBe('enemies');
    expect(adminTabFromUrl('?view=gen')).toBe('floors');
    expect(adminTabFromUrl('?view=gen&tab=rooms')).toBe('rooms');
    // 前のダンジョンの設定の「敵の数と置き方」は、tab=enemies だった
    expect(adminTabFromUrl('?view=gen&tab=enemies')).toBe('placement');
    expect(adminTabFromUrl('?view=gen&tab=magic')).toBe('magic');
  });

  it('選んだタブを、?view=admin の住所に入れる（ほかの指定は残す）', () => {
    expect(adminTabUrl('https://example.com/dungeon-rogue/?view=gen&tab=rooms&x=1', 'magic').search).toBe('?view=admin&tab=magic&x=1');
    expect(adminTabUrl('https://example.com/dungeon-rogue/?view=enemies', 'pool').search).toBe('?view=admin&tab=pool');
  });

  it('変えたタブにだけ、変えた印が付く', () => {
    const changedTabs = (draft: AdminData): AdminTab[] => ADMIN_TABS.filter((t) => tabChanged(t.id, BASE, draft)).map((t) => t.id);
    expect(changedTabs(copyJson(BASE))).toEqual([]);
    expect(changedTabs(edited(goblinHp))).toEqual(['enemies']);
    expect(changedTabs(edited((d) => void (d.enemies.dungeons.fire.pool = setWeight(d.enemies.dungeons.fire.pool, 'goblin', 3))))).toEqual(['pool']);
    expect(changedTabs(edited(floorCount))).toEqual(['floors']);
    expect(changedTabs(edited((d) => void (d.gen.floors.satiety[0] = 500)))).toEqual(['floors']);
    expect(changedTabs(edited((d) => void (d.gen.rooms.maxSize = 11)))).toEqual(['rooms']);
    expect(changedTabs(edited((d) => void (d.gen.enemies.nestMax = 6)))).toEqual(['placement']);
    expect(changedTabs(edited((d) => void (d.gen.growth.maxLevel = 12)))).toEqual(['growth']);
    expect(changedTabs(edited((d) => void (d.gen.magic.maxMp = 30)))).toEqual(['magic']);
    expect(changedTabs(edited((d) => void (d.gen.spells.heal.amount = 25)))).toEqual(['magic']);
  });

  it('敵を足してすぐ消したときは、何も変えていないことになる（項目の並び順が変わっても、変えた印は付かない）', () => {
    const draft = edited((d) => {
      d.enemies = removeEnemy(addEnemy(d.enemies, 'cave_bat', { ...d.enemies.enemies.goblin!, name: '洞窟コウモリ' }), 'cave_bat');
    });
    expect(ADMIN_TABS.filter((t) => tabChanged(t.id, BASE, draft))).toEqual([]);
    expect(planPublish(BASE, draft).changes).toEqual([]);
  });
});
