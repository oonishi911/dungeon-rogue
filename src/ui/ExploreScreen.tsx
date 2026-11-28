// ダンジョンの探索画面。マップを歩き、敵と戦い、道具を使う。
// ゲーム本体では出発で決まった持ち物（depart.ts）で始まり、開発用には ?view=explore で単独でも開ける（ExploreDevScreen.tsx）。
//
// 操作はすべて「意図」として記録し、毎フレームの処理で、前の1歩の動きが終わっていれば1つ実行する。
// キーを押し続けたときの歩く速さが、OS のキーリピートの設定に左右されず一定になる。
//
// このファイルは操作と毎フレームの進行を受け持つ。ほかは次のファイルに分けてある：
//   exploreFeedback.ts 1手ごとの音・振動・3D の演出 / keyBindings.ts キーの割り当て（設定の画面で変えられる） / exploreWalk.ts タップで歩く判断
//   ExploreSide.tsx 右側（下）の欄 / ExploreDialogs.tsx 重ねて出す確かめる画面 / ExploreParts.tsx ゲージと記録 / backGuard.ts 戻るの見張り

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react';
import { preloadSounds, setAmbient, setBossMusic } from '../audio/sound';
import { SPELLS } from '../game/data';
import { dungeonOfState, isBossFloor, step, upStairs, viewRadius } from '../game/explore';
import { DIR_DELTA, type Dir, type ExploreAction, type ExploreState } from '../game/exploreTypes';
import { dirToward, samePos, visibleTiles } from '../game/exploreSight';
import { spellPreview } from '../game/spellArea';
import { tileAt, type Pos } from '../game/map';
import { GearIcon, SettingsDialog } from './SettingsDialog';
import { walkPath, walkToward } from '../game/path';
import type { ItemId, SpellId } from '../game/types';
import { useBackGuard } from './backGuard';
import { drawMinimap, MINI_CELL, miniWindow, motionOf, readColors, type Frame, type Motion } from './exploreRender';
import { DungeonView3D, webglAvailable } from './explore3d';
import { LOST, lost } from '../game/story';
import { INTRO_FX, LOW_HP, QUALITY } from './explore3dConfig';
import { feelSettings, subscribeFeel } from './feelSettings';
import { shouldDraw } from './graphicsQuality';
import { devBestHref } from './exploreDev';
import { EndingPanel, LeaveDialog, RetireDialog } from './ExploreDialogs';
import { playFeedback } from './exploreFeedback';
import { keyCommand, keyLabel } from './keyBindings';
import { LogList } from './ExploreParts';
import { NearbyFoes } from './NearbyFoes';
import { ExploreSide } from './ExploreSide';
import { ControlsHelp } from './ControlsHelp';
import { countStickUse, markHelpSeen, shouldAutoOpenHelp, shouldShowStickHint } from './controlsHelp';
import { avoidOnWalk, knownStairs, visibleEnemyIds, type WalkGoal } from './exploreWalk';
import { chooseDirection, knobOffset, STICK, stickDirections } from './stick';

// ミニマップの元の大きさ（px）がこれ以下なら、拡大してもぼかさずドットのまま見せる。
// これより大きい（広いマップ）と縮めて表示するので、ドットのままだと細い通路が消えてしまう
const MINI_SHARP_MAX = 96;

// 1マス動くのにかける時間。なぞり続けたとき・タップで歩くときの速さもこれで決まる（1秒に約2.6マス。以前の270ミリ秒から、速さを3割落とした）
const STEP_MS = 385;
const DOUBLE_TAP_MS = 350; // この時間（ミリ秒）以内に主人公を2回タップすると、ダブルタップとしてその場で待つ
const NOTICE_MS = 2600; // 押せなかった理由などの知らせを出しておく時間（ミリ秒）
const INFO_MS = 3200; // 説明を出しておく時間（ミリ秒）
const QUEUE_MAX = 2; // 動いている途中に押した操作を、いくつまで覚えておくか（多すぎると指を止めても歩き続ける）

interface ExploreScreenProps {
  start: () => ExploreState;
  run?: number; // 何回目の挑戦か。省略すると開発用の表示になる
  onFinish?: (state: ExploreState) => void; // 省略すると、終わったあと同じ条件でやり直せる
  onProgress?: (state: ExploreState) => void; // 始まったときと、行動するたびに呼ぶ（途中の状態を保存するため）
  guardBack?: boolean; // ブラウザの「戻る」を一度受け止めて、ページを離れるかを確かめる
  onSuspend?: () => void; // 「中断してもどる」：探索はそのまま残して、「続きから」の画面へ行く
  devBest?: boolean; // 開発用画面で、いちばん強い装備で試しているか（切り替えのリンクを出す）
}

