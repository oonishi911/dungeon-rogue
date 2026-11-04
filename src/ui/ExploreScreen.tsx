// ダンジョンの探索画面。マップを歩き、敵と戦い、道具を使う。
// ゲーム本体では準備フェーズの持ち物で始まり、開発用には ?view=explore で単独でも開ける。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BODY_NAMES, ITEMS, TRAITS } from '../game/data';
import { enemyDef, type EnemyMode, type MapEnemy } from '../game/enemies';
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
import type { ItemId } from '../game/types';
import { drawSprite } from '../sprites/canvas';
import { CLOAKS } from '../sprites/data';
import { cloakOf, ENEMY_LOOKS } from '../sprites/looks';

const VIEW_W = 21; // 画面に映すマス数（主人公が中央に来るよう奇数）
const VIEW_H = 15;
const CELL = 32; // ドット絵が32×32なので、1マス32px
const MINI_CELL = 3;

const KEY_ACTIONS: Record<string, ExploreAction> = {
  ArrowUp: { kind: 'move', dir: 'up' },
  ArrowDown: { kind: 'move', dir: 'down' },
  ArrowLeft: { kind: 'move', dir: 'left' },
  ArrowRight: { kind: 'move', dir: 'right' },
  w: { kind: 'move', dir: 'up' },
  s: { kind: 'move', dir: 'down' },
  a: { kind: 'move', dir: 'left' },
  d: { kind: 'move', dir: 'right' },
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

/** 敵の頭上に出すマークと、文字で伝える状態 */
const ENEMY_MARK: Record<EnemyMode, { mark: string; text: string }> = {
  wander: { mark: '…', text: '気付いていない（不意打ちできる）' },
  chase: { mark: '!', text: '追ってくる' },
  search: { mark: '?', text: '見失って探している' },
};

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

  const run = useCallback(
    (action: ExploreAction) => {
      const result = step(state, action);
      setError(result.ok ? null : result.error);
      if (result.ok) setState(result.value);
    },
    [state],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      // 数字キーで持ち物の上から順に使う
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= itemGroups.length) {
        e.preventDefault();
        run({ kind: 'use_item', item: itemGroups[n - 1]!.id });
        return;
      }
      const action = KEY_ACTIONS[e.key];
      if (!action) return;
      e.preventDefault(); // 矢印キーやスペースでページがスクロールしないように
      run(action);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run, itemGroups]);

  useEffect(() => {
    if (viewRef.current) drawView(viewRef.current, state, visible);
    if (miniRef.current) drawMinimap(miniRef.current, state);
  }, [state, visible]);

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
            aria-label={`${floorName}の周囲。${onStairs ? '足元に階段がある' : ''}`}
          />
          {ended && (
            <div className="explore__ending">
              <p>{state.log.at(-1)}</p>
              {onFinish ? (
                <button type="button" className="primary" onClick={() => onFinish(state)}>
                  結果を見る
                </button>
              ) : (
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    setError(null);
                    setState(start());
                  }}
                >
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
                      onClick={() => run({ kind: 'use_item', item: g.id })}
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
            <PadButton dir="up" label="↑" run={run} disabled={ended} />
            <PadButton dir="left" label="←" run={run} disabled={ended} />
            <button type="button" className="pad__btn pad__wait" onClick={() => run({ kind: 'wait' })} disabled={ended}>
              待つ
            </button>
            <PadButton dir="right" label="→" run={run} disabled={ended} />
            <PadButton dir="down" label="↓" run={run} disabled={ended} />
          </div>
          <button type="button" className="primary" onClick={() => run({ kind: 'descend' })} disabled={!onStairs || ended}>
            階段を降りる
          </button>
          <p className="muted">矢印キー／WASDで移動、スペースで待つ、Enterで階段を降りる、数字キーで道具を使う</p>
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

function PadButton({ dir, label, run, disabled }: { dir: Dir; label: string; run: (a: ExploreAction) => void; disabled: boolean }) {
  return (
    <button
      type="button"
      className={`pad__btn pad__${dir}`}
      onClick={() => run({ kind: 'move', dir })}
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

// ===== 描画 =====

function cssColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** 主人公を中心に、周りのマスを描く。見えていないマスは霧、一度見たマスは暗く描く */
function drawView(canvas: HTMLCanvasElement, state: ExploreState, visible: Set<number>) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { map, player, seen } = state;
  const colors = {
    fog: cssColor('--fog'),
    floor: cssColor('--pine-deep'),
    wall: cssColor('--pine-line'),
    wallTop: cssColor('--wall-top'),
    stairs: cssColor('--bone'),
    treasure: cssColor('--hp-enemy'),
    elite: cssColor('--fire'),
    boss: cssColor('--procure'),
    notice: cssColor('--hp-enemy'),
    calm: cssColor('--bone-dim'),
    hp: cssColor('--hp-enemy'),
  };
  const originX = player.x - Math.floor(VIEW_W / 2);
  const originY = player.y - Math.floor(VIEW_H / 2);

  ctx.fillStyle = colors.fog;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let vy = 0; vy < VIEW_H; vy++) {
    for (let vx = 0; vx < VIEW_W; vx++) {
      const x = originX + vx;
      const y = originY + vy;
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      const i = y * map.width + x;
      if (!seen[i]) continue;
      const px = vx * CELL;
      const py = vy * CELL;
      if (map.tiles[i] === 'wall') {
        ctx.fillStyle = colors.wall;
        ctx.fillRect(px, py, CELL, CELL);
        ctx.fillStyle = colors.wallTop;
        ctx.fillRect(px, py, CELL, 4);
      } else {
        ctx.fillStyle = colors.floor;
        ctx.fillRect(px, py, CELL, CELL);
      }
      if (map.stairs && x === map.stairs.x && y === map.stairs.y) drawStairs(ctx, px, py, colors.stairs);
      // まだ空になっていない宝箱だけを描く
      if (state.chests.some((c) => c.pos.x === x && c.pos.y === y)) drawChest(ctx, px, py, colors.treasure, colors.fog);
      // 一度見たが今は見えていないマスは暗くする
      if (!visible.has(i)) {
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = colors.fog;
        ctx.fillRect(px, py, CELL, CELL);
        ctx.globalAlpha = 1;
      }
    }
  }

  // 敵は今見えているマスにいるものだけ描く
  for (const e of state.enemies) {
    if (!visible.has(e.pos.y * map.width + e.pos.x)) continue;
    const px = (e.pos.x - originX) * CELL;
    const py = (e.pos.y - originY) * CELL;
    if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
    drawEnemy(ctx, e, px, py, colors);
  }

  drawSprite(ctx, 'hero', Math.floor(VIEW_W / 2) * CELL, Math.floor(VIEW_H / 2) * CELL, CELL, CLOAKS[cloakOf(state.stats.armor)]);
}

function drawEnemy(
  ctx: CanvasRenderingContext2D,
  enemy: MapEnemy,
  px: number,
  py: number,
  colors: Record<'elite' | 'boss' | 'notice' | 'calm' | 'hp' | 'fog', string>,
) {
  if (enemy.elite) {
    // 強敵は赤い枠、ボスは金の二重枠で囲む
    const boss = enemyDef(enemy).boss === true;
    ctx.strokeStyle = boss ? colors.boss : colors.elite;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, CELL - 2, CELL - 2);
    if (boss) ctx.strokeRect(px - 2, py - 2, CELL + 4, CELL + 4);
  }
  const look = ENEMY_LOOKS[enemy.id];
  drawSprite(ctx, look.sprite, px, py, CELL, look.recolor);

  const def = enemyDef(enemy);
  if (enemy.hp < def.hp) {
    ctx.fillStyle = colors.fog;
    ctx.fillRect(px + 3, py + CELL - 5, CELL - 6, 3);
    ctx.fillStyle = colors.hp;
    ctx.fillRect(px + 3, py + CELL - 5, Math.max(1, Math.round((CELL - 6) * (enemy.hp / def.hp))), 3);
  }

  // 頭上のマーク。気付いた瞬間の「！」だけ大きく強調する
  const big = enemy.justNoticed;
  ctx.font = `900 ${big ? 22 : 14}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 3;
  ctx.strokeStyle = colors.fog;
  ctx.fillStyle = enemy.mode === 'wander' ? colors.calm : colors.notice;
  const mx = px + CELL / 2;
  const my = py + (big ? 6 : 4);
  ctx.strokeText(ENEMY_MARK[enemy.mode].mark, mx, my);
  ctx.fillText(ENEMY_MARK[enemy.mode].mark, mx, my);
}

function drawChest(ctx: CanvasRenderingContext2D, px: number, py: number, color: string, line: string) {
  const m = CELL / 4;
  ctx.fillStyle = color;
  ctx.fillRect(px + m, py + m + 2, CELL - m * 2, CELL - m * 2 - 2);
  // ふたの線と留め金
  ctx.fillStyle = line;
  ctx.fillRect(px + m, py + m + 7, CELL - m * 2, 2);
  ctx.fillRect(px + CELL / 2 - 2, py + m + 9, 4, 4);
}

function drawStairs(ctx: CanvasRenderingContext2D, px: number, py: number, color: string) {
  ctx.fillStyle = color;
  for (let k = 0; k < 4; k++) {
    const inset = 4 + k * 3;
    ctx.fillRect(px + inset, py + 6 + k * 6, CELL - inset * 2, 3);
  }
}

function drawMinimap(canvas: HTMLCanvasElement, state: ExploreState) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { map, seen, player } = state;
  ctx.fillStyle = cssColor('--fog');
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = cssColor('--pine-line');
  map.tiles.forEach((t, i) => {
    if (t === 'floor' && seen[i]) ctx.fillRect((i % map.width) * MINI_CELL, Math.floor(i / map.width) * MINI_CELL, MINI_CELL, MINI_CELL);
  });
  if (map.stairs && seen[map.stairs.y * map.width + map.stairs.x]) {
    ctx.fillStyle = cssColor('--bone');
    ctx.fillRect(map.stairs.x * MINI_CELL - 1, map.stairs.y * MINI_CELL - 1, MINI_CELL + 2, MINI_CELL + 2);
  }
  ctx.fillStyle = cssColor('--hp-you');
  ctx.fillRect(player.x * MINI_CELL - 1, player.y * MINI_CELL - 1, MINI_CELL + 2, MINI_CELL + 2);
}
