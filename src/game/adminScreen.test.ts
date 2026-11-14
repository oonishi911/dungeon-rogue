import { describe, expect, it } from 'vitest';
import {
  ADMIN_TABS,
  adminDungeonFromUrl,
  adminTabFromUrl,
  adminTabUrl,
  bossUses,
  copyJson,
  dungeonStatus,
  duplicateDungeon,
  ENEMY_FILE,
  isDungeonTab,
  planPublish,
  removeDungeon,
  removeEnemyEverywhere,
  showsPreview,
  tabChanged,
  type AdminData,
  type AdminTab,
} from './adminScreen';
import { dungeonPath } from './dungeons';
import { addEnemy, removeEnemy, serializeEnemyMaster, setWeight, type Encounters, type EnemyMaster } from './enemyMaster';
// 関数を確かめるための、決まった中身のデータ（管理画面で enemies.json やダンジョンの設定を変えても、こちらは変わらない）
import sample from './enemyMaster.sample.json';
import { serializeDungeon, type DungeonFile, type GenSettings } from './genMaster';

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
const dungeon = (name: string): DungeonFile => ({ name, description: `${name}の説明`, ...copyJson(GEN), encounters: copyJson(sample.encounters) as Encounters });
// 標準のダンジョンと、もう1つ（ほら穴）がある状態
const BASE: AdminData = {
  enemies: { enemies: copyJson(sample.enemies) } as EnemyMaster,
  dungeons: { standard: dungeon('標準'), cave: dungeon('ほら穴') },
};
const edited = (change: (d: AdminData) => void): AdminData => {
  const d = copyJson(BASE);
  change(d);
  return d;
};
const goblinHp = (d: AdminData) => void (d.enemies.enemies.goblin!.hp += 1);
const floorCount = (d: AdminData) => void (d.dungeons.standard!.floors.count += 1);

