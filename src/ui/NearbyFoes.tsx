// 見えている敵の簡易表示（2026-11-23）：3D画面の左上に、近い順に4体まで、名前・HP・状態を小さく並べる。
// 2026-11-28：HPの数字と、弱点のアイコン（頭上の印と同じ。weakIcons.tsx）も出す。先頭の印（… ！ ？）は、気付いているかどうか
// 押すと、主人公がその敵の方を向く（1ターンも使わない。向きのある呪文を構えているときは、届く範囲もそちらへ向く）

import { enemyDef } from '../game/enemies';
import type { Dir, ExploreState } from '../game/exploreTypes';
import { dirToward } from '../game/exploreSight';
import { weakMarks } from '../game/weakness';
import { ENEMY_MARK } from './exploreRender';
import { WeakIcon } from './weakIcons';

/** 並べる敵の数 */
const MAX_FOES = 4;

export function NearbyFoes({ state, visible, onFace }: { state: ExploreState; visible: ReadonlySet<number>; onFace: (dir: Dir) => void }) {
  const near = (p: { x: number; y: number }) => Math.max(Math.abs(p.x - state.player.x), Math.abs(p.y - state.player.y));
  const foes = state.enemies
    .filter((e) => visible.has(e.pos.y * state.map.width + e.pos.x))
    .sort((a, b) => near(a.pos) - near(b.pos) || a.uid - b.uid)
    .slice(0, MAX_FOES);
  if (foes.length === 0) return null;
  return (
    <ul className="explore__foes" aria-label="見えている敵（押すと、その敵の方を向く）">
      {foes.map((e) => {
        const def = enemyDef(e);
        const rate = Math.max(0, Math.min(1, e.hp / def.hp));
        const states = [e.burn && '燃', e.frozen && '凍', e.silenced && '静', e.asleep && '眠', e.bleed && '血'].filter(Boolean) as string[];
        const weak = weakMarks(def);
        return (
          <li key={e.uid}>
            <button
              type="button"
              className={`explore__foe explore__foe--${e.mode}${def.boss ? ' explore__foe--boss' : e.elite ? ' explore__foe--elite' : ''}`}
              onClick={() => {
                const dir = dirToward(state.player, e.pos);
                if (dir) onFace(dir);
              }}
              aria-label={`${def.name}（HP ${e.hp}/${def.hp}、${ENEMY_MARK[e.mode].text}${states.length ? `、${states.join('・')}` : ''}）の方を向く`}
            >
              <span className="explore__foe-mark" aria-hidden="true" title={ENEMY_MARK[e.mode].text}>
                {ENEMY_MARK[e.mode].mark}
              </span>
              <span className="explore__foe-name">{def.name.replace('（強敵）', '')}</span>
              {states.length > 0 && (
                <span className="explore__foe-states-mini" aria-hidden="true">
                  {states.join('')}
                </span>
              )}
              {weak.length > 0 && (
                <span className="explore__foe-weak" aria-hidden="true">
                  {weak.map((m) => (
                    <WeakIcon key={m.icon} id={m.icon} className="explore__foe-weak-icon" />
                  ))}
                </span>
              )}
              <span className="explore__foe-hp" aria-hidden="true">
                <span style={{ width: `${rate * 100}%` }} />
              </span>
              <span className="explore__foe-hp-num" aria-hidden="true">
                {e.hp}
                <small>/{def.hp}</small>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
