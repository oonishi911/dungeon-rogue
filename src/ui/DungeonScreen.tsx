import { enemyHitDamage, playerHitDamage } from '../game/combat';
import { ENEMIES, ITEMS, TRAITS } from '../game/data';
import type { ExpeditionState } from '../game/expedition';
import type { CombatAction, ItemId } from '../game/types';

interface DungeonScreenProps {
  state: ExpeditionState;
  error: string | null;
  onAction: (action: CombatAction) => void;
  onFinish: () => void;
}

const USABLE: ItemId[] = ['potion', 'antidote', 'frost_scroll'];

export function DungeonScreen({ state, error, onAction, onFinish }: DungeonScreenProps) {
  const { combat } = state;
  const player = combat.player;
  const enemy = ENEMIES[combat.enemy.id];
  const ended = state.outcome !== 'ongoing';
  const bossFloor = state.floors.length - 1;
  const floorName = state.floor === bossFloor ? '最深部' : `地下${state.floor + 1}階`;

  // 準備の成果が見えるように、耐性が効いているかを表示する
  const armor = player.armor ? ITEMS[player.armor] : null;
  const resisted = enemy.element !== undefined && armor?.resist === enemy.element;
  const incoming = enemyHitDamage(player, enemy);

  const counts = USABLE.map((id) => ({ id, n: player.consumables.filter((c) => c === id).length })).filter(
    (c) => c.n > 0,
  );

  return (
    <main className="screen">
      <header className="top">
        <div>
          <p className="top__run">倒した敵 {state.defeated}体</p>
          <h1 className="top__title">{floorName}</h1>
        </div>
        <Depth state={state} />
      </header>

      <div className="arena">
        <section className="fighter fighter--enemy" aria-labelledby="enemy-name">
          <div className="fighter__head">
            <h2 id="enemy-name" className="fighter__name">
              {enemy.name}
            </h2>
            {enemy.element && (
              <span className={`element element--${enemy.element}`}>{TRAITS[enemy.element].name}</span>
            )}
          </div>
          <Bar label="HP" value={combat.enemy.hp} max={enemy.hp} tone="enemy" />
          <p className="fighter__note">
            一撃で受けるダメージ {incoming}
            {resisted && `（${armor!.name}で軽減中）`}
            {enemy.element === 'poison' && !resisted && '＋毒'}
          </p>
          <p className="fighter__note">こちらの一撃 {playerHitDamage(player, enemy)}</p>
        </section>

        <section className="fighter" aria-labelledby="you-name">
          <div className="fighter__head">
            <h2 id="you-name" className="fighter__name">
              あなた
            </h2>
            {player.poisonTurns > 0 && <span className="element element--poison">毒 残り{player.poisonTurns}</span>}
          </div>
          <Bar label="HP" value={player.hp} max={player.maxHp} tone="you" />
          <p className="fighter__note">
            装備：{[player.weapon, player.armor].filter(Boolean).map((id) => ITEMS[id!].name).join('、') || 'なし'}
          </p>
        </section>
      </div>

      {ended ? (
        <section className="ending" aria-live="polite">
          <p className="ending__text">{state.outcome === 'cleared' ? 'ダンジョンを踏破した' : '力尽きた…'}</p>
          <button type="button" className="primary primary--wide" onClick={onFinish}>
            結果を見る
          </button>
        </section>
      ) : (
        <section className="actions" aria-label="行動">
          <button type="button" className="primary primary--wide" onClick={() => onAction({ kind: 'attack' })}>
            攻撃する
          </button>
          {counts.map(({ id, n }) => (
            <button
              key={id}
              type="button"
              className="item-btn"
              onClick={() => onAction({ kind: 'use_item', item: id })}
            >
              <span className="item-btn__name">
                {ITEMS[id].name}を使う <span className="item-btn__count">残り{n}</span>
              </span>
              <span className="item-btn__desc">{ITEMS[id].description}</span>
            </button>
          ))}
        </section>
      )}

      <p className="error" role="alert">
        {error ?? ''}
      </p>

      <section className="panel log" aria-labelledby="dlog-heading">
        <h2 id="dlog-heading" className="panel__title">戦いの記録</h2>
        <ul className="log__list log__list--tall">
          {[...state.log]
            .reverse()
            .slice(0, 30)
            .map((line, i) => (
              <li key={state.log.length - i}>{line}</li>
            ))}
        </ul>
      </section>
    </main>
  );
}

function Bar({ label, value, max, tone }: { label: string; value: number; max: number; tone: 'enemy' | 'you' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="bar">
      <span className="bar__label">
        {label} <strong>{value}</strong> / {max}
      </span>
      <span
        className={`bar__track bar__track--${tone}`}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <span className="bar__fill" style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

/** フロアごとの進み具合。倒した敵は塗りつぶし、今戦っている敵は枠付き */
function Depth({ state }: { state: ExpeditionState }) {
  return (
    <ol className="depth" aria-label="ダンジョンの進み具合">
      {state.floors.map((enemies, f) => {
        const isBoss = f === state.floors.length - 1;
        return (
          <li key={f} className={`depth__floor${f === state.floor ? ' is-current' : ''}`}>
            <span className="depth__label">{isBoss ? 'ボス' : `${f + 1}階`}</span>
            <span className="depth__dots">
              {enemies.map((_, i) => {
                const done = f < state.floor || (f === state.floor && (i < state.index || state.outcome === 'cleared'));
                const now = f === state.floor && i === state.index && state.outcome !== 'cleared';
                return (
                  <span
                    key={i}
                    className={`dot${isBoss ? ' dot--boss' : ''}${done ? ' is-done' : ''}${now ? ' is-now' : ''}`}
                  />
                );
              })}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
