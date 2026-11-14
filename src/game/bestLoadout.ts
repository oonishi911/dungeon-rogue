// 開発用：ダンジョンの特性に合わせて、いちばん強い装備・道具・呪文書を選ぶ（準備を通さずに探索を試すときに使う）。
// 敵のデータ（enemies.json）と、ダンジョンの設定（出る敵・魔法）と、相性の表から計算するので、管理画面で変えても、それに合わせて選び直される。
// 「強い」は、そのダンジョンのその属性の、道中の敵（出やすさの分だけ数える）とボス（BOSS_WEIGHT 体分として数える）に対して：
// - 武器：与えるダメージの合計がいちばん多いもの
// - 防具：受けるダメージの合計がいちばん少ないもの
// - 属性を付ける道具：付けたときに与えるダメージの合計がいちばん多いもの（同じものを2つ）
// - 呪文書：属性の矢のうちダメージの合計がいちばん多いもの、なぎ払い、癒しの3冊
// - そのほかの道具：回復薬3つ、食料3つ（道具は全部で8つ）

import { buildPlayer, enemyHitDamage, itemSlot, playerHitDamage } from './combat';
import { ITEMS, PREP_CONFIG } from './data';
import { enemyDef } from './enemies';
import { spellDamage } from './explore';
import type { DungeonFile } from './genMaster';
import type { EnemyDef, ItemId, PlayerStats, SpellId, TraitId } from './types';

const BOSS_WEIGHT = 3; // ボスは道中の敵の何体分として数えるか（最後に必ず戦うので重く見る）
const BOLTS: SpellId[] = ['fire_bolt', 'ice_bolt', 'light_lance', 'dark_bolt'];
// 敵にダメージを与える呪文（有利な呪文書を選ぶ候補）。同じ点数なら、先にあるものを選ぶ
const ATTACK_SPELLS: SpellId[] = [...BOLTS, 'sweep', 'shockwave'];

/**
 * そのダンジョンのその属性で有利に働く呪文書を count 冊選ぶ（準備を飛ばして出発するときの持ち物）。
 * 道中の敵（出やすさの分だけ数える）とボス（BOSS_WEIGHT 体分）に与えるダメージの合計が多い順。
 * 属性の相性（弱点なら2倍など）が効くので、ふつうはその属性の敵の弱点を突く矢が選ばれる。gear は持っていく装備（杖なら魔法が強くなる）
 */
export function favorableSpellbooks(trait: TraitId, dungeon: DungeonFile, gear: readonly ItemId[], count = 2): ItemId[] {
  const foes = opponents(trait, dungeon);
  const stats = buildPlayer([...gear]);
  const score = (spell: SpellId) => foes.reduce((sum, { def, weight }) => sum + spellDamage(stats, spell, def, dungeon) * weight, 0);
  return ATTACK_SPELLS.map((spell, i) => ({ spell, i, score: score(spell) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, Math.min(count, PREP_CONFIG.maxSpellbooks))
    .map(({ spell }) => `book_${spell}` as ItemId);
}

/** ダンジョンで出会う敵と、その重み */
function opponents(trait: TraitId, dungeon: DungeonFile): { def: EnemyDef; weight: number }[] {
  const { pool, boss } = dungeon.encounters[trait];
  return [...pool.map((id) => ({ def: enemyDef({ id, elite: false }), weight: 1 })), { def: enemyDef({ id: boss, elite: false }), weight: BOSS_WEIGHT }];
}

function best<T>(options: readonly T[], score: (o: T) => number): T {
  return options.reduce((a, b) => (score(b) > score(a) ? b : a));
}

export function bestLoadout(trait: TraitId, dungeon: DungeonFile): ItemId[] {
  const foes = opponents(trait, dungeon);
  const total = (f: (stats: PlayerStats, enemy: EnemyDef) => number, stats: PlayerStats) =>
    foes.reduce((sum, { def, weight }) => sum + f(stats, def) * weight, 0);
  const all = Object.keys(ITEMS) as ItemId[];
  const of = (slot: ReturnType<typeof itemSlot>) => all.filter((id) => itemSlot(ITEMS[id]) === slot);

  const weapon = best(of('weapon'), (id) => total(playerHitDamage, buildPlayer([id])));
  const armor = best(of('armor'), (id) => -total(enemyHitDamage, buildPlayer([id])));
  const enchants = all.filter((id) => ITEMS[id].effect.kind === 'enchant');
  const enchant = best(enchants, (id) => {
    const effect = ITEMS[id].effect;
    if (effect.kind !== 'enchant') return 0;
    return total(playerHitDamage, { ...buildPlayer([weapon]), enchant: { element: effect.element, hits: effect.hits } });
  });
  const bolt = best(BOLTS, (spell) => total((stats, enemy) => spellDamage(stats, spell, enemy, dungeon), buildPlayer([weapon])));

  const consumables: ItemId[] = [enchant, enchant, 'potion', 'potion', 'potion', 'food', 'food', 'food'].slice(0, PREP_CONFIG.maxItems) as ItemId[];
  const books = [`book_${bolt}`, 'book_sweep', 'book_heal'].slice(0, PREP_CONFIG.maxSpellbooks) as ItemId[];
  return [weapon, armor, ...consumables, ...books];
}
