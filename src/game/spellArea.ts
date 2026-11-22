// 向きのある呪文が届くマス（唱える処理 explore.ts の castSpell と、唱える前に床に出す範囲の両方が使う）。
// ・まっすぐ飛ぶ呪文（矢・吸命・雷の鎖・毒の霧）：壁・石の壁の手前まで、届くマス数まで。最初の敵で止まる（なぎ払いは貫く）
// ・虹の扇：奥へ1マス進むごとに左右へ1マスずつ広がる扇形（壁の向こう・石の壁のマスには届かない）
// ・石の壁：目の前と、その左右の3マス
// ・毒の霧：止まったマスを中心に、まわり9マス

import { DIR_DELTA, type Dir, type ExploreState } from './exploreTypes';
import { canSee, samePos } from './exploreSight';
import { around9, stoneAt } from './fields';
import type { SpellSettings } from './genMaster';
import { tileAt, type Pos } from './map';
import { SPELLS } from './data';
import type { SpellId } from './types';

type Where = Pick<ExploreState, 'map' | 'fields' | 'enemies' | 'player'>;

/** まっすぐ飛ぶ道すじ（主人公の隣から）。stopAtEnemy なら、最初の敵のマスで止まる */
export function aimLine(s: Where, dir: Dir, range: number, stopAtEnemy: boolean): Pos[] {
  const d = DIR_DELTA[dir];
  const path: Pos[] = [];
  for (let i = 1; i <= range; i++) {
    const p = { x: s.player.x + d.x * i, y: s.player.y + d.y * i };
    if (tileAt(s.map, p) === 'wall' || stoneAt(s.fields, p)) break;
    path.push(p);
    if (stopAtEnemy && s.enemies.some((e) => samePos(e.pos, p))) break;
  }
  return path;
}

/** 虹の扇のマス（手前の段から） */
export function fanTiles(s: Where, dir: Dir, range: number): Pos[] {
  const d = DIR_DELTA[dir];
  const side = { x: d.y, y: d.x };
  const out: Pos[] = [];
  for (let k = 1; k <= range; k++) {
    for (let w = -(k - 1); w <= k - 1; w++) {
      const p = { x: s.player.x + d.x * k + side.x * w, y: s.player.y + d.y * k + side.y * w };
      // 扇の角まで届く広さで、見通しだけを確かめる
      if (tileAt(s.map, p) !== 'wall' && !stoneAt(s.fields, p) && canSee(s.map, s.player, p, range * 1.5)) out.push(p);
    }
  }
  return out;
}

/** 石の壁を作るマスの候補（目の前と、その左右）。置けるかどうか（敵・壁）は置くときに確かめる */
export function stoneTiles(player: Pos, dir: Dir): Pos[] {
  const d = DIR_DELTA[dir];
  const front = { x: player.x + d.x, y: player.y + d.y };
  const side = { x: d.y, y: d.x };
  return [front, { x: front.x + side.x, y: front.y + side.y }, { x: front.x - side.x, y: front.y - side.y }];
}

/**
 * 唱える前に床に出す範囲。path は飛んでいく道すじ、area は効くマス（矢なら止まるマス、扇・霧・壁なら広がるマス）。
 * 向きのない呪文は null
 */
export function spellPreview(s: Where, spell: SpellId, dir: Dir, spells: SpellSettings): { path: Pos[]; area: Pos[] } | null {
  const def = SPELLS[spell];
  if (!def.aim) return null;
  const cfg = spells[spell];
  const range = cfg.range ?? 1;
  const floor = (ps: Pos[]) => ps.filter((p) => tileAt(s.map, p) !== 'wall');
  switch (def.effect.kind) {
    case 'sweep': {
      const path = aimLine(s, dir, range, false);
      return { path, area: path };
    }
    case 'fan': {
      const area = fanTiles(s, dir, range);
      return { path: [], area };
    }
    case 'stone':
      return { path: [], area: floor(stoneTiles(s.player, dir)) };
    case 'poison': {
      const path = aimLine(s, dir, range, true);
      const end = path.at(-1);
      return { path, area: end ? floor(around9(end)) : [] };
    }
    default: {
      const path = aimLine(s, dir, range, true);
      const end = path.at(-1);
      return { path, area: end ? [end] : [] };
    }
  }
}
