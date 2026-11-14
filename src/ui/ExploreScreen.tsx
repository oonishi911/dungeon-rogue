// ダンジョンの探索画面。マップを歩き、敵と戦い、道具を使う。
// ゲーム本体では準備フェーズの持ち物で始まり、開発用には ?view=explore で単独でも開ける。
//
// 操作はすべて「意図」として記録し、毎フレームの処理で、前の1歩の動きが終わっていれば1つ実行する。
// キーを押し続けたときの歩く速さが、OS のキーリピートの設定に左右されず一定になる。

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { playAttack, playChestOpen, playEnemyAttack, playSpell, playFootstep, preloadSounds, setAmbient } from '../audio/sound';
import { BODY_NAMES, enemyBase, expToNext, ITEMS, SPELLS, TRAIT_IDS, TRAITS } from '../game/data';
import { bestLoadout } from '../game/bestLoadout';
import { DEFAULT_DUNGEON_ID, dungeonOf, hasDungeon } from '../game/dungeons';
import { enemyDef, key } from '../game/enemies';
import {
  DIR_DELTA,
  dungeonOfState,
  EXPLORE_CONFIG,
  isBossFloor,
  samePos,
  startExplore,
  step,
  upStairs,
  visibleTiles,
  type Dir,
  type ExploreAction,
  type ExploreState,
} from '../game/explore';
import { tileAt, type Pos } from '../game/map';
import { ItemIcon, ItemLabel, SpellIcon } from './ItemIcon';
import { SoundButton } from './SoundButton';
import { walkPath, walkToward } from '../game/path';
import type { ItemId, SpellId, TraitId } from '../game/types';
import { drawMinimap, ENEMY_MARK, MINI_CELL, motionOf, readColors, type Frame, type Motion } from './exploreRender';
import { DungeonView3D, weaponOf } from './explore3d';
import { HAPTICS, vibrate } from './haptics';
import { chooseDirection, knobOffset, STICK, stickDirections } from './stick';

// ミニマップの元の大きさ（px）がこれ以下なら、拡大してもぼかさずドットのまま見せる。
// これより大きい（広いマップ）と縮めて表示するので、ドットのままだと細い通路が消えてしまう
const MINI_SHARP_MAX = 96;

// 1マス動くのにかける時間。なぞり続けたとき・タップで歩くときの速さもこれで決まる（1秒に約2.6マス。以前の270ミリ秒から、速さを3割落とした）
const STEP_MS = 385;
const DOUBLE_TAP_MS = 350; // この時間（ミリ秒）以内に主人公を2回タップすると、ダブルタップとしてその場で待つ
// 敵の攻撃の音を鳴らす間合い（秒）。afterAttack：主人公も攻撃したとき、その音のあとに鳴らすまで。gap：敵が何体も攻撃したとき、1体ずつずらす間。max：1回の行動で鳴らす数
const ENEMY_SOUND = { afterAttack: 0.2, gap: 0.12, max: 3 } as const;
const CAST_THEN_HURT_MS = 150; // 呪文の矢が当たってから、敵の攻撃を見せるまで（ミリ秒）
const QUEUE_MAX = 2; // 動いている途中に押した操作を、いくつまで覚えておくか（多すぎると指を止めても歩き続ける）

const KEY_DIRS: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};

// 呪文は z・x・c キーで唱える（持ってきた順）
const SPELL_KEYS = ['z', 'x', 'c'] as const;

const KEY_ACTIONS: Record<string, ExploreAction> = {
  ' ': { kind: 'wait' },
  '.': { kind: 'wait' },
};

const newSeed = () => Math.floor(Math.random() * 2 ** 31);
// ?seed=123 で同じ階層を再現できる（不具合の再現や見た目の確認用）
const urlSeed = Number(new URLSearchParams(location.search).get('seed'));
// ?best=1 で、ダンジョンの特性に合わせた、いちばん強い装備・道具・呪文書で始める
const urlBest = new URLSearchParams(location.search).get('best') === '1';
// ?trait=fire でダンジョン特性を指定できる（タイル素材の確認用）
const traitParam = new URLSearchParams(location.search).get('trait');
const urlTrait = TRAIT_IDS.find((t) => t === traitParam);
// ?dungeon=standard で、遊ぶダンジョン（src/game/dungeons/ の設定ファイルの名前）を指定できる
const dungeonParam = new URLSearchParams(location.search).get('dungeon') ?? DEFAULT_DUNGEON_ID;
const urlDungeon = hasDungeon(dungeonParam) ? dungeonParam : DEFAULT_DUNGEON_ID;

/** タップ・クリックで向かっている先 */
interface WalkGoal {
  pos: Pos;
  enemy: number | null; // 敵をタップしたときはその敵（動いても追いかける）
  seenEnemies: Set<number>; // 前の1歩のときに見えていた敵。新しく敵が見えたら立ち止まる
}

/** タップで歩くときに、できるだけ通らないマス。階段は踏むと階を移ってしまうので、行き先でなければ避ける */
function avoidOnWalk(state: ExploreState): Set<string> {
  const up = upStairs(state);
  return new Set([state.map.stairs, up].filter((p): p is Pos => p !== null).map(key));
}

