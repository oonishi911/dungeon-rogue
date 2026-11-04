// ダンジョンの探索画面。マップを歩き、敵と戦い、道具を使う。
// ゲーム本体では準備フェーズの持ち物で始まり、開発用には ?view=explore で単独でも開ける。
//
// 操作はすべて「意図」として記録し、毎フレームの処理で、前の1歩の動きが終わっていれば1つ実行する。
// キーを押し続けたときの歩く速さが、OS のキーリピートの設定に左右されず一定になる。

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { BODY_NAMES, ITEMS, TRAITS } from '../game/data';
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

// 開発用画面で持たせる装備と道具
const DEV_LOADOUT: ItemId[] = ['sword', 'plate', 'potion', 'potion', 'food', 'fire_whetstone', 'ice_whetstone'];

/** 開発用：準備フェーズを通さずに探索だけを試す。?seed=123 で同じ階層を再現できる */
export function ExploreDevScreen() {
  return (
    <ExploreScreen
      start={() => startExplore(Number.isInteger(urlSeed) && urlSeed > 0 ? urlSeed : newSeed(), { loadout: DEV_LOADOUT, rank: urlRank })}
    />
  );
}

interface ExploreScreenProps {
  start: () => ExploreState;
  run?: number; // 何回目の挑戦か。省略すると開発用の表示になる
  onFinish?: (state: ExploreState) => void; // 省略すると、終わったあと同じ条件でやり直せる
}

export function ExploreScreen({ start, run: runNumber, onFinish }: ExploreScreenProps) {
  const [state, setState] = useState<ExploreState>(start);
  const [error, setError] = useState<string | null>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);

  // 毎フレームの処理と入力の処理は、React の再描画を待たずに最新の値を使えるよう ref に持つ
  const stateRef = useRef(state);
  const motionRef = useRef<{ from: Motion; start: number }>({ from: motionOf(state), start: 0 });
  const heldRef = useRef<Dir[]>([]); // 押し続けている方向（あとから押したものが優先）
  const queueRef = useRef<ExploreAction[]>([]); // 次に1回ずつ行う行動（動いている途中に押した分）
  const walkRef = useRef<Pos | null>(null); // タップ・クリックで向かっている場所
  const originRef = useRef<Pos>({ x: 0, y: 0 }); // 今描いている画面の左上の座標（タップ位置の計算に使う）

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
      };
      originRef.current = viewOrigin(frame);
      if (viewRef.current) drawView(viewRef.current, frame, colors);
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [perform]);

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
    const canvas = viewRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width; // 画面が狭いと Canvas は縮んで表示される
    const target = {
      x: Math.floor(originRef.current.x + ((e.clientX - rect.left) * scale) / CELL),
      y: Math.floor(originRef.current.y + ((e.clientY - rect.top) * scale) / CELL),
    };
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

  return (
    <main className="screen">
      <header className="top">
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
            ref={viewRef}
            className="explore__view"
            width={VIEW_W * CELL}
            height={VIEW_H * CELL}
            role="img"
            aria-label={`${floorName}の周囲。マスをクリックするとそこまで歩く。${onStairs ? '足元に階段がある' : ''}`}
            onClick={onMapClick}
          />
          {ended && (
            <div className="explore__ending">
              <p>{state.log.at(-1)}</p>
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
          <Meter label="満腹度" value={state.satiety} max={state.maxSatiety} tone="satiety" />
          <Meter label="HP" value={stats.hp} max={stats.maxHp} tone="hp" />

          <section aria-labelledby="explore-gear">
            <h2 id="explore-gear" className="meter__head">
              装備と持ち物
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
            {itemGroups.length === 0 ? (
              <p className="muted">道具はない</p>
            ) : (
              <ul className="explore__items">
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
          </section>

          <section aria-labelledby="explore-enemies">
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

          <div className="pad" role="group" aria-label="操作">
            <PadButton dir="up" label="↑" hold={hold} release={release} disabled={ended} />
            <PadButton dir="left" label="←" hold={hold} release={release} disabled={ended} />
            <button type="button" className="pad__btn pad__wait" onClick={() => request({ kind: 'wait' })} disabled={ended}>
              待つ
            </button>
            <PadButton dir="right" label="→" hold={hold} release={release} disabled={ended} />
            <PadButton dir="down" label="↓" hold={hold} release={release} disabled={ended} />
          </div>
          <button type="button" className="primary" onClick={() => request({ kind: 'descend' })} disabled={!onStairs || ended}>
            階段を降りる
          </button>
          <p className="muted">
            矢印キー／WASDで移動（押し続けると歩き続ける）、マスをクリックするとそこまで歩く、スペースで待つ、Enterで階段を降りる、数字キーで道具を使う
          </p>
          <p className="error" role="alert">
            {error}
          </p>
        </aside>
      </div>

      <section aria-labelledby="explore-log">
        <h2 id="explore-log" className="panel__title">
          記録
        </h2>
        <ol className="explore__log">
          {state.log
            .slice(-8)
            .reverse()
            .map((line, i) => (
              <li key={state.log.length - i}>{line}</li>
            ))}
        </ol>
      </section>
    </main>
  );
}

/** 方向ボタン。押している間ずっと歩く（キーボードでは矢印キーを使う） */
function PadButton({
  dir,
  label,
  hold,
  release,
  disabled,
}: {
  dir: Dir;
  label: string;
  hold: (d: Dir) => void;
  release: (d: Dir) => void;
  disabled: boolean;
}) {
  const up = () => release(dir);
  return (
    <button
      type="button"
      className={`pad__btn pad__${dir}`}
      onPointerDown={(e: PointerEvent<HTMLButtonElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        hold(dir);
      }}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      disabled={disabled}
      aria-label={{ up: '上へ', down: '下へ', left: '左へ', right: '右へ' }[dir]}
    >
      {label}
    </button>
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
