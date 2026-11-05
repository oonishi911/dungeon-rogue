// ダンジョンの探索画面。マップを歩き、敵と戦い、道具を使う。
// ゲーム本体では準備フェーズの持ち物で始まり、開発用には ?view=explore で単独でも開ける。
//
// 操作はすべて「意図」として記録し、毎フレームの処理で、前の1歩の動きが終わっていれば1つ実行する。
// キーを押し続けたときの歩く速さが、OS のキーリピートの設定に左右されず一定になる。

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { BODY_NAMES, ITEMS, TRAIT_IDS, TRAITS } from '../game/data';
import { enemyDef } from '../game/enemies';
import {
  EXPLORE_CONFIG,
  isBossFloor,
  samePos,
  startExplore,
  step,
  visibleTiles,
  type Dir,
  type ExploreAction,
  type ExploreState,
} from '../game/explore';
import type { Pos } from '../game/map';
import { walkToward } from '../game/path';
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
import { padDirection } from './dpad';
import { DungeonView3D } from './explore3d';
import { tilesetFor } from './tileset';

const STEP_MS = 120; // 1マス動くのにかける時間。押し続けたときの歩く速さもこれで決まる
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
  Enter: { kind: 'descend' },
  '>': { kind: 'descend' },
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
  // スマホで、装備・敵・地図・記録をまとめた「情報」を開いているか（PCでは常に横に出ている）
  const [infoOpen, setInfoOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);

  // 毎フレームの処理と入力の処理は、React の再描画を待たずに最新の値を使えるよう ref に持つ
  const stateRef = useRef(state);
  const motionRef = useRef<{ from: Motion; start: number }>({ from: motionOf(state), start: 0 });
  const heldRef = useRef<Dir[]>([]); // 押し続けている方向（あとから押したものが優先）
  const queueRef = useRef<ExploreAction[]>([]); // 次に1回ずつ行う行動（動いている途中に押した分）
  const walkRef = useRef<Pos | null>(null); // タップ・クリックで向かっている場所
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
      setError(result.error);
      return false;
    }
    const next = result.value;
    // 階を移ったときは動かさずに切り替える
    motionRef.current = { from: motionOf(next.map === prev.map ? prev : next), start: performance.now() };
    stateRef.current = next;
    setError(null);
    setState(next);
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
        } else if (walkRef.current) {
          const before = stateRef.current.player;
          const action = walkToward(stateRef.current, walkRef.current);
          // 着いた・進めない・敵を攻撃した（その場から動かなかった）ときは止まる
          if (!action || !perform(action) || samePos(before, stateRef.current.player)) walkRef.current = null;
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
        walkTarget: walkRef.current,
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
  }, [perform, mode]);

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

  /** マップをタップ・クリックすると、そのマスまで歩く */
  const onMapClick = (e: { clientX: number; clientY: number }) => {
    const target = mode === '3d' ? view3dRef.current?.pickTile(e.clientX, e.clientY) : pickTile2d(e);
    if (!target) return;
    const s = stateRef.current;
    if (s.outcome !== 'ongoing' || samePos(target, s.player)) return;
    const i = target.y * s.map.width + target.x;
    const known = target.x >= 0 && target.y >= 0 && target.x < s.map.width && target.y < s.map.height && s.seen[i];
    if (!known || s.map.tiles[i] === 'wall') {
      setError('まだ見ていない場所や壁へは移動できない');
      return;
    }
    heldRef.current = [];
    queueRef.current = [];
    walkRef.current = target;
    setError(null);
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
      </header>

      <div className="explore">
        <div className="explore__stage">
          <canvas
            // 2Dと3Dでは Canvas の描き方（コンテキスト）が違うので、切り替えたら作り直す
            key={mode}
            ref={viewRef}
            className={mode === '3d' ? 'explore__view explore__view--3d' : 'explore__view'}
            width={VIEW_W * CELL}
            height={VIEW_H * CELL}
            role="img"
            aria-label={`${floorName}の周囲。マスをクリックするとそこまで歩く。${onStairs ? '足元に階段がある' : ''}`}
            onClick={onMapClick}
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
            <DirectionPad hold={hold} release={release} onStep={(dir) => request({ kind: 'move', dir })} disabled={ended} />
            <div className="explore__actions">
              <button type="button" className="primary explore__descend" onClick={() => request({ kind: 'descend' })} disabled={!onStairs || ended}>
                階段を降りる
              </button>
              <button type="button" className="explore__wait" onClick={() => request({ kind: 'wait' })} disabled={ended}>
                その場で待つ
              </button>
              <button
                type="button"
                className="explore__wait explore__info-toggle"
                aria-expanded={infoOpen}
                aria-controls="explore-more"
                onClick={() => setInfoOpen(true)}
              >
                装備・敵・地図
              </button>
            </div>
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

          <p className="error" role="alert">
            {error}
          </p>

          {/* スマホでは画面に収まらないので、ふだんは隠して「装備・敵・地図」で重ねて開く */}
          <div id="explore-more" className={`explore__more${infoOpen ? ' explore__more--open' : ''}`}>
            <div className="explore__more-head">
              <h2 className="panel__title">装備・敵・地図</h2>
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

            <canvas
              ref={miniRef}
              className="explore__mini"
              width={state.map.width * MINI_CELL}
              height={state.map.height * MINI_CELL}
              role="img"
              aria-label="この階の地図（歩いて見えた範囲）"
            />

            <p className="muted explore__help">
              十字の上を指でなぞると、その向きに歩き続ける。マスをタップするとそこまで歩く。キーボードでは矢印キー／WASDで移動、スペースで待つ、Enterで階段を降りる、数字キーで道具を使う
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

const DIR_LABELS: Record<Dir, { arrow: string; name: string }> = {
  up: { arrow: '▲', name: '上へ' },
  down: { arrow: '▼', name: '下へ' },
  left: { arrow: '◀', name: '左へ' },
  right: { arrow: '▶', name: '右へ' },
};

/**
 * 十字キー。パッド全体で1本の指を追い、中心から見た指の向きに歩き続ける。
 * 指を離さずに滑らせれば向きを変えられるので、4つの小さなボタンを押し分けるより狙いやすい。
 * キーボードでは、中のボタンを Enter・スペースで1歩ずつ押せる（歩き続けるには矢印キーを使う）
 */
function DirectionPad({
  hold,
  release,
  onStep,
  disabled,
}: {
  hold: (d: Dir) => void;
  release: (d: Dir) => void;
  onStep: (d: Dir) => void;
  disabled: boolean;
}) {
  const [active, setActive] = useState<Dir | null>(null);
  const activeRef = useRef<Dir | null>(null);
  const pointerRef = useRef<number | null>(null);

  const aim = (dir: Dir | null) => {
    const prev = activeRef.current;
    if (prev === dir) return;
    if (prev) release(prev);
    if (dir) hold(dir);
    activeRef.current = dir;
    setActive(dir);
  };

  const track = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    aim(padDirection(dx, dy, rect.width / 2));
  };

  const end = () => {
    pointerRef.current = null;
    aim(null);
  };

  // 探索が終わったら、押しっぱなしの向きを忘れる
  useEffect(() => {
    if (disabled) end();
  }, [disabled]);

  return (
    <div
      className={`dpad${disabled ? ' dpad--disabled' : ''}`}
      role="group"
      aria-label="移動"
      onPointerDown={(e) => {
        if (disabled || pointerRef.current !== null) return;
        e.preventDefault();
        pointerRef.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        track(e);
      }}
      onPointerMove={(e) => {
        if (e.pointerId === pointerRef.current) track(e);
      }}
      onPointerUp={(e) => {
        if (e.pointerId === pointerRef.current) end();
      }}
      onPointerCancel={(e) => {
        if (e.pointerId === pointerRef.current) end();
      }}
      onLostPointerCapture={(e) => {
        if (e.pointerId === pointerRef.current) end();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {(Object.keys(DIR_LABELS) as Dir[]).map((dir) => (
        <button
          key={dir}
          type="button"
          className={`dpad__btn dpad__${dir}${active === dir ? ' dpad__btn--on' : ''}`}
          aria-label={DIR_LABELS[dir].name}
          disabled={disabled}
          // 指やマウスはパッド全体で受けるので、ボタンはキーボードで押されたときだけ動かす
          onClick={(e) => {
            if (e.detail === 0) onStep(dir);
          }}
        >
          {DIR_LABELS[dir].arrow}
        </button>
      ))}
      <span className="dpad__hub" aria-hidden="true" />
    </div>
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