/** 今見えている敵の番号 */
function visibleEnemyIds(state: ExploreState): Set<number> {
  const visible = visibleTiles(state.map, state.player, EXPLORE_CONFIG.sightRadius);
  return new Set(state.enemies.filter((e) => visible.has(e.pos.y * state.map.width + e.pos.x)).map((e) => e.uid));
}

// 開発用画面で持たせる装備と道具
const DEV_LOADOUT: ItemId[] = ['sword', 'plate', 'potion', 'potion', 'food', 'fire_whetstone', 'ice_whetstone', 'book_shockwave', 'book_fire_bolt', 'book_heal'];

/**
 * 開発用：準備フェーズを通さずに探索だけを試す。?seed=・?trait=・?dungeon= で条件を指定できる。
 * ?best=1 なら、そのダンジョンの特性に合わせて、いちばん強い装備・道具・呪文書で始める（bestLoadout.ts）
 */
export function ExploreDevScreen() {
  return (
    <ExploreScreen
      devBest={urlBest}
      start={() => {
        const seed = Number.isInteger(urlSeed) && urlSeed > 0 ? urlSeed : newSeed();
        const dungeon = urlDungeon;
        if (!urlBest) return startExplore(seed, { dungeon, loadout: DEV_LOADOUT, trait: urlTrait });
        // 特性を決めてから、その特性に合う装備で始め直す（同じシードなら同じダンジョン）
        const trait = urlTrait ?? startExplore(seed, { dungeon }).trait;
        return startExplore(seed, { dungeon, loadout: bestLoadout(trait, dungeonOf(dungeon)), trait });
      }}
    />
  );
}

/** 開発用画面の「いちばん強い装備で試す」の切り替え先（今のダンジョンの特性のまま、装備だけを切り替える） */
function devBestHref(best: boolean, trait: TraitId): string {
  const params = new URLSearchParams(location.search);
  if (best) params.set('best', '1');
  else params.delete('best');
  params.set('trait', trait);
  return `?${params.toString()}`;
}

interface ExploreScreenProps {
  start: () => ExploreState;
  run?: number; // 何回目の挑戦か。省略すると開発用の表示になる
  onFinish?: (state: ExploreState) => void; // 省略すると、終わったあと同じ条件でやり直せる
  onProgress?: (state: ExploreState) => void; // 始まったときと、行動するたびに呼ぶ（途中の状態を保存するため）
  guardBack?: boolean; // ブラウザの「戻る」を一度受け止めて、ページを離れるかを確かめる
  devBest?: boolean; // 開発用画面で、いちばん強い装備で試しているか（切り替えのリンクを出す）
}

const BACK_GUARD_REARM_MS = 600;

/** ブラウザの「戻る」を受け止めるための見張りを、履歴に1つ積む（もう積んであれば何もしない） */
function armBackGuard() {
  const state: unknown = history.state;
  const armed = typeof state === 'object' && state !== null && (state as { backGuard?: boolean }).backGuard === true;
  if (!armed) history.pushState({ backGuard: true }, '');
}

