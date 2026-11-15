// 管理画面の、呪文ごとの項目の説明（例つき）。項目の名前と範囲は genMaster.ts の SPELL_FIELDS
import type { SpellId } from './types';

const BASE: Record<string, string> = {
  cost: '唱えるときに使う魔力です。例：3なら、魔力が3減ります（魔力が2しかないと唱えられません）。',
  power: '魔法の強さにかける倍率です。ダメージ＝（魔法の強さ＋武器の魔力）×これ（敵の防御は無視）。例：魔法の強さが8で1.5なら、ダメージは12（魔力2の武器を持てば、（8＋2）×1.5＝15）。',
  range: '矢や衝撃が届くマス数です。例：5なら、5マス先の敵まで届きます。',
  push: '敵を吹き飛ばすマス数です。例：2なら、2マス後ろへ飛びます（壁や別の敵にぶつかると止まります）。',
  crash: '吹き飛ばされた敵が、壁や別の敵にぶつかったときに受ける追加ダメージです。例：5なら、ぶつかったときにさらに5ダメージ。',
  stun: '当たった敵が動けなくなるターン数です。例：2なら、2ターン動けません。',
  splash: '連矢が、当たった敵のまわりの8マスにいる敵に与えるダメージの割合です（真ん中の敵へのダメージに対して）。例：0.5で、真ん中の敵に10与えるなら、まわりの敵には5。',
  bleedTurns: '出血が続くターン数です。例：3なら、3ターンのあいだ出血します。',
  bleedRate: '1ターンの出血ダメージの割合です（なぎ払いのダメージに対して）。例：0.2で、なぎ払いが10ダメージなら、出血は1ターンに2ダメージ。',
  turns: '続くターン数です。例：10なら、10ターン続きます。',
};

/** 呪文の項目（key）の説明。amount は呪文によって意味が違う */
export function spellHint(spell: SpellId, key: string): string {
  if (key === 'amount') {
    return spell === 'heal'
      ? '1回で回復するHPです。例：20なら、HPが20回復します。'
      : '1ターンに回復するHPです。例：2で、続くターン数が10なら、合わせて20回復します。';
  }
  return BASE[key] ?? '';
}

/** 「呪文ごとの設定」の上に、1回だけ出す説明の一覧（項目の名前と説明）。呪文ごとに同じ説明を並べると長くなるので、まとめる */
export const SPELL_HINT_LIST: { label: string; text: string }[] = [
  { label: '使う魔力', text: BASE.cost! },
  { label: 'ダメージの倍率', text: BASE.power! },
  { label: '届くマス数', text: BASE.range! },
  { label: '吹き飛ばすマス数', text: BASE.push! },
  { label: 'ぶつかったときの追加ダメージ', text: BASE.crash! },
  { label: '動けなくするターン数', text: BASE.stun! },
  { label: 'まわりの敵へのダメージの割合', text: BASE.splash! },
  { label: '出血が続くターン数・1ターンの出血ダメージの割合', text: `${BASE.bleedTurns!} ${BASE.bleedRate!}` },
  { label: '回復するHP（癒し）', text: spellHint('heal', 'amount') },
  { label: '1ターンに回復するHP・続くターン数（再生）', text: `${spellHint('regen', 'amount')} ${BASE.turns!}` },
];
