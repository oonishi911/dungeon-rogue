import { CARDS, ITEMS, TRAITS } from '../game/data';
import { EXPEDITION_CONFIG, type ExpeditionResult } from '../game/expedition';
import type { PrepResult } from '../game/types';
import { knowledgeText } from './PrepScreen';

interface ResultScreenProps {
  run: number;
  outcome: PrepResult;
  expedition: ExpeditionResult;
  onNextRun: () => void;
}

export function ResultScreen({ run, outcome, expedition, onNextRun }: ResultScreenProps) {
  const cleared = expedition.outcome === 'cleared';
  const bossFloor = EXPEDITION_CONFIG.floors + 1;
  const where =
    expedition.floorReached === bossFloor ? 'ボスの前' : `${expedition.floorReached}階`;

  return (
    <main className="screen screen--narrow">
      <header className="top">
        <div>
          <p className="top__run">{run}回目の挑戦</p>
          <h1 className="top__title">{cleared ? 'ダンジョンを踏破した' : `${where}で力尽きた`}</h1>
        </div>
      </header>

      <section className="panel reveal" aria-labelledby="reveal-heading">
        <h2 id="reveal-heading" className="panel__title">ダンジョンの正体</h2>
        <p className="reveal__trait">{TRAITS[outcome.trait].name}のダンジョンだった</p>
        <dl className="facts">
          <div>
            <dt>出発前の情報</dt>
            <dd>{knowledgeText(outcome.knowledge)}</dd>
          </div>
          <div>
            <dt>持っていったもの</dt>
            <dd>{outcome.loadout.length ? outcome.loadout.map((id) => ITEMS[id].name).join('、') : 'なし'}</dd>
          </div>
          <div>
            <dt>倒した敵</dt>
            <dd>{expedition.enemiesDefeated}体</dd>
          </div>
          <div>
            <dt>次に持ち越すカード</dt>
            <dd>{outcome.carried.length ? outcome.carried.map((c) => CARDS[c.cardId].name).join('、') : 'なし'}</dd>
          </div>
        </dl>
      </section>

      <button type="button" className="primary primary--wide" onClick={onNextRun}>
        次の挑戦を始める
      </button>
    </main>
  );
}