/** WebGL2 が使えるか。Three.js の3D表示に必要 */
function webglAvailable(): boolean {
  try {
    return document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

export function ExploreScreen({ start, run: runNumber, onFinish, onProgress, guardBack = false, devBest }: ExploreScreenProps) {
  // 3D表示ができない環境（WebGL2 が使えない、3D表示を作れなかった）では、遊べないことを伝える
  const [no3d, setNo3d] = useState(() => !webglAvailable());
  const [state, setState] = useState<ExploreState>(start);
  // スマホで、装備・敵・記録をまとめた画面を開いているか（PCでは常に横に出ている）
  const [infoOpen, setInfoOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mpShake, setMpShake] = useState(0); // 魔力が足りずに唱えられなかった回数（魔力のゲージを震わせる）
  // ブラウザの「戻る」が押されて、ページを離れるかを確かめているところ
  const [leaving, setLeaving] = useState(false);
  // リタイアするかを確かめているところ
  const [retiring, setRetiring] = useState(false);
  const retiringRef = useRef(retiring);
  retiringRef.current = retiring;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const viewRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);

  // 毎フレームの処理と入力の処理は、React の再描画を待たずに最新の値を使えるよう ref に持つ
  const stateRef = useRef(state);
  const motionRef = useRef<{ from: Motion; start: number }>({ from: motionOf(state), start: 0 });
  const heldRef = useRef<Dir[]>([]); // 押し続けている方向（あとから押したものが優先）
  const queueRef = useRef<ExploreAction[]>([]); // 次に1回ずつ行う行動（動いている途中に押した分）
  const busyUntilRef = useRef(0); // 呪文の矢が飛んでいるあいだは、次の行動を待たせる（当たるまで）
  const walkRef = useRef<WalkGoal | null>(null); // タップ・クリックで向かっている先
  // 仮想スティックで進みたい向きの候補（斜めなら上下・左右の2つ）。1歩ごとに、進める向きを選び直す
  const stickRef = useRef<Dir[] | null>(null);
  const view3dRef = useRef<DungeonView3D | null>(null);

  const visible = useMemo(
    () => visibleTiles(state.map, state.player, EXPLORE_CONFIG.sightRadius),
    [state.map, state.player],
  );

  // 同じ道具はまとめて「回復薬 ×2」のように表示する
  const itemGroups = useMemo(() => {
    const groups: { id: ItemId; count: number }[] = [];
    for (const id of state.stats.items) {
      const g = groups.find((x) => x.id === id);
      if (g) g.count++;
      else groups.push({ id, count: 1 });
    }
    return groups;
  }, [state.stats.items]);
  const itemGroupsRef = useRef(itemGroups);
  itemGroupsRef.current = itemGroups;
  // 主人公が向いている方向（最後に歩こうとした向き）。向きのある呪文（なぎ払い・矢）は、この向きに唱える。
  // 壁にぶつかって歩けなかったときも、その向きを向く（呪文を撃つ向きを変えるため）
  const facingRef = useRef<Dir>('down');

  /** 行動を1つ行い、前の位置から新しい位置への動きを始める。行動にならなければ false */
  const perform = useCallback((action: ExploreAction): boolean => {
    const prev = stateRef.current;
    if (action.kind === 'move') {
      facingRef.current = action.dir;
      view3dRef.current?.face(action.dir);
    }
    // 向きのある呪文は、主人公が向いている方向に唱える
    if (action.kind === 'cast' && SPELLS[action.spell].aim && !action.dir) action = { ...action, dir: facingRef.current };
    const result = step(prev, action);
    if (!result.ok) {
      // 壁にぶつかったときは知らせない（なぞって歩いていると何度もぶつかるので、うるさいだけ）
      const bumped =
        action.kind === 'move' &&
        tileAt(prev.map, { x: prev.player.x + DIR_DELTA[action.dir].x, y: prev.player.y + DIR_DELTA[action.dir].y }) === 'wall';
      if (!bumped) setError(result.error);
      if (action.kind === 'cast' && result.error === '魔力が足りない') setMpShake((n) => n + 1);
      return false;
    }
    const next = result.value;
    // 攻撃したとき・攻撃されたときは、画面を少し拡大縮小し、ダメージの数字を出す（3D表示のみ）
    // 敵を攻撃したときは、主人公が敵の方を向いて武器を振り、武器ごとの音を鳴らす（1回の行動で1回だけ）
    // 呪文を唱えたときは、武器を振らずに呪文の演出と音にする
    // 矢が当たるまでのミリ秒。そのあいだは次の行動を待たせ、与えたダメージの数字は当たったときに出す
    let impactMs = 0;
    if (next.cast) {
      impactMs = view3dRef.current?.castSpell(next.cast, prev.player) ?? 0;
      busyUntilRef.current = performance.now() + impactMs;
      playSpell(next.cast.spell);
    }
    const struck = next.cast ? undefined : next.hits.find((hit) => hit.kind === 'dealt');
    if (struck) {
      view3dRef.current?.heroAttack(struck.at);
      playAttack(weaponOf(next.stats.weapon));
    }
    // 敵に攻撃されたときは、敵の体質ごとの音を鳴らす。主人公の攻撃の音のあと、敵ごとに少しずつずらして鳴らす
    const attackers = next.hits.flatMap((hit) => (hit.kind === 'taken' && hit.by ? [enemyBase(hit.by)] : [])).slice(0, ENEMY_SOUND.max);
    attackers.forEach((enemy, i) => playEnemyAttack(enemy, (struck ? ENEMY_SOUND.afterAttack : 0) + (impactMs > 0 ? (impactMs + CAST_THEN_HURT_MS) / 1000 : 0) + i * ENEMY_SOUND.gap));
    for (const hit of next.hits) {
      const show = () => {
        view3dRef.current?.hitPulse(hit.kind === 'dealt' ? 'attack' : 'hurt');
        view3dRef.current?.popDamage(hit.at, hit.amount, hit.kind);
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
    // 階を移ったときは動かさずに切り替える
    motionRef.current = { from: motionOf(next.map === prev.map ? prev : next), start: performance.now() };
    stateRef.current = next;
    setError(null);
    setState(next);
    onProgressRef.current?.(next);
    // 階段を踏んだら、そのまま次の階へ降りる・上の階へ戻る（踏む動きを見せてから移るよう、次の行動として予約する）
    if (action.kind === 'move' && next.map === prev.map && next.outcome === 'ongoing' && !samePos(prev.player, next.player)) {
      const up = upStairs(next);
      const onDown = next.map.stairs !== null && samePos(next.player, next.map.stairs);
      const onUp = up !== null && samePos(next.player, up);
      if (onDown || onUp) {
        walkRef.current = null;
        queueRef.current = [{ kind: onDown ? 'descend' : 'ascend' }];
      }
    }
    return true;
  }, []);

  /** 次に1回だけ行う行動を予約する。歩いている途中なら止まる */
  const request = useCallback((action: ExploreAction) => {
    walkRef.current = null;
    if (queueRef.current.length < QUEUE_MAX) queueRef.current = [...queueRef.current, action];
  }, []);

  /** 呪文を唱える。向きのある呪文（なぎ払い・矢）は、唱えるときに主人公が向いている方向へ飛ぶ（perform で向きを入れる） */
  const chooseSpell = useCallback(
    (spell: SpellId) => {
      request({ kind: 'cast', spell });
    },
    [request],
  );
  const chooseSpellRef = useRef(chooseSpell);
  chooseSpellRef.current = chooseSpell;

  const hold = useCallback((dir: Dir) => {
    walkRef.current = null;
    if (heldRef.current.includes(dir)) return;
    heldRef.current = [...heldRef.current, dir];
    // 押してすぐ離しても1歩は進むように、1歩分を予約しておく
    request({ kind: 'move', dir });
  }, [request]);

  const release = useCallback((dir: Dir) => {
    heldRef.current = heldRef.current.filter((d) => d !== dir);
  }, []);

  /** タップ・クリックで向かっている先へ1歩進む。着いた・進めない・攻撃した・新しく敵が見えたら止まる */
  const walkStep = useCallback(
    (goal: WalkGoal) => {
      const s = stateRef.current;
      if (goal.enemy !== null) {
        // 敵を目指しているときは、その敵が今いる場所へ向かう。見えなくなったら止まる
        const foe = s.enemies.find((e) => e.uid === goal.enemy);
        if (!foe || !visibleEnemyIds(s).has(foe.uid)) {
          walkRef.current = null;
          return;
        }
        goal.pos = foe.pos;
      }
      const before = s.player;
      const action = walkToward(s, goal.pos, avoidOnWalk(s));
      // 着いた・進めない・敵を攻撃した（その場から動かなかった）ときは止まる
      if (!action || !perform(action) || samePos(before, stateRef.current.player)) {
        walkRef.current = null;
        return;
      }
      // 勝手に敵に近づかないよう、新しく敵が見えたら立ち止まる（敵を目指して歩いているときは除く）
      const now = visibleEnemyIds(stateRef.current);
      if (goal.enemy === null && [...now].some((uid) => !goal.seenEnemies.has(uid))) {
        walkRef.current = null;
        setError('敵が見えたので立ち止まった');
        return;
      }
      goal.seenEnemies = now;
    },
    [perform],
  );

  // 毎フレーム：前の動きが終わっていれば次の行動を1つ行い、画面を描く
  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canvas = viewRef.current;
    if (no3d || !canvas) return;
    let view3d: DungeonView3D;
    try {
      view3d = new DungeonView3D(canvas);
    } catch {
      setNo3d(true);
      return;
    }
    view3dRef.current = view3d;
    // 3D表示は、Canvas の画面上の大きさに合わせて描く（スマホの縦長の画面でも引き伸ばさない）
    const observer = new ResizeObserver(() => view3d.resize(canvas.clientWidth, canvas.clientHeight));
    observer.observe(canvas);
    view3d.resize(canvas.clientWidth, canvas.clientHeight);
    // 視界の計算は、状態が変わったときだけやり直す
    let sight = { state: stateRef.current, visible: visibleTiles(stateRef.current.map, stateRef.current.player, EXPLORE_CONFIG.sightRadius) };
    // 歩く道筋は、状態か行き先が変わったときだけ探し直す
    let route: { state: ExploreState | null; goal: Pos | null; path: Pos[] } = { state: null, goal: null, path: [] };
    const routeFor = (st: ExploreState, goal: Pos | null): Pos[] => {
      if (!goal) return [];
      if (route.state !== st || !route.goal || !samePos(route.goal, goal)) {
        route = { state: st, goal, path: walkPath(st, goal, avoidOnWalk(st)) ?? [] };
      }
      return route.path;
    };
    let frameId = 0;
    const tick = (now: number) => {
      if (now - motionRef.current.start >= STEP_MS && now >= busyUntilRef.current && stateRef.current.outcome === 'ongoing') {
        const held = heldRef.current.at(-1);
        const [queued, ...rest] = queueRef.current;
        if (queued) {
          queueRef.current = rest;
          perform(queued);
        } else if (held) {
          perform({ kind: 'move', dir: held });
        } else if (stickRef.current) {
          // 斜めに倒しているときは、指の向きに近い方へ進み、そちらが壁ならもう一方へ進む
          const s = stateRef.current;
          const dir = chooseDirection(stickRef.current, (d) => {
            const to = { x: s.player.x + DIR_DELTA[d].x, y: s.player.y + DIR_DELTA[d].y };
            return tileAt(s.map, to) !== 'wall';
          });
          perform({ kind: 'move', dir });
        } else if (walkRef.current) {
          walkStep(walkRef.current);
        }
      }
      const current = stateRef.current;
      if (sight.state !== current) {
        sight = { state: current, visible: visibleTiles(current.map, current.player, EXPLORE_CONFIG.sightRadius) };
      }
      const frame: Frame = {
        state: current,
        visible: sight.visible,
        from: motionRef.current.from,
        progress: reduceMotion ? 1 : Math.min(1, (now - motionRef.current.start) / STEP_MS),
        walkTarget: walkRef.current?.pos ?? null,
        walkPath: routeFor(current, walkRef.current?.pos ?? null),
      };
      view3d.render(frame);
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      view3d.dispose();
      view3dRef.current = null;
    };
  }, [perform, walkStep, no3d]);

  // このダンジョンの足音を、最初の一歩から鳴るように読み込んでおく
  useEffect(() => preloadSounds(state.trait), [state.trait]);

  // 始まった時点の状態も知らせる（1歩も動かずに閉じても、同じ探索の続きから始まるように）
  useEffect(() => onProgressRef.current?.(stateRef.current), []);

  // ブラウザの「戻る」を一度受け止める：履歴に「見張り」を1つ積んでおき、戻るで見張りが外れたら、ページを離れるかを確かめる。
  // 完全には防げない（iPhone の端からのスワイプや、戻るの連打は止められない。画面に一度も触れていないと、ブラウザが見張りを無視することもある）。
  // 途中の状態は保存してあるので、離れてしまっても続きから遊べる
  useEffect(() => {
    if (!guardBack) return;
    armBackGuard();
    const onPop = () => setLeaving(true);
    window.addEventListener('popstate', onPop);
    window.addEventListener('pageshow', armBackGuard); // 離れたあと、進むで戻ってきたときに張り直す
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('pageshow', armBackGuard);
    };
  }, [guardBack]);
  const stay = () => {
    armBackGuard();
    setLeaving(false);
  };
  const leave = () => {
    setLeaving(false);
    history.back();
    // 戻る先がなくてページに残ったときは、見張りを張り直す
    window.setTimeout(armBackGuard, BACK_GUARD_REARM_MS);
  };

  // ダンジョンにいるあいだ、特性の環境音を流す（探索画面を離れたら止める）
  useEffect(() => {
    setAmbient(state.trait);
    return () => setAmbient(null);
  }, [state.trait]);

  useEffect(() => {
    if (miniRef.current) drawMinimap(miniRef.current, state, readColors());
  }, [state]);

  // キーボード：方向キーは押している間ずっと歩く。そのほかのキーは押した回数だけ行う
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      // リタイアを確かめているあいだは、キーで動かない（Esc で探索に戻る）
      if (retiringRef.current) {
        if (e.key === 'Escape') setRetiring(false);
        return;
      }
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const dir = KEY_DIRS[key];
      if (dir) {
        e.preventDefault(); // 矢印キーでページがスクロールしないように
        if (!e.repeat) hold(dir);
        return;
      }
      const spellIndex = SPELL_KEYS.indexOf(key as (typeof SPELL_KEYS)[number]);
      const spell = spellIndex >= 0 ? stateRef.current.spells[spellIndex] : undefined;
      if (spell) {
        e.preventDefault();
        if (!e.repeat) chooseSpellRef.current(spell);
        return;
      }
      const n = Number(e.key);
      const action =
        Number.isInteger(n) && n >= 1 && n <= itemGroupsRef.current.length
          ? ({ kind: 'use_item', item: itemGroupsRef.current[n - 1]!.id } as const)
          : KEY_ACTIONS[e.key];
      if (!action) return;
      e.preventDefault();
      if (!e.repeat) request(action);
    };
    const onUp = (e: KeyboardEvent) => {
      const dir = KEY_DIRS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (dir) release(dir);
    };
    // ウィンドウから離れるとキーを離した通知が来ないので、押している方向を忘れる
    const onBlur = () => {
      heldRef.current = [];
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [hold, release, request]);

  /**
   * マップをタップ・クリックすると、そのマスまで歩く。敵をタップするとその敵へ向かって攻撃する。
   * 歩いている途中にもう一度タップすると、その場で止まる
   */
  const heroTapRef = useRef(-Infinity); // 最後に主人公をタップした時刻（ダブルタップを見分ける）
  const onMapTap = (e: { clientX: number; clientY: number }) => {
    const s = stateRef.current;
    if (s.outcome !== 'ongoing') return;
    if (walkRef.current) {
      walkRef.current = null;
      return;
    }
    const target = view3dRef.current?.pickTile(e.clientX, e.clientY);
    // 主人公をダブルタップ（DOUBLE_TAP_MS 以内に2回タップ）すると、その場で1ターン待つ。
    // 1回だけのタップでは待たない（うっかり触れて、ターンが進まないように）
    const onHero = view3dRef.current?.hitsPlayer(e.clientX, e.clientY);
    if (onHero) {
      const now = performance.now();
      if (now - heroTapRef.current <= DOUBLE_TAP_MS) {
        heroTapRef.current = -Infinity;
        request({ kind: 'wait' });
      } else {
        heroTapRef.current = now;
      }
      return;
    }
    heroTapRef.current = -Infinity;
    if (!target) return;
    const i = target.y * s.map.width + target.x;
    const known = target.x >= 0 && target.y >= 0 && target.x < s.map.width && target.y < s.map.height && s.seen[i];
    if (!known || s.map.tiles[i] === 'wall') {
      setError('まだ見ていない場所や壁へは移動できない');
      return;
    }
    const seenEnemies = visibleEnemyIds(s);
    const foe = s.enemies.find((en) => samePos(en.pos, target) && seenEnemies.has(en.uid));
    heldRef.current = [];
    queueRef.current = [];
    walkRef.current = { pos: target, enemy: foe ? foe.uid : null, seenEnemies };
    setError(null);
  };

  // ===== 仮想スティック =====
  // 3D画面のどこでも、指を置いてずらすとそこにスティックが出て、ずらした向きに歩き続ける。
  // 指を動かさずに離したときは、タップとしてそのマスへ歩く
  const [stick, setStick] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const touchRef = useRef<{ id: number; x: number; y: number; left: number; top: number; dragging: boolean } | null>(null);

  const aimStick = (dirs: Dir[] | null) => {
    if (dirs) walkRef.current = null; // なぞり始めたら、タップで向かっていた先は取りやめる
    stickRef.current = dirs;
  };

  const endTouch = () => {
    aimStick(null);
    touchRef.current = null;
    setStick(null);
  };

  const onStagePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    // 終わったあとの「結果を見る」ボタンなどは、そのまま押せるようにする
    if (stateRef.current.outcome !== 'ongoing' || touchRef.current || e.button !== 0) return;
    // 3D画面の上に重ねたボタン（待機・リタイアの確かめなど）は、歩く操作にせず、ボタンとして押させる
    if ((e.target as HTMLElement).closest('button, a')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    touchRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, left: rect.left, top: rect.top, dragging: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onStagePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const t = touchRef.current;
    if (!t || e.pointerId !== t.id) return;
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    if (!t.dragging) {
      if (Math.hypot(dx, dy) < STICK.dragStart) return;
      t.dragging = true;
    }
    aimStick(stickDirections(dx, dy));
    const knob = knobOffset(dx, dy);
    setStick({ x: t.x - t.left, y: t.y - t.top, dx: knob.x, dy: knob.y });
  };

  const onStagePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const t = touchRef.current;
    if (!t || e.pointerId !== t.id) return;
    const tapped = !t.dragging;
    endTouch();
    if (tapped) onMapTap(e);
  };

  const onStagePointerCancel = (e: PointerEvent<HTMLDivElement>) => {
    if (touchRef.current && e.pointerId === touchRef.current.id) endTouch();
  };

  const restart = () => {
    const fresh = start();
    stateRef.current = fresh;
    motionRef.current = { from: motionOf(fresh), start: 0 };
    heldRef.current = [];
    queueRef.current = [];
    walkRef.current = null;
    stickRef.current = null;
    setError(null);
    setState(fresh);
  };

  const { stats } = state;
  const dungeon = dungeonOfState(state);
  const visibleEnemies = state.enemies.filter((e) => visible.has(e.pos.y * state.map.width + e.pos.x));
  const onStairs = state.map.stairs !== null && samePos(state.player, state.map.stairs);
  const ended = state.outcome !== 'ongoing';
  const floorName = isBossFloor(state) ? '最深部' : `地下${state.floor + 1}階`;

  const lastLog = state.log.at(-1);
  const recentLog = state.log.slice(-8).reverse();

  return (
    <main className="screen explore-screen">
      <header className="top explore-top">
        <div>
          <p className="top__run">
            {runNumber ? (
              `${runNumber}回目の挑戦`
            ) : (
              <>
                開発用（
                <a href={devBestHref(!devBest, state.trait)}>{devBest ? 'ふつうの装備に戻す' : 'いちばん強い装備で試す'}</a>）
              </>
            )}{' '}
            ・ {dungeon.name} ・ {state.turn}ターン ・ 倒した敵 {state.defeated}体 ・ 金貨{' '}
            {state.gold}G
          </p>
          <h1 className="top__title">{floorName}</h1>
        </div>
        <div className="explore-top__actions">
          <SoundButton />
          <button
            type="button"
            className="explore__wait explore__info-toggle"
            aria-expanded={infoOpen}
            aria-controls="explore-more"
            onClick={() => setInfoOpen(true)}
          >
            装備と敵
          </button>
        </div>
      </header>

      <div className="explore">
        <div
          className="explore__stage"
          onPointerDown={onStagePointerDown}
          onPointerMove={onStagePointerMove}
          onPointerUp={onStagePointerUp}
          onPointerCancel={onStagePointerCancel}
          onLostPointerCapture={onStagePointerCancel}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* 3D表示ができない環境では、遊べないことを伝える（以前は2D表示に切り替えていたが、なくした） */}
          {no3d && <p className="explore__no3d">この端末（ブラウザ）では3D表示ができないため、遊べません。新しいブラウザで開いてください。</p>}
          <canvas
            ref={viewRef}
            className="explore__view"
            hidden={no3d}
            role="img"
            aria-label={`${floorName}の周囲。マスをタップするとそこまで歩き、指でなぞるとその向きに歩き続ける。主人公をダブルタップするとその場で1ターン待つ。階段は踏むと降りる。${onStairs ? '足元に階段がある' : ''}`}
          />
          {/* その場で1ターン待つ。3D画面の右下に重ねる（スマホでは、下に出る記録の行より上） */}
          {!ended && (
            <button
              type="button"
              className="explore__rest"
              onClick={() => request({ kind: 'wait' })}
              aria-label="その場で1ターン待つ"
              title="その場で1ターン待つ（スペースキー）"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9" />
              </svg>
              待機
              <span className="explore__rest-key">スペース</span>
            </button>
          )}
          {stick && (
            <div className="stick" style={{ left: stick.x, top: stick.y }} aria-hidden="true">
              <span className="stick__knob" style={{ transform: `translate(${stick.dx}px, ${stick.dy}px)` }} />
            </div>
          )}
          {/* 「まだ見ていない場所や壁へは移動できない」などの知らせは3D画面の上に重ねる。
              下に並べると、出たり消えたりするたびに3D画面の高さが変わって画面が揺れるため */}
          <p className="error explore__notice" role="alert">
            {error}
          </p>
          {/* この階の地図。3D画面の右上に、小さく半透明で重ねる。広いマップは縮めて表示するので、なめらかに縮める */}
          <canvas
            ref={miniRef}
            className={`explore__mini${state.map.width * MINI_CELL > MINI_SHARP_MAX ? ' explore__mini--dense' : ''}`}
            width={state.map.width * MINI_CELL}
            height={state.map.height * MINI_CELL}
            role="img"
            aria-label="この階の地図（歩いて見えた範囲）"
          />
          {/* スマホでは記録の欄が画面の外になるので、いちばん新しい1行を画面の上に重ねて出す */}
          {!ended && lastLog && (
            <p className="explore__toast" aria-hidden="true">
              {lastLog}
            </p>
          )}
          {leaving && (
            <div className="explore__ending explore__leave" role="alertdialog" aria-labelledby="explore-leave">
              <p id="explore-leave">ページを離れますか？</p>
              <p className="explore__leave-note">ここまでの探索は保存されています。次に開いたとき、続きから遊べます。</p>
              <button type="button" className="primary" autoFocus onClick={stay}>
                探索に戻る
              </button>
              <button type="button" onClick={leave}>
                ページを離れる
              </button>
            </div>
          )}
          {retiring && !ended && !leaving && (
            <div className="explore__ending explore__leave" role="alertdialog" aria-labelledby="explore-retire">
              <p id="explore-retire">リタイアしますか？</p>
              <p className="explore__leave-note">
                探索をやめて、ダンジョンを出ます。踏破にはならず、手に入れた金貨は、力尽きたときと同じく半分だけ持ち帰ります。
              </p>
              <button type="button" className="primary" autoFocus onClick={() => setRetiring(false)}>
                探索に戻る
              </button>
              <button
                type="button"
                onClick={() => {
                  setRetiring(false);
                  request({ kind: 'retire' });
                }}
              >
                リタイアする
              </button>
            </div>
          )}
          {ended && !leaving && (
            <div className="explore__ending">
              <p>{lastLog}</p>
              {onFinish ? (
                <button type="button" className="primary" onClick={() => onFinish(state)}>
                  結果を見る
                </button>
              ) : (
                <button type="button" className="primary" onClick={restart}>
                  もう一度歩く
                </button>
              )}
            </div>
          )}
        </div>

        <aside className="explore__side">
          <div className="explore__status">
            {/* 体力・満腹度・魔力は、数字を出さずゲージだけにする。体力と満腹度は、残りが少ないと点滅する */}
            <Meter label="HP" value={stats.hp} max={stats.maxHp} tone="hp" gaugeOnly warnBelow={0.25} pulse />
            <Meter label="満腹度" value={state.satiety} max={state.maxSatiety} tone="satiety" gaugeOnly warnBelow={0.25} />
            {state.maxMp > 0 && <Meter label="魔力" value={state.mp} max={state.maxMp} tone="mp" gaugeOnly pulse shakeKey={mpShake} />}
            {/* レベルは、この挑戦のあいだだけ。いちばん上のレベルでは経験値の棒を出さない */}
            {state.level < dungeon.growth.maxLevel ? (
              <Meter label={`レベル${state.level}`} value={state.exp} max={expToNext(state.level, dungeon.growth)} tone="exp" unit="経験値" />
            ) : (
              <p className="meter__head">
                <span>レベル{state.level}</span>
                <span>最大</span>
              </p>
            )}
          </div>

          <div className="explore__controls">
            {state.spells.length > 0 && (
              <ul className="explore__items explore__spells" aria-label="呪文">
                {state.spells.map((spell, i) => {
                  const cost = dungeon.spells[spell].cost ?? 0;
                  return (
                    <li key={spell}>
                      <button
                        type="button"
                        className="explore__use explore__spell"
                        onClick={() => chooseSpell(spell)}
                        disabled={ended || state.mp < cost}
                        title={`${ITEMS[`book_${spell}` as ItemId].description}${SPELLS[spell].aim ? '（主人公が向いている方向に唱える）' : ''}`}
                      >
                        <span className="explore__key">{SPELL_KEYS[i]?.toUpperCase()}</span>
                        <SpellIcon spell={spell} size={22} />
                        {SPELLS[spell].name}
                        <span className="explore__cost">魔力{cost}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {itemGroups.length === 0 ? (
              <p className="muted explore__items">道具はない</p>
            ) : (
              <ul className="explore__items" aria-label="道具">
                {itemGroups.map((g, i) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      className="explore__use"
                      onClick={() => request({ kind: 'use_item', item: g.id })}
                      disabled={ended}
                      // 読み上げでは、名前と個数をまとめて伝える
                      aria-label={g.count > 1 ? `${ITEMS[g.id].name}（${g.count}個）` : ITEMS[g.id].name}
                      title={`${ITEMS[g.id].name}：${ITEMS[g.id].description}`}
                    >
                      <span className="explore__key">{i + 1}</span>
                      {/* アイコンと名前（名前は小さい字。スマホでは、アイコンの下に置く） */}
                      <span className="explore__item-face">
                        <ItemIcon id={g.id} size={26} />
                        <span className="explore__item-name" aria-hidden="true">
                          {ITEMS[g.id].name}
                        </span>
                      </span>
                      {g.count > 1 && <span className="explore__count">×{g.count}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* スマホでは画面に収まらないので、ふだんは隠して「装備と敵」で重ねて開く */}
          <div id="explore-more" className={`explore__more${infoOpen ? ' explore__more--open' : ''}`}>
            <div className="explore__more-head">
              <h2 className="panel__title">装備と敵</h2>
              <button type="button" className="explore__wait" onClick={() => setInfoOpen(false)}>
                閉じる
              </button>
            </div>
            <section className="explore__info" aria-labelledby="explore-gear">
              <h2 id="explore-gear" className="meter__head">
                装備
              </h2>
              <p className="explore__gear">
                武器：{stats.weapon ? <ItemLabel id={stats.weapon} name={ITEMS[stats.weapon].name} /> : 'なし'}
                <br />
                防具：{stats.armor ? <ItemLabel id={stats.armor} name={ITEMS[stats.armor].name} /> : 'なし'}
                {stats.enchant && (
                  <>
                    <br />
                    付与：{TRAITS[stats.enchant.element].name}（あと{stats.enchant.hits}回）
                  </>
                )}
              </p>
            </section>

            <section className="explore__info" aria-labelledby="explore-enemies">
              <h2 id="explore-enemies" className="meter__head">
                見えている敵
              </h2>
              {visibleEnemies.length === 0 ? (
                <p className="muted">いない</p>
              ) : (
                <ul className="explore__enemies">
                  {visibleEnemies.map((e) => (
                    <li key={e.uid}>
                      <span className={`explore__mark explore__mark--${e.mode}`} aria-hidden="true">
                        {ENEMY_MARK[e.mode].mark}
                      </span>
                      {enemyDef(e).name}（{TRAITS[enemyDef(e).element].name}・{BODY_NAMES[enemyDef(e).body]}、HP {e.hp}）：
                      {ENEMY_MARK[e.mode].text}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <p className="muted explore__help">
              マスをタップするとそこまで歩く（敵をタップすると攻撃しに行く。歩いている途中にタップすると止まる）。画面を指でなぞると、なぞった向きに歩き続ける。主人公をダブルタップするとその場で1ターン待つ。階段は踏むとそのまま降りる。キーボードでは矢印キー／WASDで移動、スペースで待つ、数字キーで道具を使う
            </p>
            <section className="explore__more-log" aria-label="記録">
              <h3 className="meter__head">記録</h3>
              <LogList lines={recentLog} total={state.log.length} />
            </section>
            {/* 押してすぐには終わらず、確かめてからリタイアする */}
            <button
              type="button"
              className="explore__wait explore__retire"
              disabled={ended}
              onClick={() => {
                setInfoOpen(false);
                setRetiring(true);
              }}
            >
              リタイアする
            </button>
          </div>
        </aside>
      </div>

      <section className="explore__log-panel" aria-labelledby="explore-log">
        <h2 id="explore-log" className="panel__title">
          記録
        </h2>
        <LogList lines={recentLog} total={state.log.length} />
      </section>
    </main>
  );
}

/** 記録（新しい順）。key は記録の通し番号にして、新しい行が増えても古い行を作り直さない */
function LogList({ lines, total }: { lines: string[]; total: number }) {
  return (
    <ol className="explore__log">
      {lines.map((line, i) => (
        <li key={total - i}>{line}</li>
      ))}
    </ol>
  );
}

interface MeterProps {
  label: string;
  value: number;
  max: number;
  tone: 'hp' | 'satiety' | 'exp' | 'mp';
  unit?: string;
  gaugeOnly?: boolean; // 数字を出さず、ゲージだけにする（読み上げには数字を伝える）
  warnBelow?: number; // 残りがこの割合より少ないと、ゲージを点滅させる
  pulse?: boolean; // 増えたとき・減ったときに、ゲージを一瞬光らせる（唱えた魔力・回復した体力）
  shakeKey?: number; // 変わるたびにゲージを震わせる（魔力が足りないとき）
}

function Meter({ label, value, max, tone, unit, gaugeOnly, warnBelow, pulse, shakeKey = 0 }: MeterProps) {
  // 光らせる：値が変わったら、増えた・減ったを少しのあいだ覚える
  const prev = useRef(value);
  const [change, setChange] = useState<{ dir: 'up' | 'down'; n: number } | null>(null);
  useEffect(() => {
    if (!pulse || value === prev.current) return;
    const dir = value > prev.current ? 'up' : 'down';
    prev.current = value;
    setChange((c) => ({ dir, n: (c?.n ?? 0) + 1 }));
    const id = window.setTimeout(() => setChange(null), 600);
    return () => window.clearTimeout(id);
  }, [value, pulse]);
  const low = warnBelow !== undefined && value / max < warnBelow;
  const classes = [
    'meter__track',
    `meter__track--${tone}`,
    low ? 'meter__track--low' : '',
    change ? `meter__track--${change.dir}` : '',
    shakeKey > 0 ? 'meter__track--shake' : '',
  ].join(' ');
  return (
    <div className="meter">
      <div className="meter__head">
        <span>{label}</span>
        {!gaugeOnly && (
          <span>
            {unit ? `${unit} ` : ''}
            {value} / {max}
          </span>
        )}
      </div>
      <div
        // 震わせる・光らせる動きを、起きるたびに始めからやり直す
        key={`${shakeKey}-${change?.n ?? 0}`}
        className={classes}
        role="meter"
        aria-label={unit ? `${label}の${unit}` : label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={gaugeOnly ? `${Math.round((value / max) * 100)}%` : undefined}
      >
        <div className="meter__fill" style={{ width: `${(value / max) * 100}%` }} />
      </div>
    </div>
  );
}
