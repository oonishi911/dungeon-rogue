// 開発用：マップを歩いて探索と戦闘を確かめる画面。?view=explore で開く。
// 準備フェーズやゲーム本体にはまだ組み込んでいない。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EXPLORE_CONFIG, samePos, startExplore, step, visibleTiles, type Dir, type ExploreAction, type ExploreState } from '../game/explore';
import { enemyDef, type EnemyMode, type MapEnemy } from '../game/enemies';
import { drawSprite } from '../sprites/canvas';

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

/** 敵の頭上に出すマークと、文字で伝える状態 */
const ENEMY_MARK: Record<EnemyMode, { mark: string; text: string }> = {
  wander: { mark: '…', text: '気付いていない（不意打ちできる）' },
  chase: { mark: '!', text: '追ってくる' },
  search: { mark: '?', text: '見失って探している' },
};

export function ExploreScreen() {
  const [state, setState] = useState<ExploreState>(() => startExplore(Number.isInteger(urlSeed) && urlSeed > 0 ? urlSeed : newSeed()));
  const [error, setError] = useState<string | null>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);

  const visible = useMemo(
    () => visibleTiles(state.map, state.player, EXPLORE_CONFIG.sightRadius),
    [state.map, state.player],
  );

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
      const action = KEY_ACTIONS[e.key];
      if (!action) return;
      e.preventDefault(); // 矢印キーやスペースでページがスクロールしないように
      run(action);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run]);

  useEffect(() => {
    if (viewRef.current) drawView(viewRef.current, state, visible);
    if (miniRef.current) drawMinimap(miniRef.current, state);
  }, [state, visible]);

  const visibleEnemies = state.enemies.filter((e) => visible.has(e.pos.y * state.map.width + e.pos.x));
  const onStairs = samePos(state.player, state.map.stairs);
  const ended = state.outcome !== 'ongoing';
  const floorName = `地下${state.floor + 1}階`;

  return (
    <main className="screen">
      <header className="top">
        <div>
          <p className="top__run">
            開発用 ・ {state.turn}ターン ・ 倒した敵 {state.defeated}体
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
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setError(null);
                  setState(startExplore(newSeed()));
                }}
              >
                もう一度歩く
              </button>
            </div>
          )}
        </div>

        <aside className="explore__side">
          <Meter label="満腹度" value={state.satiety} max={state.maxSatiety} tone="satiety" />
          <Meter label="HP" value={state.stats.hp} max={state.stats.maxHp} tone="hp" />

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
                    {enemyDef(e).name}（HP {e.hp}）：{ENEMY_MARK[e.mode].text}
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
          <p className="muted">矢印キー／WASDで移動、スペースで待つ、Enterで階段を降りる</p>
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
      if (x === map.stairs.x && y === map.stairs.y) drawStairs(ctx, px, py, colors.stairs);
      // 強敵は敵として描くので、ここでは宝箱だけ
      const treasure = map.features.find((f) => f.kind === 'treasure' && f.pos.x === x && f.pos.y === y);
      if (treasure) {
        ctx.fillStyle = colors.treasure;
        const m = CELL / 4;
        ctx.fillRect(px + m, py + m, CELL - m * 2, CELL - m * 2);
      }
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

  drawSprite(ctx, 'hero', Math.floor(VIEW_W / 2) * CELL, Math.floor(VIEW_H / 2) * CELL, CELL);
}

function drawEnemy(
  ctx: CanvasRenderingContext2D,
  enemy: MapEnemy,
  px: number,
  py: number,
  colors: Record<'elite' | 'notice' | 'calm' | 'hp' | 'fog', string>,
) {
  if (enemy.elite) {
    // 強敵は赤い枠で囲む
    ctx.strokeStyle = colors.elite;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, CELL - 2, CELL - 2);
  }
  drawSprite(ctx, enemy.id, px, py, CELL);

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
  if (seen[map.stairs.y * map.width + map.stairs.x]) {
    ctx.fillStyle = cssColor('--bone');
    ctx.fillRect(map.stairs.x * MINI_CELL - 1, map.stairs.y * MINI_CELL - 1, MINI_CELL + 2, MINI_CELL + 2);
  }
  ctx.fillStyle = cssColor('--hp-you');
  ctx.fillRect(player.x * MINI_CELL - 1, player.y * MINI_CELL - 1, MINI_CELL + 2, MINI_CELL + 2);
}
