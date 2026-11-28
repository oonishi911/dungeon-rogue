// 探索で1手進んだときの、音・振動・3D 画面の演出。画面の状態は変えず、鳴らす・動かすだけ。

import { playAttack, playChestOpen, playEnemyAttack, playFootstep, playSpell, playSynth } from '../audio/sound';
import type { SynthKind } from '../audio/synth';
import { enemyBase } from '../game/data';
import { gearOf } from '../game/itemMaster';
import { type ExploreState } from '../game/exploreTypes';
import { samePos } from '../game/exploreSight';
import type { Pos } from '../game/map';
import { weaponOf, type DungeonView3D } from './explore3d';
import { FOE_FX, HIT_STOP, KILL_CHAIN } from './explore3dConfig';
import { feelSettings } from './feelSettings';
import { HAPTICS, vibrate } from './haptics';

// 敵の攻撃の音を鳴らす間合い（秒）。afterAttack：主人公も攻撃したとき、その音のあとに鳴らすまで。gap：敵が何体も攻撃したとき、1体ずつずらす間。max：1回の行動で鳴らす数
const ENEMY_SOUND = { afterAttack: 0.2, gap: 0.12, max: 3 } as const;
const CAST_THEN_HURT_MS = 150; // 呪文の矢が当たってから、敵の攻撃を見せるまで（ミリ秒）

// 連続で倒した数（間があいたらやり直し）。倒すたびに音が上がる
let chain = { count: 0, at: 0 };

/** 倒した音を鳴らす。連続で倒すと、音を上げる（「n連」の文字は出さない） */
function killFeedback() {
  const now = performance.now();
  chain = now - chain.at <= KILL_CHAIN.chainMs ? { count: chain.count + 1, at: now } : { count: 1, at: now };
  const steps = Math.min(KILL_CHAIN.maxSteps, chain.count - 1);
  playSynth('kill', 2 ** ((steps * KILL_CHAIN.stepSemitones) / 12));
}

/** この一撃の、ヒットストップの長さ（ミリ秒）。弱点・コンボ・倒したときは長め、効きにくいときは短め */
function hitStopMs(hit: { affinity?: 'weak' | 'resist'; combo?: unknown; killed?: boolean }): number {
  return Math.max(hit.affinity === 'weak' ? HIT_STOP.weak : hit.affinity === 'resist' ? HIT_STOP.resist : HIT_STOP.base, hit.combo ? HIT_STOP.combo : 0, hit.killed ? HIT_STOP.kill : 0);
}

/** 敵の状態異常・コンボ・蒸気の合成音 */
const FOE_SOUNDS: Record<string, SynthKind> = { burn: 'burn', freeze: 'freeze', smash: 'smash', sear: 'sear', arcane: 'arcane' };

