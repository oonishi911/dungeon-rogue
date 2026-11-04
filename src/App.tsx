// 画面の切り替えと、ゲームロジック（純粋関数）の呼び出しだけを担当する。
// ルールはすべて src/game 側にあり、ここには書かない。

import { useState } from 'react';
import { startExplore, toResult, type ExploreResult } from './game/explore';
import { PREP_CONFIG } from './game/data';
import { buyItem, createPrep, endDay, finishPrep, playCard } from './game/prep';
import type { CardInstance, ItemId, PrepResult, PrepState, Result } from './game/types';
import { CarryScreen } from './ui/CarryScreen';
import { ExploreScreen } from './ui/ExploreScreen';
import { PrepScreen } from './ui/PrepScreen';
import { ResultScreen } from './ui/ResultScreen';

type Stage =
  | { kind: 'prep'; prep: PrepState }
  | { kind: 'carry'; prep: PrepState }
  | { kind: 'dungeon'; outcome: PrepResult; seed: number }
  | { kind: 'result'; outcome: PrepResult; expedition: ExploreResult };

const newSeed = () => Math.floor(Math.random() * 2 ** 31);

export function App() {
  const [run, setRun] = useState(1);
  const [stage, setStage] = useState<Stage>(() => ({ kind: 'prep', prep: createPrep(newSeed()) }));
  const [error, setError] = useState<string | null>(null);

  // ロジックの Result を受け取り、成功なら状態を更新、失敗ならメッセージを出す
  const apply = (result: Result<PrepState>) => {
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    const prep = result.value;
    setStage(prep.phase === 'ready' ? { kind: 'carry', prep } : { kind: 'prep', prep });
  };

  // 持ち越したカードと、持ち帰った金貨を次の準備に引き継ぐ
  const startNextRun = (carried: CardInstance[], goldBrought: number) => {
    setRun((r) => r + 1);
    setError(null);
    setStage({ kind: 'prep', prep: createPrep(newSeed(), carried, { startGold: PREP_CONFIG.startGold + goldBrought }) });
  };

  switch (stage.kind) {
    case 'prep':
      return (
        <PrepScreen
          run={run}
          state={stage.prep}
          error={error}
          onPlay={(uid) => apply(playCard(stage.prep, uid))}
          onBuy={(item: ItemId) => apply(buyItem(stage.prep, item))}
          onEndDay={() => apply(endDay(stage.prep))}
        />
      );
    case 'carry':
      return (
        <CarryScreen
          state={stage.prep}
          error={error}
          onDepart={(keepUids) => {
            const result = finishPrep(stage.prep, keepUids);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setError(null);
            setStage({ kind: 'dungeon', outcome: result.value, seed: stage.prep.seed });
          }}
        />
      );
    case 'dungeon': {
      const { outcome, seed } = stage;
      return (
        <ExploreScreen
          key={`${run}-${seed}`}
          run={run}
          // 準備で決まった特性と持ち物で探索を始める。階層の形は準備と同じシードから作る
          start={() => startExplore(seed, { trait: outcome.trait, loadout: outcome.loadout, hasMap: outcome.hasMap })}
          onFinish={(state) => setStage({ kind: 'result', outcome, expedition: toResult(state) })}
        />
      );
    }
    case 'result':
      return (
        <ResultScreen
          run={run}
          outcome={stage.outcome}
          expedition={stage.expedition}
          onNextRun={() => startNextRun(stage.outcome.carried, stage.expedition.goldBrought)}
        />
      );
  }
}
