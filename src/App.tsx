// 画面の切り替えと、ゲームロジック（純粋関数）の呼び出しだけを担当する。
// ルールはすべて src/game 側にあり、ここには書かない。
//
// 今はダンジョンを固めるため、準備フェーズを流れから外している（src/game/prep.ts と画面は残してある）。
// 流れは「ダンジョン → 結果 → 次の挑戦」で、毎回決まった持ち物で始める。

import { useState } from 'react';
import { STARTING_LOADOUT } from './game/data';
import { startExplore, toResult, type ExploreResult } from './game/explore';
import { newSave, type SaveData } from './game/save';
import type { TraitId } from './game/types';
import { loadSave, writeSave } from './storage';
import { ExploreScreen } from './ui/ExploreScreen';
import { ResultScreen } from './ui/ResultScreen';

type Stage =
  | { kind: 'dungeon'; seed: number }
  | { kind: 'result'; trait: TraitId; expedition: ExploreResult; next: SaveData };

const newSeed = () => Math.floor(Math.random() * 2 ** 31);

export function App() {
  const [save, setSave] = useState<SaveData>(() => loadSave() ?? newSave());
  const [stage, setStage] = useState<Stage>(() => ({ kind: 'dungeon', seed: newSeed() }));

  switch (stage.kind) {
    case 'dungeon':
      return (
        <ExploreScreen
          key={`${save.run}-${stage.seed}`}
          run={save.run}
          start={() => startExplore(stage.seed, { loadout: STARTING_LOADOUT, rank: save.rank })}
          onFinish={(state) => {
            const expedition = toResult(state);
            const next: SaveData = {
              ...save,
              run: save.run + 1,
              exp: save.exp + (expedition.outcome === 'cleared' ? 1 : 0),
            };
            writeSave(next);
            setStage({ kind: 'result', trait: state.trait, expedition, next });
          }}
        />
      );
    case 'result':
      return (
        <ResultScreen
          run={save.run}
          trait={stage.trait}
          loadout={STARTING_LOADOUT}
          expedition={stage.expedition}
          onNextRun={() => {
            setSave(stage.next);
            setStage({ kind: 'dungeon', seed: newSeed() });
          }}
        />
      );
  }
}