export function ExploreScreen({ start, run: runNumber, onFinish, onProgress, guardBack = false, onSuspend, devBest }: ExploreScreenProps) {
  // 3D表示ができない環境（WebGL2 が使えない、3D表示を作れなかった）では、遊べないことを伝える
  const [no3d, setNo3d] = useState(() => !webglAvailable());
  const [state, setState] = useState<ExploreState>(start);
  // スマホで、装備・敵・記録をまとめた画面を開いているか（PCでは常に横に出ている）
  const [infoOpen, setInfoOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{ text: string; key: number } | null>(null); // 説明（状態のアイコンを押した・呪文を長押しした）。3D画面の上に短く出す
  // 知らせと説明は、少しすると消える（押せなかった理由は、その場で読めれば十分。残り続けると3D画面のじゃまになる）
  useEffect(() => {
    if (!error) return;
    const id = window.setTimeout(() => setError(null), NOTICE_MS);
    return () => window.clearTimeout(id);
  }, [error]);
  useEffect(() => {
    if (!info) return;
    const id = window.setTimeout(() => setInfo(null), INFO_MS);
    return () => window.clearTimeout(id);
  }, [info]);
  const showInfo = useCallback((text: string) => setInfo((i) => ({ text, key: (i?.key ?? 0) + 1 })), []);
  // 向きのある呪文の構え（2026-11-23）：1回押すと、届く範囲を床に出して向きを選ぶ。もう一度押すと唱える
  const [aiming, setAiming] = useState<SpellId | null>(null);
  const aimingRef = useRef<SpellId | null>(null);
  const [facing, setFacing] = useState<Dir>('down'); // 構えの範囲を描き直すための、主人公の向き
  const [miniOpen, setMiniOpen] = useState(false); // 地図を大きく広げているか
  // 操作の説明：初めて探索に入ったときだけ自動で開く（そのあとは「操作」ボタン）
  const [helpOpen, setHelpOpen] = useState(() => shouldAutoOpenHelp());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const helpOpenRef = useRef(helpOpen);
  helpOpenRef.current = helpOpen;
  const closeHelp = useCallback(() => {
    markHelpSeen();
    setHelpOpen(false);
  }, []);
  // 指で触る端末か（説明で、スマホの操作を先に出す）
  const touchDevice = useMemo(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches, []);
  // なぞって歩く目印（指で触る端末で、まだ数回しかなぞっていないとき）
  const [stickHint, setStickHint] = useState(() => shouldShowStickHint());
  const [hurtKey, setHurtKey] = useState(0); // 敵に攻撃された回数（画面のふちを一瞬赤くする。変わるたびに、赤いふちの動きをやり直す）
  const feel = useSyncExternalStore(subscribeFeel, feelSettings);
  const [mpShake, setMpShake] = useState(0); // 魔力が足りずに唱えられなかった回数（魔力のゲージを震わせる）
  // リタイアするかを確かめているところ
  const [retiring, setRetiring] = useState(false);
  const [intro, setIntro] = useState<{ name: string; boss: boolean; key: number } | null>(null); // 強敵・ボスが初めて見えたときに出す名前
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
    () => visibleTiles(state.map, state.player, viewRadius(state)),
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
      setFacing(action.dir);
    }
    // 向きのある呪文は、主人公が向いている方向に唱える
    if (action.kind === 'cast' && SPELLS[action.spell].aim && !action.dir) action = { ...action, dir: facingRef.current };
    // 武器の固有技（剣・杖）も、主人公が向いている方向に出す
    if (action.kind === 'skill' && !action.dir) action = { ...action, dir: facingRef.current };
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
    // 音・振動・3D 画面の演出を始める。呪文を唱えたときは、矢が当たるまで次の行動を待たせる
    const impactMs = playFeedback(prev, next, view3dRef.current);
    if (impactMs > 0) busyUntilRef.current = performance.now() + impactMs;
    if (next.hits.some((h) => h.kind === 'taken')) setHurtKey((n) => n + 1);
    // 階を移ったときは動かさずに切り替える。転移の呪文で跳んだときも、主人公は滑らせずに跳んだ先へ置く（敵はふつうに動かす）
    const from = motionOf(next.map === prev.map ? prev : next);
    motionRef.current = { from: next.cast?.warp ? { ...from, player: next.player } : from, start: performance.now() };
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
    // 構えているあいだに、ほかの行動をしたら、構えはやめる
    if (aimingRef.current && action.kind !== 'cast') {
      aimingRef.current = null;
      setAiming(null);
    }
    if (queueRef.current.length < QUEUE_MAX) queueRef.current = [...queueRef.current, action];
  }, []);

  /** 呪文を唱える。向きのある呪文（なぎ払い・矢）は、唱えるときに主人公が向いている方向へ飛ぶ（perform で向きを入れる） */
  const chooseSpell = useCallback(
    (spell: SpellId) => {
      const s = stateRef.current;
      const stop = () => {
        aimingRef.current = null;
        setAiming(null);
      };
      // 構えている向きが壁で、どこにも届かないときは、唱えずに知らせる（魔力をむだにしない）
      if (SPELLS[spell].aim && aimingRef.current === spell) {
        const reach = spellPreview(s, spell, facingRef.current, dungeonOfState(s).spells);
        if (reach && reach.path.length === 0 && reach.area.length === 0) {
          setError('この向きは壁で、届かない');
          return;
        }
      }
      // 向きのない呪文と、構えている呪文をもう一度押したときは、唱える
      if (!SPELLS[spell].aim || aimingRef.current === spell) {
        stop();
        request({ kind: 'cast', spell });
        return;
      }
      // 魔力が足りなければ、構えずに知らせる
      if (s.mp < (dungeonOfState(s).spells[spell].cost ?? 0)) {
        stop();
        setError('魔力が足りない');
        setMpShake((n) => n + 1);
        return;
      }
      walkRef.current = null;
      heldRef.current = [];
      stickRef.current = null;
      aimingRef.current = spell;
      setAiming(spell);
    },
    [request],
  );
  // 押したままの構え（呪文のボタンを押しているあいだ）。構えの欄の案内を変える
  const [holding, setHolding] = useState(false);
  /** 呪文のボタンを押したとき：向きのある呪文なら構える（魔力が足りなければ知らせて、構えない） */
  const aimStart = useCallback((spell: SpellId): boolean => {
    const s = stateRef.current;
    if (!SPELLS[spell].aim || s.outcome !== 'ongoing') return false;
    if (s.mp < (dungeonOfState(s).spells[spell].cost ?? 0)) {
      setError('魔力が足りない');
      setMpShake((n) => n + 1);
      return false;
    }
    walkRef.current = null;
    heldRef.current = [];
    stickRef.current = null;
    aimingRef.current = spell;
    setAiming(spell);
    setHolding(true);
    return true;
  }, []);
  /** 呪文のボタンを離したとき：唱える（cancel なら、やめる） */
  const aimRelease = useCallback(
    (spell: SpellId, cancel: boolean) => {
      setHolding(false);
      if (cancel) {
        aimingRef.current = null;
        setAiming(null);
        return;
      }
      aimingRef.current = spell;
      chooseSpell(spell);
    },
    [chooseSpell],
  );
  /** 構えをやめる */
  const cancelAim = useCallback(() => {
    aimingRef.current = null;
    setAiming(null);
  }, []);
  /** 主人公の向きだけを変える（1ターンも使わない。構えているあいだの向きの選び直し・近くの敵を押したとき） */
  const turnTo = useCallback((dir: Dir) => {
    facingRef.current = dir;
    view3dRef.current?.face(dir);
    setFacing(dir);
  }, []);
  const chooseSpellRef = useRef(chooseSpell);
  chooseSpellRef.current = chooseSpell;
  const cancelAimRef = useRef(cancelAim);
  cancelAimRef.current = cancelAim;

  /** 武器の固有技を出す（向きのある技は、perform で向きを入れる） */
  const useSkillNow = useCallback(() => request({ kind: 'skill' }), [request]);
  const useSkillRef = useRef(useSkillNow);
  useSkillRef.current = useSkillNow;
  const swapNow = useCallback(() => request({ kind: 'swap' }), [request]);
  const swapRef = useRef(swapNow);
  swapRef.current = swapNow;

  const hold = useCallback((dir: Dir) => {
    // 構えているあいだは、歩かずに向きだけを変える
    if (aimingRef.current) {
      turnTo(dir);
      return;
    }
    walkRef.current = null;
    if (heldRef.current.includes(dir)) return;
    heldRef.current = [...heldRef.current, dir];
    // 押してすぐ離しても1歩は進むように、1歩分を予約しておく
    request({ kind: 'move', dir });
  }, [request, turnTo]);

  const release = useCallback((dir: Dir) => {
    heldRef.current = heldRef.current.filter((d) => d !== dir);
  }, []);

  /**
   * タップ・クリックで向かっている先へ1歩進む。着いた・進めないときは止まる。
   * 途中の敵に当たって攻撃したときは止まらず、倒すまで攻撃してから、また歩く（2026-11-29）
   */
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
      const action = walkToward(s, goal.pos, avoidOnWalk(s, goal.pos));
      // 着いた・進めないときは止まる。その場から動かなかったときは、敵を攻撃したのなら続け、そうでなければ止まる
      const attacked = () => stateRef.current.hits.some((h) => h.kind === 'dealt');
      if (!action || !perform(action) || (samePos(before, stateRef.current.player) && !attacked())) {
        walkRef.current = null;
      }
    },
    [perform],
  );

  // 「階段へ」（2026-11-28）：見つけた下り階段まで歩く。もう一度押すと止める（途中で立ち止まらない。2026-11-29）
  const [walkingStairs, setWalkingStairs] = useState(false);
  const goStairs = useCallback(() => {
    const s = stateRef.current;
    if (s.outcome !== 'ongoing') return;
    if (walkRef.current?.stairs) {
      walkRef.current = null;
      setWalkingStairs(false);
      return;
    }
    const to = knownStairs(s);
    if (!to) {
      setError('まだ階段を見つけていない');
      return;
    }
    if (!walkToward(s, to, avoidOnWalk(s, to))) {
      setError('階段までの道がわからない');
      return;
    }
    aimingRef.current = null;
    setAiming(null);
    heldRef.current = [];
    queueRef.current = [];
    stickRef.current = null;
    walkRef.current = { pos: to, enemy: null, stairs: true };
    setWalkingStairs(true);
  }, []);
  const goStairsRef = useRef(goStairs);
  goStairsRef.current = goStairs;

  // 毎フレーム：前の動きが終わっていれば次の行動を1つ行い、画面を描く
  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canvas = viewRef.current;
    if (no3d || !canvas) return;
    let view3d: DungeonView3D;
    try {
      view3d = new DungeonView3D(canvas, feelSettings().graphics);
    } catch {
      setNo3d(true);
      return;
    }
    view3dRef.current = view3d;
    // 強敵・ボスが初めて視界に入ったら、名前を出す（カメラが寄って戻るあいだだけ）
    let introTimer = 0;
    let introKey = 0;
    view3d.onIntro = ({ name, boss }) => {
      window.clearTimeout(introTimer);
      setIntro({ name: name.replace('（強敵）', ''), boss, key: ++introKey });
      introTimer = window.setTimeout(() => setIntro(null), INTRO_FX.inMs + (boss ? INTRO_FX.bossHoldMs : INTRO_FX.holdMs) + INTRO_FX.outMs);
    };
    // 3D表示は、Canvas の画面上の大きさに合わせて描く（スマホの縦長の画面でも引き伸ばさない）
    const observer = new ResizeObserver(() => view3d.resize(canvas.clientWidth, canvas.clientHeight));
    observer.observe(canvas);
    view3d.resize(canvas.clientWidth, canvas.clientHeight);
    // 視界の計算は、状態が変わったときだけやり直す
    let sight = { state: stateRef.current, visible: visibleTiles(stateRef.current.map, stateRef.current.player, viewRadius(stateRef.current)) };
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
    let lastTick = performance.now();
    let lastDrawAt = -Infinity;
    const tick = (now: number) => {
      if (now - motionRef.current.start >= STEP_MS && now >= busyUntilRef.current && stateRef.current.outcome === 'ongoing') {
        const held = heldRef.current.at(-1);
        const [queued, ...rest] = queueRef.current;
        if (queued) {
          queueRef.current = rest;
          perform(queued);
        } else if (held || stickRef.current) {
          // なぞり・方向キーの押しっぱなしで歩き続けているとき。敵が見えても、宝箱を見つけても、攻撃を受けても立ち止まらない（2026-11-29）
          const s = stateRef.current;
          const dir =
            held ??
            // 斜めに倒しているときは、指の向きに近い方へ進み、そちらが壁ならもう一方へ進む
            chooseDirection(stickRef.current!, (d) => {
              const to = { x: s.player.x + DIR_DELTA[d].x, y: s.player.y + DIR_DELTA[d].y };
              return tileAt(s.map, to) !== 'wall';
            });
          perform({ kind: 'move', dir });
        } else if (walkRef.current) {
          walkStep(walkRef.current);
        }
        // 「階段へ」のボタンの表示（歩いているあいだは「止める」）。ほかの操作で取りやめたときも、ここで戻る
        setWalkingStairs(walkRef.current?.stairs === true);
      }
      const current = stateRef.current;
      if (sight.state !== current) {
        sight = { state: current, visible: visibleTiles(current.map, current.player, current.sightRadius) };
      }
      // ヒットストップ：当てた一瞬、画面を止める（描き直さず、歩く動きの時計も止める）
      const clock = performance.now();
      if (view3d.holdFrame(clock)) {
        motionRef.current = { ...motionRef.current, start: motionRef.current.start + (clock - lastTick) };
        lastTick = clock;
        frameId = requestAnimationFrame(tick);
        return;
      }
      lastTick = clock;
      const frame: Frame = {
        state: current,
        visible: sight.visible,
        from: motionRef.current.from,
        progress: reduceMotion ? 1 : Math.min(1, (now - motionRef.current.start) / STEP_MS),
        walkTarget: walkRef.current?.pos ?? null,
        walkPath: routeFor(current, walkRef.current?.pos ?? null),
      };
      // 画質が「軽い」なら、1秒に30コマまでしか描かない（歩く・戦う処理は、上で毎コマ進める）
      if (shouldDraw(feelSettings().graphics, now - lastDrawAt, QUALITY.lightFrameMs)) {
        lastDrawAt = now;
        view3d.render(frame);
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      window.clearTimeout(introTimer);
      observer.disconnect();
      view3d.dispose();
      view3dRef.current = null;
    };
  }, [perform, walkStep, no3d, showInfo]);

  // 設定の「画質」を変えたら、3D 画面にすぐ反映する
  useEffect(() => view3dRef.current?.setGraphics(feel.graphics), [feel.graphics]);

  // このダンジョンの足音を、最初の一歩から鳴るように読み込んでおく
  useEffect(() => preloadSounds(state.trait), [state.trait]);

  // 始まった時点の状態も知らせる（1歩も動かずに閉じても、同じ探索の続きから始まるように）
  useEffect(() => onProgressRef.current?.(stateRef.current), []);

  // ブラウザの「戻る」を一度受け止める（見張りの仕組みは backGuard.ts）
  const { leaving, stay, leave } = useBackGuard(guardBack);

  // ダンジョンにいるあいだ、特性の環境音を流す（探索画面を離れたら止める）
  useEffect(() => {
    setAmbient(state.trait);
    return () => setAmbient(null);
  }, [state.trait]);

  // 最深部（ボスの階）にいるあいだ、ボス戦の音楽を流す（環境音のかわり。終わったら・設定で切ったら止める）
  const onBossFloor = isBossFloor(state) && state.outcome === 'ongoing';
  useEffect(() => {
    setBossMusic(onBossFloor && feel.bossMusic);
    return () => setBossMusic(false);
  }, [onBossFloor, feel.bossMusic]);

  // 階段を降りて別の階へ移ったとき、画面を一瞬暗くして、明るく戻す（階の入れ替わりが急に見えないように）
  const [fadeKey, setFadeKey] = useState(0);
  const lastFloor = useRef(state.floor);
  useEffect(() => {
    if (state.floor > lastFloor.current && state.outcome === 'ongoing') setFadeKey((k) => k + 1);
    lastFloor.current = state.floor;
  }, [state.floor, state.outcome]);

  // 小地図：閉じているときは主人公のまわりだけを大きく、開いたときは階全体を描く
  const miniArea = miniOpen ? undefined : miniWindow(state.player);
  const miniW = (miniArea?.w ?? state.map.width) * MINI_CELL;
  const miniH = (miniArea?.h ?? state.map.height) * MINI_CELL;
  useEffect(() => {
    if (miniRef.current) drawMinimap(miniRef.current, state, readColors(), visible, miniOpen ? undefined : miniWindow(state.player));
  }, [state, visible, miniOpen, miniW, miniH]);

  // 構えの範囲：構えている呪文の届くマスを、主人公の向きに合わせて床に出す
  const preview = useMemo(() => (aiming && state.outcome === 'ongoing' ? spellPreview(state, aiming, facing, dungeonOfState(state).spells) : null), [aiming, facing, state]);
  useEffect(() => {
    view3dRef.current?.setAim(preview);
  }, [preview]);
  // 探索が終わったら、構えをやめる
  useEffect(() => {
    if (state.outcome !== 'ongoing') cancelAim();
  }, [state.outcome, cancelAim]);

  const closeHelpRef = useRef(closeHelp);
  closeHelpRef.current = closeHelp;

  // キーボード：方向キーは押している間ずっと歩く。そのほかのキーは押した回数だけ行う
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      // 操作の説明を開いているあいだは、キーで動かない（Esc で閉じる。Enter・スペースは「わかった」ボタンが受ける）
      if (helpOpenRef.current) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeHelpRef.current();
        }
        return;
      }
      // リタイアを確かめているあいだは、キーで動かない（Esc で探索に戻る）
      if (retiringRef.current) {
        if (e.key === 'Escape') setRetiring(false);
        return;
      }
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      // 構えているあいだ：Esc でやめる、Enter で唱える
      if (aimingRef.current && (key === 'Escape' || key === 'Enter')) {
        e.preventDefault();
        if (key === 'Enter') chooseSpellRef.current(aimingRef.current);
        else cancelAimRef.current();
        return;
      }
      const cmd = keyCommand(key, feelSettings().keys);
      if (cmd?.kind === 'dir') {
        e.preventDefault(); // 矢印キーでページがスクロールしないように
        if (!e.repeat) hold(cmd.dir);
        return;
      }
      if (cmd?.kind === 'swap') {
        e.preventDefault();
        if (!e.repeat && stateRef.current.stats.sub) swapRef.current();
        return;
      }
      if (cmd?.kind === 'stairs') {
        e.preventDefault();
        if (!e.repeat) goStairsRef.current();
        return;
      }
      if (cmd?.kind === 'skill') {
        e.preventDefault();
        if (!e.repeat) useSkillRef.current();
        return;
      }
      if (cmd?.kind === 'wait') {
        e.preventDefault();
        if (!e.repeat) request({ kind: 'wait' });
        return;
      }
      const spell = cmd?.kind === 'spell' ? stateRef.current.spells[cmd.index] : undefined;
      if (spell) {
        e.preventDefault();
        if (!e.repeat) chooseSpellRef.current(spell);
        return;
      }
      const n = Number(e.key);
      if (!(Number.isInteger(n) && n >= 1 && n <= itemGroupsRef.current.length)) return;
      const action = { kind: 'use_item', item: itemGroupsRef.current[n - 1]!.id } as const;
      e.preventDefault();
      if (!e.repeat) request(action);
    };
    const onUp = (e: KeyboardEvent) => {
      const cmd = keyCommand(e.key, feelSettings().keys);
      if (cmd?.kind === 'dir') release(cmd.dir);
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
    // 構えているあいだ：主人公を押すとやめる。マスを押すと、そちらを向く（歩かない）
    if (aimingRef.current) {
      if (view3dRef.current?.hitsPlayer(e.clientX, e.clientY)) cancelAim();
      else if (target) {
        const dir = dirToward(s.player, target);
        if (dir) turnTo(dir);
      }
      return;
    }
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
    const seen = visibleEnemyIds(s);
    const foe = s.enemies.find((en) => samePos(en.pos, target) && seen.has(en.uid));
    heldRef.current = [];
    queueRef.current = [];
    walkRef.current = { pos: target, enemy: foe ? foe.uid : null };
    setError(null);
  };

  // ===== 仮想スティック =====
  // 3D画面のどこでも、指を置いてずらすとそこにスティックが出て、ずらした向きに歩き続ける。
  // 指を動かさずに離したときは、タップとしてそのマスへ歩く
  const [stick, setStick] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const touchRef = useRef<{ id: number; x: number; y: number; left: number; top: number; dragging: boolean } | null>(null);

  const aimStick = (dirs: Dir[] | null) => {
    // 構えているあいだは、なぞった向きを向くだけ（歩かない）
    if (aimingRef.current) {
      if (dirs?.[0]) turnTo(dirs[0]);
      return;
    }
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
    // 操作の説明を開いているあいだは、歩かない
    if (helpOpenRef.current) return;
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
      if (stickHint && !countStickUse()) setStickHint(false);
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

  const dungeon = dungeonOfState(state);
  const visibleEnemies = state.enemies.filter((e) => visible.has(e.pos.y * state.map.width + e.pos.x));
  const onStairs = state.map.stairs !== null && samePos(state.player, state.map.stairs);
  // 見つけた下り階段（足元でなければ）まで、見た通路を通って行けるとき、「階段へ」のボタンを出す
  // （壁の切れ目から階段だけが見えていて、そこまでの道をまだ見ていないときは出さない）
  const stairsKnown = useMemo(() => {
    const to = knownStairs(state);
    return to !== null && walkPath(state, to, avoidOnWalk(state, to)) !== null;
  }, [state]);
  const ended = state.outcome !== 'ongoing';
  const floorName = isBossFloor(state) ? '最深部' : `地下${state.floor + 1}階`;
  // 低いHP：HPの割合が warn 以下で赤いふちを出し、critical 以下で脈打つ
  const hpRate = state.stats.maxHp > 0 ? state.stats.hp / state.stats.maxHp : 1;
  const lowHpClass = state.outcome !== 'ongoing' || hpRate > LOW_HP.warn ? '' : hpRate <= LOW_HP.critical ? ' explore__vignette--critical' : ' explore__vignette--low';

  const lastLog = state.log.at(-1);
  const recentLog = state.log.slice(-8).reverse();

  return (
    <main className="screen explore-screen">
      <header className="top explore-top">
        <div>
          <p className="top__run">
            {!runNumber && (
              <>
                開発用（
                <a href={devBestHref(!devBest, state.trait)}>{devBest ? 'ふつうの装備に戻す' : 'いちばん強い装備で試す'}</a>）・{' '}
              </>
            )}
            {dungeon.name} ・ {state.turn}ターン ・ 倒した敵 {state.defeated}体 ・ {LOST.name}{' '}
            {lost(state.gold)}
          </p>
          <h1 className="top__title">{floorName}</h1>
        </div>
        <div className="explore-top__actions">
          <button type="button" className="explore__wait explore__help-button" aria-haspopup="dialog" onClick={() => setHelpOpen(true)}>
            操作
          </button>
          <button type="button" className="explore__wait explore__settings-button" aria-haspopup="dialog" aria-label="設定" title="設定（音・演出・文字の大きさ・弱点の印・キー）" onClick={() => setSettingsOpen(true)}>
            <GearIcon />
          </button>
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
      {settingsOpen && <SettingsDialog keyboard={!touchDevice} onClose={() => setSettingsOpen(false)} />}

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
          {/* 低いHPの画面のふち（赤）。HPが少ないほど濃く、とても少ないと心音のように脈打つ。敵に攻撃された一瞬も赤くなる */}
          {!no3d && (
            <>
              <div className={`explore__vignette${lowHpClass}${feel.shake ? '' : ' explore__vignette--still'}`} aria-hidden="true" />
              {hurtKey > 0 && <div key={hurtKey} className="explore__hurt" aria-hidden="true" />}
              {fadeKey > 0 && feel.stairsFx && <div key={`fade${fadeKey}`} className="explore__fade" aria-hidden="true" />}
              {ended && feel.endFx && <div className={`explore__end explore__end--${state.outcome}`} aria-hidden="true" />}
            </>
          )}
          {/* その場で1ターン待つ。3D画面の右下に重ねる（スマホでは、下に出る記録の行より上） */}
          {!ended && !aiming && (
            stairsKnown && (
              <button
                type="button"
                className={`explore__go-stairs${walkingStairs ? ' explore__go-stairs--on' : ''}`}
                onClick={goStairs}
                aria-pressed={walkingStairs}
                title={walkingStairs ? `階段へ歩くのを止める（${keyLabel(feel.keys.stairs)} キー）` : `見つけた階段まで歩く（${keyLabel(feel.keys.stairs)} キー）`}
              >
                {walkingStairs ? '止める' : '階段へ'}
                <span className="explore__rest-key">{keyLabel(feel.keys.stairs)}</span>
              </button>
            )
          )}
          {!ended && !aiming && (
            <button
              type="button"
              className="explore__rest"
              onClick={() => request({ kind: 'wait' })}
              aria-label="その場で1ターン待つ"
              title={`その場で1ターン待つ（${feel.keys.wait === ' ' ? 'スペース' : keyLabel(feel.keys.wait)}キー）`}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9" />
              </svg>
              待機
              <span className="explore__rest-key">{feel.keys.wait === ' ' ? 'スペース' : keyLabel(feel.keys.wait)}</span>
            </button>
          )}
          {/* なぞって歩く目印（2026-11-28。提案 #9）：どこをなぞってもよいが、親指を置きやすい左下に、薄い輪で示す */}
          {touchDevice && stickHint && !stick && !ended && !aiming && !helpOpen && (
            <div className="stick-hint" aria-hidden="true">
              <span className="stick-hint__ring" />
              <span className="stick-hint__text">なぞって歩く</span>
            </div>
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
          {/* 説明（状態のアイコンを押した・呪文を長押しした）。知らせと同じ場所に、少しのあいだ出す */}
          {info && !error && (
            <p key={info.key} className="explore__notice explore__notice--info" role="status">
              {info.text}
            </p>
          )}
          {/* 見えている敵の簡易表示（左上）。押すと、その敵の方を向く（構えているときは、範囲もそちらへ） */}
          {!ended && <NearbyFoes state={state} visible={visible} onFace={turnTo} />}
          {/* 呪文の構え：向きの選び方と、唱える・やめるのボタン（3D画面の下に重ねる） */}
          {aiming && !ended && (
            <div className="explore__aim" role="group" aria-label={`${SPELLS[aiming].name}の構え`}>
              <p className="explore__aim-text">
                <b>{SPELLS[aiming].name}</b>
                <span>
                  {preview && preview.area.length === 0 && preview.path.length === 0
                    ? 'この向きは壁で、届かない。向きを変えて'
                    : holding
                      ? '指をずらして向きを選び、離すと唱える（「やめる」の上で離すとやめる）'
                      : '向きを選んで、もう一度押すと唱える'}
                </span>
              </p>
              <button type="button" className="explore__aim-cancel" onClick={cancelAim}>
                やめる
              </button>
              <button type="button" className="primary explore__aim-cast" onClick={() => chooseSpell(aiming)}>
                唱える
              </button>
            </div>
          )}
          {/* 強敵・ボスが初めて見えたときの名前。3D画面の上に重ねて、しばらくして消える */}
          {intro && (
            <p key={intro.key} className={`explore__intro${intro.boss ? ' explore__intro--boss' : ''}`} aria-hidden="true">
              <span className="explore__intro-label">{intro.boss ? 'ボス' : '強敵'}</span>
              {intro.name}
            </p>
          )}
          {/* この階の地図。3D画面の右上に、半透明で重ねる（主人公のまわりだけを大きく）。押すと階全体を大きく広げ、もう一度押すと戻す。広いマップは縮めて表示するので、なめらかに縮める */}
          <button
            type="button"
            className={`explore__mini-button${miniOpen ? ' explore__mini-button--open' : ''}`}
            aria-expanded={miniOpen}
            aria-label={miniOpen ? '地図を小さくする' : '地図を大きくする'}
            onClick={() => setMiniOpen((o) => !o)}
          >
            <canvas
              ref={miniRef}
              className={`explore__mini${miniOpen ? '' : ' explore__mini--local'}${miniW > MINI_SHARP_MAX ? ' explore__mini--dense' : ''}`}
              width={miniW}
              height={miniH}
              role="img"
              aria-label="この階の地図（歩いて見えた範囲。緑が自分、白い四角が階段、赤が見えている敵、金色が宝箱）"
            />
            {miniOpen && (
              <span className="explore__mini-legend" aria-hidden="true">
                <i className="explore__mini-key explore__mini-key--you" />自分 <i className="explore__mini-key explore__mini-key--stairs" />階段 <i className="explore__mini-key explore__mini-key--foe" />敵 <i className="explore__mini-key explore__mini-key--chest" />宝箱
              </span>
            )}
          </button>
          {/* スマホでは記録の欄が画面の外になるので、いちばん新しい1行を画面の上に重ねて出す */}
          {!ended && lastLog && (
            <p className="explore__toast" aria-hidden="true">
              {lastLog}
            </p>
          )}
          {helpOpen && !ended && <ControlsHelp touch={touchDevice} onClose={closeHelp} />}
          {leaving && <LeaveDialog onStay={stay} onLeave={leave} />}
          {retiring && !ended && !leaving && (
            <RetireDialog
              onCancel={() => setRetiring(false)}
              onRetire={() => {
                setRetiring(false);
                request({ kind: 'retire' });
              }}
            />
          )}
          {ended && !leaving && <EndingPanel text={lastLog} onFinish={onFinish && (() => onFinish(state))} onRestart={restart} />}
          {/* 記録：パソコンでは3D画面の左下に半透明で重ねる（スマホでは出さず、いちばん新しい1行を3D画面の上に重ねる） */}
          <section className="explore__log-panel" aria-labelledby="explore-log">
            <h2 id="explore-log" className="panel__title">
              記録
            </h2>
            <LogList lines={recentLog} total={state.log.length} />
          </section>
        </div>

        <ExploreSide
          state={state}
          dungeon={dungeon}
          ended={ended}
          mpShake={mpShake}
          itemGroups={itemGroups}
          visibleEnemies={visibleEnemies}
          recentLog={recentLog}
          infoOpen={infoOpen}
          aiming={aiming}
          onInfo={showInfo}
          onCast={chooseSpell}
          onAimStart={aimStart}
          onAimDir={turnTo}
          onAimRelease={aimRelease}
          onSkill={useSkillNow}
          onSwap={swapNow}
          onUseItem={(item) => request({ kind: 'use_item', item })}
          onCloseInfo={() => setInfoOpen(false)}
          onSuspend={onSuspend && (() => onSuspend())}
          onRetire={() => {
            setInfoOpen(false);
            setRetiring(true);
          }}
        />
      </div>
    </main>
  );
}
