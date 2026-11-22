// 主人公の状態のアイコンの列（探索画面のゲージの下に並べる。2026-11-23）。かかっているもの・効いているものだけを、短い字と残りの数で出す。
// 毒・鈍足（状態異常）、魔力の盾・再生（呪文）、武器に宿った属性（砥石・属性の刃）、空腹（満腹度が0）

import { STATUS_MASTER, TRAITS } from '../game/data';
import type { ExploreState } from '../game/exploreTypes';
import { STATUS_TEXTS } from '../game/statusMaster';
import type { Element } from '../game/types';

export interface StatusChip {
  id: string; // CSS の印（explore__chip--<id>）
  mark: string; // アイコンの1字
  name: string; // 読み上げと、押したときの説明の見出し
  left: string; // 残り（「5」「3歩」など。ないときは空）
  text: string; // 説明
}

const ELEMENT_MARK: Record<Element, string> = { fire: '炎', ice: '氷', neutral: '無', light: '光', dark: '闇' };

export function statusChips(state: Pick<ExploreState, 'stats' | 'ward' | 'regen' | 'satiety'>): StatusChip[] {
  const { stats } = state;
  const out: StatusChip[] = [];
  if (stats.poisonTurns > 0) out.push({ id: 'poison', mark: '毒', name: '毒', left: `${stats.poisonTurns}`, text: STATUS_TEXTS.poison(STATUS_MASTER) });
  if ((stats.chillSteps ?? 0) > 0) out.push({ id: 'chill', mark: '鈍', name: '鈍足', left: `${stats.chillSteps}歩`, text: STATUS_TEXTS.chill(STATUS_MASTER) });
  if (state.satiety <= 0) out.push({ id: 'starve', mark: '飢', name: '空腹', left: '', text: '満腹度が0。行動するたびにHPが減る（食料で治る）' });
  if (state.ward) out.push({ id: 'ward', mark: '盾', name: '魔力の盾', left: `${state.ward.turns}`, text: `敵の攻撃で受けるダメージを${state.ward.cut}%減らす` });
  if (state.regen) out.push({ id: 'regen', mark: '再', name: '再生', left: `${state.regen.turns}`, text: `1ターンにHPを${state.regen.amount}回復する` });
  if (stats.enchant) {
    const e = stats.enchant.element;
    out.push({ id: `enchant-${e}`, mark: ELEMENT_MARK[e], name: `${TRAITS[e].name}の力`, left: `${stats.enchant.hits}回`, text: `武器に${TRAITS[e].name}の力が宿っている（あと${stats.enchant.hits}回の攻撃）` });
  }
  return out;
}
