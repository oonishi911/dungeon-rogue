// 画面の切り替えと、ゲームロジック（純粋関数）の呼び出しだけを担当する。
// ルールはすべて src/game 側にあり、ここには書かない。
// 流れは「ダンジョンを選ぶ → ダンジョン → 結果 → 次のダンジョンを選ぶ」。持ち物は、出発するときにダンジョンに合わせて決まる（depart.ts）

import { useState } from 'react';
import { depart } from './game/depart';
import { startExplore, toResult, type ExploreResult, type ExploreState } from './game/explore';
import { packRun } from './game/runSave';
import { newSave, type SaveData } from './game/save';
import type { Departure } from './game/types';
import { clearRun, loadRun, loadSave, writeRun, writeSave } from './storage';
import { DungeonSelectScreen } from './ui/DungeonSelectScreen';
import { ExploreScreen } from './ui/ExploreScreen';
import { ResultScreen } from './ui/ResultScreen';

type Stage =
  | { kind: 'choose' } // 挑むダンジョンを選ぶ（挑戦の始まり）
  | { kind: 'dungeon'; outcome: Departure; seed: number; resume?: ExploreState } // resume：前に中断した探索の続き
  | { kind: 'result'; outcome: Departure; expedition: ExploreResult; next: SaveData };

const newSeed = () => Math.floor(Math.random() * 2 ** 31);

/** 次の挑戦のセーブデータ */
function nextSave(save: SaveData): SaveData {
  return { ...save, run: save.run + 1 };
}

/** ダンジョンを選んだあと。出発した時点で「次の挑戦」として保存してから、ダンジョンを始める（途中で再読み込みしても、同じ挑戦をやり直せないように） */
function stageAfterChoosing(save: SaveData, dungeon: string): Stage {
  const seed = newSeed();
  writeSave(nextSave(save));
  return { kind: 'dungeon', outcome: depart(seed, dungeon), seed };
}

/** 開いたときの始まり。探索の途中で閉じていれば（戻る・再読み込みなど）、その続きから始める */
function firstLoad(): { save: SaveData; stage: Stage } {
  const run = loadRun();
  if (run) return { save: run.base, stage: { kind: 'dungeon', outcome: run.outcome, seed: run.seed, resume: run.state } };
  return { save: loadSave() ?? newSave(), stage: { kind: 'choose' } };
}

export function App() {
  const [first] = useState(firstLoad);
  const [save, setSave] = useState<SaveData>(first.save);
  const [stage, setStage] = useState<Stage>(first.stage);

  switch (stage.kind) {
    case 'choose':
      return <DungeonSelectScreen run={save.run} onChoose={(dungeon) => setStage(stageAfterChoosing(save, dungeon))} />;
    case 'dungeon': {
      const { outcome, seed, resume } = stage;
      return (
        <ExploreScreen
          key={`${save.run}-${seed}`}
          run={save.run}
          // 選んだダンジョンと、出発で決まった特性・持ち物で探索を始める。前に中断した探索があれば、その続きから
          start={() => resume ?? startExplore(seed, { dungeon: outcome.dungeon, trait: outcome.trait, loadout: outcome.loadout })}
          // 1手ごとに途中の状態を保存する（戻る・再読み込み・ページが閉じられたときに、続きから遊べるように）。
          // 探索が終わったら、途中の状態は消す（結果の画面へ進む前に閉じても、次の挑戦から始まるように）
          onProgress={(state) => {
            if (state.outcome === 'ongoing') writeRun(packRun(save, outcome, seed, state));
            else clearRun();
          }}
          guardBack
          onFinish={(state) => {
            const next = nextSave(save);
            writeSave(next);
            clearRun();
            setStage({ kind: 'result', outcome, expedition: toResult(state), next });
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
          onNextRun={() => {
            setSave(stage.next);
            setStage({ kind: 'choose' });
          }}
        />
      );
  }
}
