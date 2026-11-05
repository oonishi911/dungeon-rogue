import { ITEMS, TRAITS } from '../game/data';
import type { ExploreResult } from '../game/explore';
import type { ItemId, TraitId } from '../game/types';

interface ResultScreenProps {
  run: number;
  trait: TraitId;
  loadout: readonly ItemId[];
  expedition: ExploreResult;
  onNextRun: () => void;
}

export function ResultScreen({ run, trait, loadout, expedition, onNextRun }: ResultScreenProps) {
  const cleared = expedition.outcome === 'cleared';
  const where = expedition.bossFloor ? '最深部' : `地下${expedition.floorReached}階`;

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
        <p className="reveal__trait">{TRAITS[trait].name}のダンジョンだった</p>
        <dl className="facts">
          <div>
            <dt>持っていったもの</dt>
            <dd>{loadout.length ? loadout.map((id) => ITEMS[id].name).join('、') : 'なし'}</dd>
          </div>
          <div>
            <dt>倒した敵</dt>
            <dd>{expedition.defeated}体</dd>
          </div>
          <div>
            <dt>手に入れた金貨</dt>
            <dd>{expedition.gold}G</dd>
          </div>
        </dl>
      </section>

      <button type="button" className="primary primary--wide" onClick={onNextRun}>
        次の挑戦を始める
      </button>
    </main>
  );
}
