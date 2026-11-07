// ダンジョンの探索画面。マップを歩き、敵と戦い、道具を使う。
// ゲーム本体では準備フェーズの持ち物で始まり、開発用には ?view=explore で単独でも開ける。
//
// 操作はすべて「意図」として記録し、毎フレームの処理で、前の1歩の動きが終わっていれば1つ実行する。
// キーを押し続けたときの歩く速さが、OS のキーリピートの設定に左右されず一定になる。

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { playFootstep, preloadSounds } from '../audio/sound';
import { BODY_NAMES, ITEMS, TRAIT_IDS, TRAITS } from '../game/data';
import { enemyDef, key } from '../game/enemies';
import {
  DIR_DELTA,
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
import { SoundButton } from './SoundButton';
import { walkPath, walkToward } from '../game/path';
import type { ItemId } from '../game/types';
import {
  CELL,
  drawMinimap,
  drawView,
  ENEMY_MARK,
  MINI_CELL,
  motionOf,
  readColors,
  viewOrigin,
  VIEW_H,
  VIEW_W,
  type Frame,
  type Motion,
} from './exploreRender';
import { DungeonView3D } from './explore3d';
import { chooseDirection, knobOffset, STICK, stickDirections } from './stick';
import { tilesetFor } from './tileset';

// ミニマップの元の大きさ（px）がこれ以下なら、拡大してもぼかさずドットのまま見せる。
// これより大きい（広いマップ）と縮めて表示するので、ドットのままだと細い通路が消えてしまう
const MINI_SHARP_MAX = 96;

// 1マス動くのにかける時間。なぞり続けたとき・タップで歩くときの速さもこれで決まる（1秒に約3.7マス）
const STEP_MS = 270;
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

const KEY_ACTIONS: Record<string, ExploreAction> = {
  ' ': { kind: 'wait' },
  '.': { kind: 'wait' },
};

const newSeed = () => Math.floor(Math.random() * 2 ** 31);
// ?seed=123 で同じ階層を再現できる（不具合の再現や見た目の確認用）
const urlSeed = Number(new URLSearchParams(location.search).get('seed'));
// ?rank=3 でランクを指定できる（広いマップの確認用）
const urlRank = Number(new URLSearchParams(location.search).get('rank')) || 1;
// ?trait=fire でダンジョン特性を指定できる（タイル素材の確認用）
const traitParam = new URLSearchParams(location.search).get('trait');
const urlTrait = TRAIT_IDS.find((t) => t === traitParam);
// ?render=2d で、以前の2D表示に切り替えられる（3D表示との見比べ用）
const urlRender: RenderMode = new URLSearchParams(location.search).get('render') === '2d' ? '2d' : '3d';

export type RenderMode = '2d' | '3d';

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
const DEV_LOADOUT: ItemId[] = ['sword', 'plate', 'potion', 'potion', 'food', 'fire_whetstone', 'ice_whetstone'];

/** 開発用：準備フェーズを通さずに探索だけを試す。?seed=・?rank=・?trait=・?render= で条件を指定できる */
export function ExploreDevScreen() {
  return (
    <ExploreScreen
      renderMode={urlRender}
      start={() => startExplore(Number.isInteger(urlSeed) && urlSeed > 0 ? urlSeed : newSeed(), { loadout: DEV_LOADOUT, rank: urlRank, trait: urlTrait })}
    />
  );
}

interface ExploreScreenProps {
  start: () => ExploreState;
  run?: number; // 何回目の挑戦か。省略すると開発用の表示になる
  onFinish?: (state: ExploreState) => void; // 省略すると、終わったあと同じ条件でやり直せる
  renderMode?: RenderMode; // 省略すると3D表示（WebGL2 が使えない環境では2D表示）
}

/** WebGL2 が使えるか。Three.js の3D表示に必要 */
function webglAvailable(): boolean {
  try {
    return document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

export function ExploreScreen({ start, run: runNumber, onFinish, renderMode = '3d' }: ExploreScreenProps) {
  // 3D表示ができない環境（WebGL2 が使えない、準備に失敗した）では2D表示に切り替える
  const [mode, setMode] = useState<RenderMode>(() => (renderMode === '3d' && webglAvailable() ? '3d' : '2d'));
  const [state, setState] = useState<ExploreState>(start);
  // スマホで、装備・敵・記録をまとめた画面を開いているか（PCでは常に横に出ている）
  const [infoOpen, setInfoOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);

  // 毎フレームの処理と入力の処理は、React の再描画を待たずに最新の値を使えるよう ref に持つ
  const stateRef = useRef(state);
  const motionRef = useRef<{ from: Motion; start: number }>({ from: motionOf(state), start: 0 });
  const heldRef = useRef<Dir[]>([]); // 押し続けている方向（あとから押したものが優先）
  const queueRef = useRef<ExploreAction[]>([]); // 次に1回ずつ行う行動（動いている途中に押した分）
  const walkRef = useRef<WalkGoal | null>(null); // タップ・クリックで向かっている先
  // 仮想スティックで進みたい向きの候補（斜めなら上下・左右の2つ）。1歩ごとに、進める向きを選び直す
  const stickRef = useRef<Dir[] | null>(null);
  const originRef = useRef<Pos>({ x: 0, y: 0 }); // 2D表示で今描いている画面の左上の座標（タップ位置の計算に使う）
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

  /** 行動を1つ行い、前の位置から新しい位置への動きを始める。行動にならなければ false */
  const perform = useCallback((action: ExploreAction): boolean => {
    const prev = stateRef.current;
    const result = step(prev, action);
    if (!result.ok) {
      // 壁にぶつかったときは知らせない（なぞって歩いていると何度もぶつかるので、うるさいだけ）
      const bumped =
        action.kind === 'move' &&
        tileAt(prev.map, { x: prev.player.x + DIR_DELTA[action.dir].x, y: prev.player.y + DIR_DELTA[action.dir].y }) === 'wall';
      if (!bumped) setError(result.error);
      return false;
    }
    const next = result.value;
    // 攻撃したとき・攻撃されたときは、画面を少し拡大縮小し、ダメージの数字を出す（3D表示のみ）
    for (const hit of next.hits) {
      view3dRef.current?.hitPulse(hit.kind === 'dealt' ? 'attack' : 'hurt');
      view3dRef.current?.popDamage(hit.at, hit.amount, hit.kind);
    }
    // 同じ階で1歩進んだら足音を鳴らす（階を移ったとき・その場で戦ったときは鳴らさない）
    if (next.map === prev.map && !samePos(prev.player, next.player)) playFootstep(next.trait);
    // 階を移ったときは動かさずに切り替える
    motionRef.current = { from: motionOf(next.map === prev.map ? prev : next), start: performance.now() };
    stateRef.current = next;
    setError(null);
    setState(next);
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
    const colors = readColors();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let view3d: DungeonView3D | null = null;
    if (mode === '3d' && viewRef.current) {
      try {
        view3d = new DungeonView3D(viewRef.current);
      } catch {
        setMode('2d');
        return;
      }
    }
    view3dRef.current = view3d;
    // 3D表示は、Canvas の画面上の大きさに合わせて描く（スマホの縦長の画面でも引き伸ばさない）
    const canvas = viewRef.current;
    const observer =
      view3d && canvas
        ? new ResizeObserver(() => view3d!.resize(canvas.clientWidth, canvas.clientHeight))
        : null;
    if (observer && canvas) {
      observer.observe(canvas);
      view3d!.resize(canvas.clientWidth, canvas.clientHeight);
    }
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
      if (now - motionRef.current.start >= STEP_MS && stateRef.current.outcome === 'ongoing') {
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
        tileset: tilesetFor(current.trait),
      };
      if (view3d) {
        view3d.render(frame);
      } else if (viewRef.current) {
        originRef.current = viewOrigin(frame);
        drawView(viewRef.current, frame, colors);
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      observer?.disconnect();
      view3d?.dispose();
      view3dRef.current = null;
    };
  }, [perform, walkStep, mode]);

  // このダンジョンの足音を、最初の一歩から鳴るように読み込んでおく
  useEffect(() => preloadSounds(state.trait), [state.trait]);

  useEffect(() => {
    if (miniRef.current) drawMinimap(miniRef.current, state, readColors());
  }, [state]);

  // キーボード：方向キーは押している間ずっと歩く。そのほかのキーは押した回数だけ行う
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const dir = KEY_DIRS[key];
      if (dir) {
        e.preventDefault(); // 矢印キーでページがスクロールしないように
        if (!e.repeat) hold(dir);
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
  const onMapTap = (e: { clientX: number; clientY: number }) => {
    const s = stateRef.current;
    if (s.outcome !== 'ongoing') return;
    if (walkRef.current) {
      walkRef.current = null;
      return;
    }
    const target = mode === '3d' ? view3dRef.current?.pickTile(e.clientX, e.clientY) : pickTile2d(e);
    // 主人公をタップすると、その場で1ターン待つ
    const onHero = mode === '3d' ? view3dRef.current?.hitsPlayer(e.clientX, e.clientY) : target && samePos(target, s.player);
    if (onHero) {
      request({ kind: 'wait' });
      return;
    }
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

  /** 2D表示で、画面上の位置からマスを求める */
  const pickTile2d = (e: { clientX: number; clientY: number }): Pos | null => {
    const canvas = viewRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width; // 画面が狭いと Canvas は縮んで表示される
    return {
      x: Math.floor(originRef.current.x + ((e.clientX - rect.left) * scale) / CELL),
      y: Math.floor(originRef.current.y + ((e.clientY - rect.top) * scale) / CELL),
    };
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
            {runNumber ? `${runNumber}回目の挑戦` : '開発用'} ・ ランク{state.rank} ・ {state.turn}ターン ・ 倒した敵 {state.defeated}体 ・ 金貨{' '}
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
          <canvas
            // 2Dと3Dでは Canvas の描き方（コンテキスト）が違うので、切り替えたら作り直す
            key={mode}
            ref={viewRef}
            className={mode === '3d' ? 'explore__view explore__view--3d' : 'explore__view'}
            width={VIEW_W * CELL}
            height={VIEW_H * CELL}
            role="img"
            aria-label={`${floorName}の周囲。マスをタップするとそこまで歩き、指でなぞるとその向きに歩き続ける。主人公をタップするとその場で待つ。階段は踏むと降りる。${onStairs ? '足元に階段がある' : ''}`}
          />
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
          {ended && (
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
            <Meter label="HP" value={stats.hp} max={stats.maxHp} tone="hp" />
            <Meter label="満腹度" value={state.satiety} max={state.maxSatiety} tone="satiety" />
          </div>

          <div className="explore__controls">
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
                      title={ITEMS[g.id].description}
                    >
                      <span className="explore__key">{i + 1}</span>
                      {ITEMS[g.id].name}
                      {g.count > 1 && ` ×${g.count}`}
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
                武器：{stats.weapon ? ITEMS[stats.weapon].name : 'なし'}
                <br />
                防具：{stats.armor ? ITEMS[stats.armor].name : 'なし'}
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
              マスをタップするとそこまで歩く（敵をタップすると攻撃しに行く。歩いている途中にタップすると止まる）。画面を指でなぞると、なぞった向きに歩き続ける。主人公をタップするとその場で待つ。階段は踏むとそのまま降りる。キーボードでは矢印キー／WASDで移動、スペースで待つ、数字キーで道具を使う
            </p>
            <section className="explore__more-log" aria-label="記録">
              <h3 className="meter__head">記録</h3>
              <LogList lines={recentLog} total={state.log.length} />
            </section>
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

function Meter({ label, value, max, tone }: { label: string; value: number; max: number; tone: 'hp' | 'satiety' }) {
  return (
    <div className="meter">
      <div className="meter__head">
        <span>{label}</span>
        <span>
          {value} / {max}
        </span>
      </div>
      <div className={`meter__track meter__track--${tone}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
        <div className="meter__fill" style={{ width: `${(value / max) * 100}%` }} />
      </div>
    </div>
  );
}