describe('管理画面の公開（敵のデータと、いくつものダンジョンの設定をまとめて扱う）', () => {
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

  it('1つのダンジョンだけ変えたら、そのダンジョンのファイルだけを保存する（変えたところの頭に、ダンジョンの名前を付ける）', () => {
    const draft = edited((d) => void (d.dungeons.cave!.floors.satiety[1] = 1200));
    const plan = planPublish(BASE, draft);
    expect(plan.files).toEqual([{ path: dungeonPath('cave'), text: serializeDungeon(draft.dungeons.cave!), base: serializeDungeon(BASE.dungeons.cave!) }]);
    expect(plan.changes).toEqual(['ほら穴：ランク2の満腹度：900 → 1200']);
    expect(plan.message.split('\n')[0]).toBe('ダンジョンの設定を更新する（管理画面から）');
  });

  it('出る敵や名前を変えても、そのダンジョンのファイルを保存する', () => {
    const draft = edited((d) => {
      d.dungeons.standard!.encounters.fire.pool = setWeight(d.dungeons.standard!.encounters.fire.pool, 'goblin', 2);
      d.dungeons.standard!.name = '始まりの迷宮';
    });
    const plan = planPublish(BASE, draft);
    expect(plan.files.map((f) => f.path)).toEqual([dungeonPath('standard')]);
    expect(plan.changes).toEqual(['始まりの迷宮：名前：標準 → 始まりの迷宮', '始まりの迷宮：炎の属性：ゴブリンの出やすさ 1 → 2']);
  });

  it('敵とダンジョンの両方を変えたら、全部のファイルを、1つの説明でまとめて保存する', () => {
    const draft = edited((d) => {
      goblinHp(d);
      floorCount(d);
      d.dungeons.cave!.rooms.maxSize = 11;
    });
    const plan = planPublish(BASE, draft);
    expect(plan.files.map((f) => f.path)).toEqual([ENEMY_FILE, dungeonPath('standard'), dungeonPath('cave')]);
    expect(plan.changes).toHaveLength(3);
    const [title, blank, ...lines] = plan.message.split('\n');
    expect(title).toBe('敵のデータとダンジョンの設定を更新する（管理画面から）');
    expect(blank).toBe('');
    expect(lines).toEqual(plan.changes.map((c) => `- ${c}`));
  });

  it('複製して作ったダンジョンは、新しいファイルとして作る（もとの公開版はない）', () => {
    const draft = duplicateDungeon(copyJson(BASE), 'cave', 'deep_cave', '深いほら穴');
    expect(Object.keys(draft.dungeons)).toEqual(['standard', 'cave', 'deep_cave']);
    expect(draft.dungeons.deep_cave).toEqual({ ...BASE.dungeons.cave, name: '深いほら穴' });
    const plan = planPublish(BASE, draft);
    expect(plan.files).toEqual([{ path: dungeonPath('deep_cave'), text: serializeDungeon(draft.dungeons.deep_cave!), base: null }]);
    expect(plan.changes).toEqual(['ダンジョン「深いほら穴」（deep_cave）を作る']);
    expect(plan.problems).toEqual([]);
    // もとと切り離されている（複製したほうを変えても、もとは変わらない）
    draft.dungeons.deep_cave!.floors.count = 9;
    expect(draft.dungeons.cave!.floors.count).toBe(GEN.floors.count);
    // 同じ ID があれば作らない
    expect(duplicateDungeon(BASE, 'cave', 'standard', 'x')).toBe(BASE);
  });

  it('消したダンジョンは、ファイルを消す。標準のダンジョンは消せない', () => {
    const draft = removeDungeon(copyJson(BASE), 'cave');
    const plan = planPublish(BASE, draft);
    expect(plan.files).toEqual([{ path: dungeonPath('cave'), text: null, base: serializeDungeon(BASE.dungeons.cave!) }]);
    expect(plan.changes).toEqual(['ダンジョン「ほら穴」（cave）を消す']);
    expect(removeDungeon(BASE, 'standard')).toBe(BASE);
    // 手で消してしまったときも、公開できないようにする
    expect(planPublish(BASE, edited((d) => void delete d.dungeons.standard)).problems).toContain('標準のダンジョン（standard）は消せません');
  });

  it('直すところは、どのダンジョンのことかを頭に付けて出す。名前の重なりや、使えない ID も問題にする', () => {
    const bad = edited((d) => {
      d.enemies.enemies.goblin!.hp = -5;
      d.dungeons.cave!.floors.count = 0;
    });
    const { problems } = planPublish(BASE, bad);
    expect(problems.some((p) => p.includes('HPは1〜999の整数'))).toBe(true);
    expect(problems).toContain('ほら穴：階の数：1〜10の数にする');
    expect(planPublish(BASE, edited((d) => void (d.dungeons.cave!.name = '標準'))).problems).toContain('標準（cave）：ほかのダンジョン（standard）と同じ名前になっている');
    expect(planPublish(BASE, edited((d) => void (d.dungeons['Bad-Id'] = dungeon('変なID')))).problems.some((p) => p.startsWith('変なID：ID（Bad-Id）'))).toBe(true);
  });

  it('敵を消すと、すべてのダンジョンの道中からも外れる（ファイルも保存する）', () => {
    const draft = removeEnemyEverywhere(copyJson(BASE), 'goblin');
    expect(draft.enemies.enemies).not.toHaveProperty('goblin');
    for (const d of Object.values(draft.dungeons)) for (const e of Object.values(d.encounters)) expect(e.pool).not.toContain('goblin');
    const plan = planPublish(BASE, draft);
    expect(plan.files.map((f) => f.path)).toEqual([ENEMY_FILE, dungeonPath('standard'), dungeonPath('cave')]);
    expect(plan.changes).toEqual(['ゴブリン（goblin）を消す', '標準：消した敵を、道中に出る敵から外す', 'ほら穴：消した敵を、道中に出る敵から外す']);
    expect(plan.problems).toEqual([]);
  });

  it('ボスにしているところを調べる（あれば、その敵は消せない）。マスターだけから消すと、問題になる', () => {
    expect(bossUses(BASE, 'ogre_chief')).toEqual(['標準の無属性', 'ほら穴の無属性']);
    expect(bossUses(BASE, 'goblin')).toEqual([]);
    const draft = edited((d) => void (d.enemies = removeEnemy(d.enemies, 'ogre_chief')));
    expect(planPublish(BASE, draft).problems).toContain('標準：無属性の属性：ボスがいない');
  });
});

