// ダンジョンの探索画面。マップを歩き、敵と戦い、道具を使う。
// ゲーム本体では出発で決まった持ち物（depart.ts）で始まり、開発用には ?view=explore で単独でも開ける（ExploreDevScreen.tsx）。
//
// 操作はすべて「意図」として記録し、毎フレームの処理で、前の1歩の動きが終わっていれば1つ実行する。
// キーを押し続けたときの歩く速さが、OS のキーリピートの設定に左右されず一定になる。
//
// このファイルは操作と毎フレームの進行を受け持つ。ほかは次のファイルに分けてある：
//   exploreFeedback.ts 1手ごとの音・振動・3D の演出 / exploreKeys.ts キーの割り当て / exploreWalk.ts タップで歩く判断
//   ExploreSide.tsx 右側（下）の欄 / ExploreDialogs.tsx 重ねて出す確かめる画面 / ExploreParts.tsx ゲージと記録 / backGuard.ts 戻るの見張り

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { preloadSounds, setAmbient } from '../audio/sound';
import { SPELLS } from '../game/data';
import { dungeonOfState, isBossFloor, step, upStairs } from '../game/explore';
import { DIR_DELTA, EXPLORE_CONFIG, type Dir, type ExploreAction, type ExploreState } from '../game/exploreTypes';
import { samePos, visibleTiles } from '../game/exploreSight';
import { tileAt, type Pos } from '../game/map';
import { SoundButton } from './SoundButton';
import { walkPath, walkToward } from '../game/path';
import type { ItemId, SpellId } from '../game/types';
import { useBackGuard } from './backGuard';
import { drawMinimap, MINI_CELL, motionOf, readColors, type Frame, type Motion } from './exploreRender';
import { DungeonView3D, webglAvailable } from './explore3d';
import { devBestHref } from './exploreDev';
import { EndingPanel, LeaveDialog, RetireDialog } from './ExploreDialogs';
import { playFeedback } from './exploreFeedback';
import { KEY_ACTIONS, KEY_DIRS, SPELL_KEYS } from './exploreKeys';
import { LogList } from './ExploreParts';
import { ExploreSide } from './ExploreSide';
import { avoidOnWalk, visibleEnemyIds, type WalkGoal } from './exploreWalk';
import { chooseDirection, knobOffset, STICK, stickDirections } from './stick';

// ミニマップの元の大きさ（px）がこれ以下なら、拡大してもぼかさずドットのまま見せる。
// これより大きい（広いマップ）と縮めて表示するので、ドットのままだと細い通路が消えてしまう
const MINI_SHARP_MAX = 96;

// 1マス動くのにかける時間。なぞり続けたとき・タップで歩くときの速さもこれで決まる（1秒に約2.6マス。以前の270ミリ秒から、速さを3割落とした）
const STEP_MS = 385;
const DOUBLE_TAP_MS = 350; // この時間（ミリ秒）以内に主人公を2回タップすると、ダブルタップとしてその場で待つ
const QUEUE_MAX = 2; // 動いている途中に押した操作を、いくつまで覚えておくか（多すぎると指を止めても歩き続ける）

interface ExploreScreenProps {
  start: () => ExploreState;
  run?: number; // 何回目の挑戦か。省略すると開発用の表示になる
  onFinish?: (state: ExploreState) => void; // 省略すると、終わったあと同じ条件でやり直せる
  onProgress?: (state: ExploreState) => void; // 始まったときと、行動するたびに呼ぶ（途中の状態を保存するため）
  guardBack?: boolean; // ブラウザの「戻る」を一度受け止めて、ページを離れるかを確かめる
  devBest?: boolean; // 開発用画面で、いちばん強い装備で試しているか（切り替えのリンクを出す）
}

export function ExploreScreen({ start, run: runNumber, onFinish, onProgress, guardBack = false, devBest }: ExploreScreenProps) {
  // 3D表示ができない環境（WebGL2 が使えない、3D表示を作れなかった）では、遊べないことを伝える
  const [no3d, setNo3d] = useState(() => !webglAvailable());
  const [state, setState] = useState<ExploreState>(start);
  // スマホで、装備・敵・記録をまとめた画面を開いているか（PCでは常に横に出ている）
  const [infoOpen, setInfoOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mpShake, setMpShake] = useState(0); // 魔力が足りずに唱えられなかった回数（魔力のゲージを震わせる）
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
    // 音・振動・3D 画面の演出を始める。呪文を唱えたときは、矢が当たるまで次の行動を待たせる
    const impactMs = playFeedback(prev, next, view3dRef.current);
    if (next.cast) busyUntilRef.current = performance.now() + impactMs;
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

  /** タップ・クリックで向かっている先へ1歩進む。着いた・進めない・攻撃したら止まる（敵が見えても立ち止まらない） */
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
      }
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

  // ブラウザの「戻る」を一度受け止める（見張りの仕組みは backGuard.ts）
  const { leaving, stay, leave } = useBackGuard(guardBack);

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
          onCast={chooseSpell}
          onUseItem={(item) => request({ kind: 'use_item', item })}
          onCloseInfo={() => setInfoOpen(false)}
          onRetire={() => {
            setInfoOpen(false);
            setRetiring(true);
          }}
        />
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
