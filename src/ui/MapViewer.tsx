// 開発用：生成したマップを上から見て確かめる画面。?view=map で開く。
// ゲーム本体にはまだ組み込んでいない。

import { useEffect, useMemo, useRef, useState } from 'react';
import { findDeadEnds, generateFloor, MAP_CONFIG, type FloorMap } from '../game/map';

const CANVAS_PX = 800; // 長い辺の描画解像度。表示サイズはCSSで合わせる

const clampSize = (n: number) =>
  Math.min(MAP_CONFIG.maxSize, Math.max(MAP_CONFIG.minSize, Math.round(Number.isFinite(n) ? n : MAP_CONFIG.minSize)));

export function MapViewer() {
  const [seed, setSeed] = useState(1);
  const [width, setWidth] = useState(40);
  const [height, setHeight] = useState(40);
  const [showPath, setShowPath] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const map = useMemo(() => generateFloor(seed, { width: clampSize(width), height: clampSize(height) }), [seed, width, height]);
  const deadEnds = useMemo(() => findDeadEnds(map).length, [map]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) draw(canvas, map, showPath);
  }, [map, showPath]);

  const count = (kind: 'treasure' | 'elite') => map.features.filter((f) => f.kind === kind).length;

  return (
    <main className="screen">
      <header className="top">
        <div>
          <p className="top__run">開発用</p>
          <h1 className="top__title">マップ生成の確認</h1>
        </div>
      </header>

      <section className="mapview__controls" aria-label="生成の設定">
        <label>
          シード
          <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} />
        </label>
        <label>
          幅
          <input
            type="number"
            min={MAP_CONFIG.minSize}
            max={MAP_CONFIG.maxSize}
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            onBlur={() => setWidth(clampSize(width))}
          />
        </label>
        <label>
          高さ
          <input
            type="number"
            min={MAP_CONFIG.minSize}
            max={MAP_CONFIG.maxSize}
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
            onBlur={() => setHeight(clampSize(height))}
          />
        </label>
        <label className="mapview__check">
          <input type="checkbox" checked={showPath} onChange={(e) => setShowPath(e.target.checked)} />
          本道を表示
        </label>
        <button type="button" className="primary" onClick={() => setSeed(Math.floor(Math.random() * 2 ** 31))}>
          別のマップを作る
        </button>
      </section>

      <div className="mapview__body">
        <canvas
          ref={canvasRef}
          className="mapview__canvas"
          role="img"
          aria-label={`${map.width}×${map.height}マスのマップ`}
        />
        <dl className="facts mapview__facts">
          <div>
            <dt>広さ</dt>
            <dd>
              {map.width}×{map.height}
            </dd>
          </div>
          <div>
            <dt>小部屋</dt>
            <dd>{map.rooms.length}</dd>
          </div>
          <div>
            <dt>本道の長さ</dt>
            <dd>{map.mainPath.length - 1}歩</dd>
          </div>
          <div>
            <dt>通路のマス</dt>
            <dd>{map.tiles.filter((t) => t === 'floor').length}</dd>
          </div>
          <div>
            <dt>行き止まり</dt>
            <dd>{deadEnds}</dd>
          </div>
          <div>
            <dt>宝箱 / 強敵</dt>
            <dd>
              {count('treasure')} / {count('elite')}
            </dd>
          </div>
        </dl>
      </div>

      <ul className="mapview__legend">
        <li><span style={{ background: 'var(--hp-you)' }} />入口</li>
        <li><span style={{ background: 'var(--bone)' }} />階段</li>
        <li><span style={{ background: 'var(--procure)' }} />本道</li>
        <li><span style={{ background: 'var(--hp-enemy)' }} />宝箱</li>
        <li><span style={{ background: 'var(--fire)' }} />強敵</li>
      </ul>
    </main>
  );
}

function draw(canvas: HTMLCanvasElement, map: FloorMap, showPath: boolean) {
  const cell = Math.max(1, Math.floor(CANVAS_PX / Math.max(map.width, map.height)));
  canvas.width = map.width * cell;
  canvas.height = map.height * cell;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // 色は styles.css の変数から取る
  const css = getComputedStyle(document.documentElement);
  const color = (name: string) => css.getPropertyValue(name).trim();

  ctx.fillStyle = color('--pine-deep');
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color('--pine-line');
  map.tiles.forEach((t, i) => {
    if (t === 'floor') ctx.fillRect((i % map.width) * cell, Math.floor(i / map.width) * cell, cell, cell);
  });

  const mark = (x: number, y: number, fill: string, inset = 0) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x * cell + inset, y * cell + inset, cell - inset * 2, cell - inset * 2);
  };
  if (showPath) {
    const inset = Math.floor(cell / 3);
    for (const p of map.mainPath) mark(p.x, p.y, color('--procure'), inset);
  }
  for (const f of map.features) mark(f.pos.x, f.pos.y, color(f.kind === 'treasure' ? '--hp-enemy' : '--fire'));
  mark(map.start.x, map.start.y, color('--hp-you'));
  if (map.stairs) mark(map.stairs.x, map.stairs.y, color('--bone'));
}
