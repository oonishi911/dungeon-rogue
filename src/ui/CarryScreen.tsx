import { useState } from 'react';
import { CARDS, ITEMS, PREP_CONFIG } from '../game/data';
import type { PrepState } from '../game/types';
import { Card } from './Card';

interface CarryScreenProps {
  state: PrepState;
  error: string | null;
  onDepart: (keepUids: string[]) => void;
}

/** 余ったカードを次の周回に持ち越すか、捨てるかを選ぶ */
export function CarryScreen({ state, error, onDepart }: CarryScreenProps) {
  const [keep, setKeep] = useState<string[]>([]);
  const full = keep.length >= PREP_CONFIG.maxCarry;

  const toggle = (uid: string) =>
    setKeep((k) => (k.includes(uid) ? k.filter((u) => u !== uid) : full ? k : [...k, uid]));

  return (
    <main className="screen screen--narrow">
      <header className="top">
        <div>
          <h1 className="top__title">出発の朝</h1>
          <p className="lead">
            余ったカードを次の挑戦に持ち越せる。持ち越した分だけ、次に新しく引ける枚数は減る。
          </p>
        </div>
      </header>

      <section className="panel" aria-labelledby="carry-heading">
        <h2 id="carry-heading" className="panel__title">
          持ち越すカードを選ぶ（{keep.length}／{PREP_CONFIG.maxCarry}枚）
        </h2>
        {state.hand.length === 0 ? (
          <p className="muted">余ったカードはない。</p>
        ) : (
          <div className="hand__cards">
            {state.hand.map((c) => {
              const selected = keep.includes(c.uid);
              return (
                <Card
                  key={c.uid}
                  cardId={c.cardId}
                  selected={selected}
                  disabled={!selected && full}
                  onClick={() => toggle(c.uid)}
                  ariaLabel={`${CARDS[c.cardId].name}を${selected ? '持ち越す（選択中）' : '持ち越す'}`}
                />
              );
            })}
          </div>
        )}
        <p className="muted">選ばなかったカードは捨てる。</p>
      </section>

      <section className="panel" aria-labelledby="bag-heading">
        <h2 id="bag-heading" className="panel__title">ダンジョンに持っていくもの</h2>
        <p>{state.inventory.length ? state.inventory.map((id) => ITEMS[id].name).join('、') : '何も持っていない'}</p>
      </section>

      <p className="error" role="alert">
        {error ?? ''}
      </p>
      <button type="button" className="primary primary--wide" onClick={() => onDepart(keep)}>
        ダンジョンへ出発する
      </button>
    </main>
  );
}