describe('管理画面のタブ', () => {
  it('敵のデータの1つと、ダンジョンの設定の7つがある', () => {
    expect(ADMIN_TABS.map((t) => t.id)).toEqual(['enemies', 'about', 'pool', 'floors', 'rooms', 'placement', 'growth', 'magic']);
    expect(ADMIN_TABS.filter((t) => isDungeonTab(t.id)).map((t) => t.id)).toEqual(['about', 'pool', 'floors', 'rooms', 'placement', 'growth', 'magic']);
  });

  it('マップの見本は、マップと探索の設定のタブでだけ出す', () => {
    expect(ADMIN_TABS.filter((t) => showsPreview(t.id)).map((t) => t.id)).toEqual(['floors', 'rooms', 'placement', 'growth', 'magic']);
  });

  it('住所の tab= で、開くタブを決める', () => {
    expect(adminTabFromUrl('?view=admin')).toBe('enemies');
    expect(adminTabFromUrl('?view=admin&tab=magic')).toBe('magic');
    expect(adminTabFromUrl('?view=admin&tab=about')).toBe('about');
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

  it('住所の dungeon= で、直すダンジョンを決める（ないダンジョンなら標準）', () => {
    expect(adminDungeonFromUrl('?view=admin&dungeon=cave', ['standard', 'cave'])).toBe('cave');
    expect(adminDungeonFromUrl('?view=admin&dungeon=nothing', ['standard', 'cave'])).toBe('standard');
    expect(adminDungeonFromUrl('?view=admin', ['standard', 'cave'])).toBe('standard');
  });

  it('選んだタブとダンジョンを、?view=admin の住所に入れる（標準のダンジョンなら dungeon= は付けない。ほかの指定は残す）', () => {
    expect(adminTabUrl('https://example.com/dungeon-rogue/?view=gen&tab=rooms&x=1', 'magic').search).toBe('?view=admin&tab=magic&x=1');
    expect(adminTabUrl('https://example.com/dungeon-rogue/?view=enemies', 'pool', 'cave').search).toBe('?view=admin&tab=pool&dungeon=cave');
    expect(adminTabUrl('https://example.com/dungeon-rogue/?view=admin&tab=pool&dungeon=cave', 'pool', 'standard').search).toBe('?view=admin&tab=pool');
  });

  it('変えたタブにだけ、変えた印が付く（ダンジョンの設定のタブは、直しているダンジョンの分）', () => {
    const changedTabs = (draft: AdminData, dungeonId = 'standard'): AdminTab[] => ADMIN_TABS.filter((t) => tabChanged(t.id, BASE, draft, dungeonId)).map((t) => t.id);
    expect(changedTabs(copyJson(BASE))).toEqual([]);
    expect(changedTabs(edited(goblinHp))).toEqual(['enemies']);
    expect(changedTabs(edited((d) => void (d.dungeons.standard!.encounters.fire.pool = setWeight(d.dungeons.standard!.encounters.fire.pool, 'goblin', 3))))).toEqual(['pool']);
    expect(changedTabs(edited((d) => void (d.dungeons.standard!.name = '別の名前')))).toEqual(['about']);
    expect(changedTabs(edited((d) => void (d.dungeons.standard!.description = '')))).toEqual(['about']);
    expect(changedTabs(edited(floorCount))).toEqual(['floors']);
    expect(changedTabs(edited((d) => void (d.dungeons.standard!.floors.satiety[0] = 500)))).toEqual(['floors']);
    expect(changedTabs(edited((d) => void (d.dungeons.standard!.rooms.maxSize = 11)))).toEqual(['rooms']);
    expect(changedTabs(edited((d) => void (d.dungeons.standard!.enemies.nestMax = 6)))).toEqual(['placement']);
    expect(changedTabs(edited((d) => void (d.dungeons.standard!.growth.maxLevel = 12)))).toEqual(['growth']);
    expect(changedTabs(edited((d) => void (d.dungeons.standard!.magic.maxMp = 30)))).toEqual(['magic']);
    expect(changedTabs(edited((d) => void (d.dungeons.standard!.spells.heal.amount = 25)))).toEqual(['magic']);
    // ほかのダンジョンを変えても、標準のダンジョンを直しているあいだは印が付かない
    expect(changedTabs(edited((d) => void (d.dungeons.cave!.magic.maxMp = 30)))).toEqual([]);
    expect(changedTabs(edited((d) => void (d.dungeons.cave!.magic.maxMp = 30)), 'cave')).toEqual(['magic']);
    // 新しく作るダンジョンは、どのタブも変えたことになる
    const added = duplicateDungeon(copyJson(BASE), 'cave', 'deep_cave', '深いほら穴');
    expect(changedTabs(added, 'deep_cave')).toEqual(['about', 'pool', 'floors', 'rooms', 'placement', 'growth', 'magic']);
  });

  it('ダンジョンを選ぶ欄に出す、ダンジョンの様子', () => {
    const draft = duplicateDungeon(edited((d) => void (d.dungeons.cave!.rooms.maxSize = 11)), 'cave', 'deep_cave', '深いほら穴');
    expect(dungeonStatus('standard', BASE, draft)).toBe('same');
    expect(dungeonStatus('cave', BASE, draft)).toBe('changed');
    expect(dungeonStatus('deep_cave', BASE, draft)).toBe('new');
  });

  it('敵を足してすぐ消したときは、何も変えていないことになる（項目の並び順が変わっても、変えた印は付かない）', () => {
    const draft = edited((d) => {
      d.enemies = removeEnemy(addEnemy(d.enemies, 'cave_bat', { ...d.enemies.enemies.goblin!, name: '洞窟コウモリ' }), 'cave_bat');
    });
    expect(ADMIN_TABS.filter((t) => tabChanged(t.id, BASE, draft))).toEqual([]);
    expect(planPublish(BASE, draft).changes).toEqual([]);
  });
});
