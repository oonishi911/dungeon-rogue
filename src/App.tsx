// 画面の切り替えと、ゲームロジック（純粋関数）の呼び出しだけを担当する。
// ルールはすべて src/game 側にあり、ここには書かない。

import { useState } from 'react';
import { PREP_CONFIG } from './game/data';
import { startExplore, toResult, type ExploreResult } from './game/explore';
import { buyItem, createPrep, endDay, finishPrep, playCard, upgradeRank } from './game/prep';
import { newSave, type SaveData } from './game/save';
import type { ItemId, PrepResult, PrepState, Result } from './game/types';
import { clearSave, loadSave, writeSave } from './storage';
import { CarryScreen } from './ui/CarryScreen';
import { ExploreScreen } from './ui/ExploreScreen';
import { PrepScreen } from './ui/PrepScreen';
import { ResultScreen } from './ui/ResultScreen';

type Stage =
  | { kind: 'prep'; prep: PrepState }
  | { kind: 'carry'; prep: PrepState }
  | { kind: 'dungeon'; outcome: PrepResult; seed: number }
  | { kind: 'result'; outcome: PrepResult; expedition: ExploreResult; next: SaveData };

const newSeed = () => Math.floor(Math.random() * 2 ** 31);

/** セーブデータ（持ち越したカード・持ち帰った金貨・ランク・経験）から準備フェーズを始める */
function prepFrom(save: SaveData): PrepState {
  return createPrep(newSeed(), save.carried, {
    startGold: PREP_CONFIG.startGold + save.bonusGold,
    rank: save.rank,
    exp: save.exp,
  });
}

/** 次の挑戦のセーブデータ。経験と金貨は探索の結果で決まるので、呼び出し側で上書きする */
function nextSave(save: SaveData, outcome: PrepResult): SaveData {
  return { ...save, run: save.run + 1, rank: outcome.rank, exp: outcome.exp, carried: outcome.carried, bonusGold: 0 };
}

export function App() {
  const [save, setSave] = useState<SaveData>(() => loadSave() ?? newSave());
  const [stage, setStage] = useState<Stage>(() => ({ kind: 'prep', prep: prepFrom(save) }));
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

  const begin = (next: SaveData) => {
    setSave(next);
    setError(null);
    setStage({ kind: 'prep', prep: prepFrom(next) });
  };

  switch (stage.kind) {
    case 'prep':
      return (
        <PrepScreen
          run={save.run}
          state={stage.prep}
          error={error}
          onPlay={(uid) => apply(playCard(stage.prep, uid))}
          onBuy={(item: ItemId) => apply(buyItem(stage.prep, item))}
          onUpgrade={() => apply(upgradeRank(stage.prep))}
          onEndDay={() => apply(endDay(stage.prep))}
          onReset={() => {
            clearSave();
            begin(newSave());
          }}
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
            // 出発した時点で「金貨なしで終わった」として先に保存しておく。
            // 探索の途中で再読み込みしても、準備からやり直せないようにするため
            writeSave(nextSave(save, outcome));
            setStage({ kind: 'dungeon', outcome, seed: stage.prep.seed });
          }}
        />
      );
    case 'dungeon': {
      const { outcome, seed } = stage;
      return (
        <ExploreScreen
          key={`${save.run}-${seed}`}
          run={save.run}
          // 準備で決まった特性・持ち物・ランクで探索を始める。階層の形は準備と同じシードから作る
          start={() =>
            startExplore(seed, { trait: outcome.trait, loadout: outcome.loadout, hasMap: outcome.hasMap, rank: outcome.rank })
          }
          onFinish={(state) => {
            const expedition = toResult(state);
            const next = {
              ...nextSave(save, outcome),
              exp: outcome.exp + (expedition.outcome === 'cleared' ? 1 : 0),
              bonusGold: expedition.goldBrought,
            };
            writeSave(next);
            setStage({ kind: 'result', outcome, expedition, next });
          }}
        />
      );
    }
    case 'result':
      return (
        <ResultScreen
          run={save.run}
          outcome={stage.outcome}
          expedition={stage.expedition}
          onNextRun={() => begin(stage.next)}
        />
      );
  }
}
