// 画面の切り替えと、ゲームロジック（純粋関数）の呼び出しだけを担当する。
// ルールはすべて src/game 側にあり、ここには書かない。

import { useState } from 'react';
import { advance, startExpedition, toResult, type ExpeditionResult, type ExpeditionState } from './game/expedition';
import { buyItem, createPrep, endDay, finishPrep, playCard } from './game/prep';
import type { CardInstance, ItemId, PrepResult, PrepState, Result } from './game/types';
import { CarryScreen } from './ui/CarryScreen';
import { DungeonScreen } from './ui/DungeonScreen';
import { PrepScreen } from './ui/PrepScreen';
import { ResultScreen } from './ui/ResultScreen';

type Stage =
  | { kind: 'prep'; prep: PrepState }
  | { kind: 'carry'; prep: PrepState }
  | { kind: 'dungeon'; outcome: PrepResult; expedition: ExpeditionState }
  | { kind: 'result'; outcome: PrepResult; expedition: ExpeditionResult };

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

  const startNextRun = (carried: CardInstance[]) => {
    setRun((r) => r + 1);
    setError(null);
    setStage({ kind: 'prep', prep: createPrep(newSeed(), carried) });
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
            const outcome = result.value;
            const expedition = startExpedition(outcome.loadout, outcome.trait, stage.prep.seed);
            setStage({ kind: 'dungeon', outcome, expedition });
          }}
        />
      );
    case 'dungeon':
      return (
        <DungeonScreen
          state={stage.expedition}
          error={error}
          onAction={(action) => {
            const result = advance(stage.expedition, action);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setError(null);
            setStage({ ...stage, expedition: result.value });
          }}
          onFinish={() =>
            setStage({ kind: 'result', outcome: stage.outcome, expedition: toResult(stage.expedition) })
          }
        />
      );
    case 'result':
      return (
        <ResultScreen
          run={run}
          outcome={stage.outcome}
          expedition={stage.expedition}
          onNextRun={() => startNextRun(stage.outcome.carried)}
        />
      );
  }
}
