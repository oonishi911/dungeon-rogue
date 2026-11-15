// 敵の行動の個性（types.ts の EnemyBehavior）の判定：遠距離・突進・盾持ち・召喚。
// マップと位置だけで決まる計算で、状態は変えない。ダメージや記録など、状態を変える部分は explore.ts の enemiesTurn にある。
//
// - 遠距離（ranged）：主人公とまっすぐ（縦か横）で、間に壁も敵もなく、2〜4マス離れていれば撃つ。隣り合うと、撃てる位置へ1歩下がる
// - 突進（charger）：まっすぐ2〜3マス離れていると構える。次のターンに、その向きへ最大5マス走る（主人公が動いていても、同じ向きへ走る）。
//   主人公に当たればダメージ、避けられて壁にぶつかれば、自分が動けなくなる
// - 盾持ち（shield）：最後に歩いた向き（facing）の正面にいる相手からの武器の攻撃を、大きく防ぐ。側面・背中、呪文には効かない
// - 召喚（summoner）：主人公が見えているあいだ、一定のターンごとに、近くのあいている床に、道中でいちばん弱い敵を呼ぶ

import { enemyBase } from './data';
import { ENEMY_CONFIG as C, key, type MapEnemy } from './enemies';
import { DIR_DELTA, type Dir } from './exploreTypes';
import { tileAt, type FloorMap, type Pos } from './map';
import type { EnemyId } from './types';

const DIRS: readonly Dir[] = ['up', 'down', 'left', 'right'];

/** 隣り合う2マスの向き（隣り合っていなければ null） */
export function stepDir(from: Pos, to: Pos): Dir | null {
  return DIRS.find((d) => DIR_DELTA[d].x === to.x - from.x && DIR_DELTA[d].y === to.y - from.y) ?? null;
}

/**
 * from から to まで、まっすぐ（縦か横）で、間のマスがすべて床で、敵（occupied）もいなければ、その向きと距離。
 * 斜め・同じマス・さえぎられているときは null（両端のマスは調べない）
 */
export function straightLine(map: FloorMap, from: Pos, to: Pos, occupied: ReadonlySet<string>): { dir: Dir; dist: number } | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if ((dx !== 0) === (dy !== 0)) return null;
  const dir: Dir = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
  const dist = Math.abs(dx) + Math.abs(dy);
  const d = DIR_DELTA[dir];
  for (let i = 1; i < dist; i++) {
    const p = { x: from.x + d.x * i, y: from.y + d.y * i };
    if (tileAt(map, p) === 'wall' || occupied.has(key(p))) return null;
  }
  return { dir, dist };
}

/** 盾持ちの敵が、from（攻撃する側のいるマス）からの攻撃を正面で受けるか（向きは、最後に歩いた向き。ない敵は下向き） */
export function guardsAgainst(enemy: Pick<MapEnemy, 'pos' | 'facing'>, from: Pos): boolean {
  const f = DIR_DELTA[enemy.facing ?? 'down'];
  return (from.x - enemy.pos.x) * f.x + (from.y - enemy.pos.y) * f.y > 0;
}

/**
 * 突進の走る道のり。from から dir の向きへ最大 C.chargeRun マス進み、主人公・壁・ほかの敵の手前で止まる。
 * hit：主人公に当たった（主人公の手前で止まる）、wall：壁にぶつかって止まった
 */
export function chargeRun(map: FloorMap, from: Pos, dir: Dir, player: Pos, occupied: ReadonlySet<string>): { to: Pos; hit: boolean; wall: boolean } {
  const d = DIR_DELTA[dir];
  let pos = from;
  for (let i = 0; i < C.chargeRun; i++) {
    const next = { x: pos.x + d.x, y: pos.y + d.y };
    if (next.x === player.x && next.y === player.y) return { to: pos, hit: true, wall: false };
    if (tileAt(map, next) === 'wall') return { to: pos, hit: false, wall: true };
    if (occupied.has(key(next))) return { to: pos, hit: false, wall: false };
    pos = next;
  }
  return { to: pos, hit: false, wall: false };
}

/**
 * 隣り合った遠距離の敵が下がる先：縦横の隣のうち、あいていて、主人公から2マス以上（縦横斜めのどれでも）離れるマス。
 * 次のターンに撃てるよう、主人公と縦か横にそろうマス、そして遠くなるマスを選ぶ。なければ null（下がれない）
 */
export function retreatStep(map: FloorMap, from: Pos, player: Pos, occupied: ReadonlySet<string>): Pos | null {
  let best: { pos: Pos; score: number } | null = null;
  for (const dir of DIRS) {
    const p = { x: from.x + DIR_DELTA[dir].x, y: from.y + DIR_DELTA[dir].y };
    if (tileAt(map, p) === 'wall' || occupied.has(key(p)) || (p.x === player.x && p.y === player.y)) continue;
    if (Math.max(Math.abs(p.x - player.x), Math.abs(p.y - player.y)) < 2) continue;
    const aligned = p.x === player.x || p.y === player.y;
    const score = (aligned ? 10 : 0) + Math.abs(p.x - player.x) + Math.abs(p.y - player.y);
    if (!best || score > best.score) best = { pos: p, score };
  }
  return best?.pos ?? null;
}

/** 召喚した敵を置くマス：縦横の隣のうち、あいている床（なければ null） */
export function minionTile(map: FloorMap, from: Pos, player: Pos, occupied: ReadonlySet<string>): Pos | null {
  for (const dir of DIRS) {
    const p = { x: from.x + DIR_DELTA[dir].x, y: from.y + DIR_DELTA[dir].y };
    if (tileAt(map, p) === 'floor' && !occupied.has(key(p)) && !(p.x === player.x && p.y === player.y)) return p;
  }
  return null;
}

/** 道中の敵（pool）のうち、いちばん弱い敵（HP × 攻撃が最小。同じなら先に出てくる方）。召喚で呼ぶ敵 */
export function weakestOf(pool: readonly EnemyId[]): EnemyId {
  return pool.reduce((a, b) => {
    const [x, y] = [enemyBase(a), enemyBase(b)];
    return y.hp * y.atk < x.hp * x.atk ? b : a;
  });
}