/**
 * prev から next へ1手進んだときの演出を始める。
 * 返す値は、呪文の矢・杖の魔力弾が当たるまでのミリ秒（なければ 0）。そのあいだは次の行動を待たせる
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
  const foeMs = view3d?.playFoes(next.foes) ?? 0; // 遠距離の矢・杖の魔力弾が当たるまで（当たった側のダメージの数字は、そのあとに出す）
  // 凍る・燃える・砕く・焼き斬り・共鳴・蒸気の音（呪文のときは、矢が当たってから）
  for (const f of next.foes) {
    const kind = f.kind === 'foe_status' ? FOE_SOUNDS[f.status] : f.kind === 'combo' ? FOE_SOUNDS[f.combo] : f.kind === 'steam' ? 'steam' : undefined;
    if (kind) playSynth(kind, 1, impactMs / 1000);
  }
  // 持ち替えた
  if (next.map === prev.map && prev.stats.weapon !== next.stats.weapon && next.stats.sub) playSynth('swap');
  const skill = next.foes.find((f) => f.kind === 'skill'); // 武器の固有技を出したとき
  const struck = next.cast ? undefined : next.hits.find((hit) => hit.kind === 'dealt' && !hit.slip);
  if (struck) {
    // 通常攻撃には、武器の段階に合わせた残光をつける（固有技のときは、固有技の演出があるのでつけない）
    view3d?.heroAttack(struck.at, skill ? undefined : { weapon: weaponOf(next.stats.weapon), tier: next.stats.weapon ? (gearOf(next.stats.weapon)?.tier ?? 1) : 1 });
    playAttack(weaponOf(next.stats.weapon));
    // 剣の連斬りは、2回目の斬撃のときも武器を振る
    if (skill?.kind === 'skill' && skill.weapon === 'sword') {
      window.setTimeout(() => {
        view3d?.heroAttack(struck.at);
        playAttack('sword');
      }, FOE_FX.skill.slash.stagger);
    }
  }
  // 敵に攻撃されたときは、敵の体質ごとの音を鳴らす。主人公の攻撃の音のあと、敵ごとに少しずつずらして鳴らす
  const attackers = next.hits.flatMap((hit) => (hit.kind === 'taken' && hit.by ? [{ enemy: enemyBase(hit.by), late: hit.ranged ? foeMs / 1000 : 0 }] : [])).slice(0, ENEMY_SOUND.max);
  attackers.forEach(({ enemy, late }, i) => playEnemyAttack(enemy, (struck ? ENEMY_SOUND.afterAttack : 0) + (impactMs > 0 ? (impactMs + CAST_THEN_HURT_MS) / 1000 : 0) + late + i * ENEMY_SOUND.gap));
  const shown: Pos[] = []; // 同じマスに続けて数字を出すとき（連斬りの2回目）は、少しずらす
  for (const hit of next.hits) {
    const again = hit.kind === 'dealt' && !hit.slip ? shown.filter((p) => samePos(p, hit.at)).length : 0;
    if (hit.kind === 'dealt' && !hit.slip) shown.push(hit.at);
    const show = () => {
      // 出血のダメージは、数字だけを出す（武器を振る・画面を拡大する・振動はしない）
      if (hit.slip) {
        view3d?.popDamage(hit.at, hit.amount, hit.kind);
        if (hit.kind === 'dealt' && hit.killed) killFeedback(); // 出血・燃焼で倒したときも、倒した音
        return;
      }
      view3d?.hitPulse(hit.kind === 'dealt' ? 'attack' : 'hurt');
      // 攻撃してきた敵は、主人公の方へ飛びかかる（離れて撃ってきた敵は飛びかからない）
      if (hit.kind === 'taken' && hit.by && !hit.ranged) view3d?.enemyAttack(hit.by);
      view3d?.popDamage(hit.at, hit.amount, hit.kind, hit.kind === 'dealt' ? { blocked: hit.blocked === true, ...(hit.affinity ? { affinity: hit.affinity } : {}), ...(hit.combo ? { combo: hit.combo } : {}), killed: hit.killed === true } : {});
      // 当てた一瞬、画面を止める（ヒットストップ）。倒したときは、倒した音も鳴らす
      if (hit.kind === 'dealt') {
        view3d?.hitStop(hitStopMs(hit));
        if (hit.killed) killFeedback();
      }
      // スマホを震わせる（振動に対応したスマホだけ）。踏破したとき・力尽きたときは、長く震わせる
      if (hit.kind === 'dealt') vibrate(next.outcome === 'cleared' ? HAPTICS.cleared : HAPTICS.attack);
      else vibrate(next.outcome === 'defeated' ? HAPTICS.defeated : HAPTICS.hurt);
    };
    // 呪文の矢のあとに敵が攻撃してきたときは、矢が当たってから見せる
    const delay =
      Math.max(impactMs > 0 ? impactMs + (hit.kind === 'taken' ? CAST_THEN_HURT_MS : 0) : 0, hit.kind === 'taken' && hit.ranged ? foeMs : 0, hit.kind === 'dealt' && skill?.kind === 'skill' && skill.weapon === 'staff' ? foeMs : 0) +
      again * FOE_FX.skill.slash.stagger;
    if (delay > 0) window.setTimeout(show, delay);
    else show();
  }
  // 階段を降りた（別の階へ移った）ときは、階段の音。踏破・力尽きたときは、その音（設定で切れる）
  if (next.outcome === 'ongoing' && next.map !== prev.map && next.floor > prev.floor && feelSettings().stairsFx) playSynth('stairs');
  if (prev.outcome === 'ongoing' && next.outcome !== 'ongoing' && feelSettings().endFx) playSynth(next.outcome === 'cleared' ? 'clear' : 'defeat', 1, 0.25);
  // 同じ階で1歩進んだら足音を鳴らす（階を移ったとき・その場で戦ったときは鳴らさない）
  if (next.map === prev.map && !samePos(prev.player, next.player)) playFootstep(next.trait);
  // 主人公のいるマスの宝箱から金貨か道具を取ったら、宝箱の音を鳴らす（持ち物がいっぱいで何も取れなかったときは鳴らさない。
  // 道具が残って宝箱が閉じたままでも、金貨を取れば鳴らす。敵を倒して宝箱が落ちたときや、倒して金貨を得たときは鳴らさない）
  const before = prev.chests.find((c) => samePos(c.pos, next.player));
  const after = next.chests.find((c) => samePos(c.pos, next.player));
  const tookFromChest = before && after && (after.gold < before.gold || (before.item !== null && after.item === null));
  if (next.map === prev.map && tookFromChest && (next.gold > prev.gold || next.stats.items.length > prev.stats.items.length)) {
    playChestOpen();
  }
  return Math.max(impactMs, skill?.kind === 'skill' && skill.weapon === 'staff' ? foeMs : 0); // 杖の魔力弾も、当たるまで次の行動を待たせる
}
