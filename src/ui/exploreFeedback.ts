// 探索で1手進んだときの、音・振動・3D 画面の演出。画面の状態は変えず、鳴らす・動かすだけ。

import { playAttack, playChestOpen, playEnemyAttack, playFootstep, playSpell } from '../audio/sound';
import { enemyBase } from '../game/data';
import { type ExploreState } from '../game/exploreTypes';
import { samePos } from '../game/exploreSight';
import { weaponOf, type DungeonView3D } from './explore3d';
import { HAPTICS, vibrate } from './haptics';

// 敵の攻撃の音を鳴らす間合い（秒）。afterAttack：主人公も攻撃したとき、その音のあとに鳴らすまで。gap：敵が何体も攻撃したとき、1体ずつずらす間。max：1回の行動で鳴らす数
const ENEMY_SOUND = { afterAttack: 0.2, gap: 0.12, max: 3 } as const;
const CAST_THEN_HURT_MS = 150; // 呪文の矢が当たってから、敵の攻撃を見せるまで（ミリ秒）

/**
 * prev から next へ1手進んだときの演出を始める。
 * 返す値は、呪文の矢が当たるまでのミリ秒（呪文を唱えていなければ 0）。そのあいだは次の行動を待たせる
 */
export function playFeedback(prev: ExploreState, next: ExploreState, view3d: DungeonView3D | null): number {
  // 攻撃したとき・攻撃されたときは、画面を少し拡大縮小し、ダメージの数字を出す（3D表示のみ）
  // 敵を攻撃したときは、主人公が敵の方を向いて武器を振り、武器ごとの音を鳴らす（1回の行動で1回だけ）
  // 呪文を唱えたときは、武器を振らずに呪文の演出と音にする
  // 矢が当たるまでのミリ秒。そのあいだは次の行動を待たせ、与えたダメージの数字は当たったときに出す
  let impactMs = 0;
  if (next.cast) {
    impactMs = view3d?.castSpell(next.cast, prev.player) ?? 0;
    playSpell(next.cast.spell);
  }
  const struck = next.cast ? undefined : next.hits.find((hit) => hit.kind === 'dealt');
  if (struck) {
    view3d?.heroAttack(struck.at);
    playAttack(weaponOf(next.stats.weapon));
  }
  // 敵に攻撃されたときは、敵の体質ごとの音を鳴らす。主人公の攻撃の音のあと、敵ごとに少しずつずらして鳴らす
  const attackers = next.hits.flatMap((hit) => (hit.kind === 'taken' && hit.by ? [enemyBase(hit.by)] : [])).slice(0, ENEMY_SOUND.max);
  attackers.forEach((enemy, i) => playEnemyAttack(enemy, (struck ? ENEMY_SOUND.afterAttack : 0) + (impactMs > 0 ? (impactMs + CAST_THEN_HURT_MS) / 1000 : 0) + i * ENEMY_SOUND.gap));
  for (const hit of next.hits) {
    const show = () => {
      view3d?.hitPulse(hit.kind === 'dealt' ? 'attack' : 'hurt');
      view3d?.popDamage(hit.at, hit.amount, hit.kind);
      // スマホを震わせる（振動に対応したスマホだけ）。踏破したとき・力尽きたときは、長く震わせる
      if (hit.kind === 'dealt') vibrate(next.outcome === 'cleared' ? HAPTICS.cleared : HAPTICS.attack);
      else vibrate(next.outcome === 'defeated' ? HAPTICS.defeated : HAPTICS.hurt);
    };
    // 呪文の矢のあとに敵が攻撃してきたときは、矢が当たってから見せる
    const delay = impactMs > 0 ? impactMs + (hit.kind === 'taken' ? CAST_THEN_HURT_MS : 0) : 0;
    if (delay > 0) window.setTimeout(show, delay);
    else show();
  }
  // 同じ階で1歩進んだら足音を鳴らす（階を移ったとき・その場で戦ったときは鳴らさない）
  if (next.map === prev.map && !samePos(prev.player, next.player)) playFootstep(next.trait);
  // 宝箱から金貨か道具を取ったら、宝箱の音を鳴らす（持ち物がいっぱいで何も取れなかったときは鳴らさない）
  // （敵を倒して宝箱が落ちたときや、倒して金貨を得たときは鳴らさない。主人公のいるマスの宝箱を開けたときだけ）
  const openedHere = next.chests.some((c) => c.opened && samePos(c.pos, next.player) && !prev.chests.some((p) => p.opened && samePos(p.pos, c.pos)));
  if (next.map === prev.map && openedHere && (next.gold > prev.gold || next.stats.items.length > prev.stats.items.length)) {
    playChestOpen();
  }
  return impactMs;
}
