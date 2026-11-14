// 画面の切り替えと、ゲームロジック（純粋関数）の呼び出しだけを担当する。
// ルールはすべて src/game 側にあり、ここには書かない。

import { useState } from 'react';
import { PREP_CONFIG } from './game/data';
import { startExplore, toResult, type ExploreResult, type ExploreState } from './game/explore';
import { buyItem, createPrep, departWithoutPrep, endDay, finishPrep, playCard } from './game/prep';
import { packRun } from './game/runSave';
import { newSave, type SaveData } from './game/save';
import type { ItemId, PrepResult, PrepState, Result } from './game/types';
import { clearRun, clearSave, loadRun, loadSave, writeRun, writeSave } from './storage';
import { CarryScreen } from './ui/CarryScreen';
import { DungeonSelectScreen } from './ui/DungeonSelectScreen';
import { ExploreScreen } from './ui/ExploreScreen';
import { PrepScreen } from './ui/PrepScreen';
import { ResultScreen } from './ui/ResultScreen';

type Stage =
  | { kind: 'choose' } // 挑むダンジョンを選ぶ（挑戦の始まり）
  | { kind: 'prep'; prep: PrepState }
  | { kind: 'carry'; prep: PrepState }
  | { kind: 'dungeon'; outcome: PrepResult; seed: number; resume?: ExploreState } // resume：前に中断した探索の続き
  | { kind: 'result'; outcome: PrepResult; expedition: ExploreResult; next: SaveData };

const newSeed = () => Math.floor(Math.random() * 2 ** 31);

// 準備フェーズを一旦飛ばす。true のあいだは、ダンジョンを選んだら、毎回そのダンジョンの特性に有利な装備と回復薬2つで、すぐダンジョンから始まる。
// 準備フェーズの画面とロジックは残してあるので、false に戻せば元の流れ（ダンジョンを選ぶ → 準備 → 出発の朝 → ダンジョン → 結果）になる
const SKIP_PREP = true;

/** セーブデータ（持ち越したカード・持ち帰った金貨）から、選んだダンジョンの準備フェーズを始める */
function prepFrom(save: SaveData, dungeon: string): PrepState {
  return createPrep(newSeed(), save.carried, {
    startGold: PREP_CONFIG.startGold + save.bonusGold,
    dungeon,
  });
}

/** 次の挑戦のセーブデータ。金貨は探索の結果で決まるので、呼び出し側で上書きする */
function nextSave(save: SaveData, outcome: PrepResult): SaveData {
  return { ...save, run: save.run + 1, carried: outcome.carried, bonusGold: 0 };
}

/** 挑戦の始まり。まず、挑むダンジョンを選ぶ */
function firstStage(): Stage {
  return { kind: 'choose' };
}

/** ダンジョンを選んだあと。準備フェーズを飛ばしているときは、出発した時点で保存してダンジョンから始める */
function stageAfterChoosing(save: SaveData, dungeon: string): Stage {
  if (!SKIP_PREP) return { kind: 'prep', prep: prepFrom(save, dungeon) };
  const seed = newSeed();
  const outcome = departWithoutPrep(seed, save, dungeon);
  writeSave(nextSave(save, outcome));
  return { kind: 'dungeon', outcome, seed };
}

/** 開いたときの始まり。探索の途中で閉じていれば（戻る・再読み込みなど）、その続きから始める */
function firstLoad(): { save: SaveData; stage: Stage } {
  const run = loadRun();
  if (run) return { save: run.base, stage: { kind: 'dungeon', outcome: run.outcome, seed: run.seed, resume: run.state } };
  const save = loadSave() ?? newSave();
  return { save, stage: firstStage() };
}

/** 探索の結果を入れた、次の挑戦のセーブデータ */
function saveAfter(save: SaveData, outcome: PrepResult, expedition: ExploreResult): SaveData {
  return { ...nextSave(save, outcome), bonusGold: expedition.goldBrought };
}

export function App() {
  const [first] = useState(firstLoad);
  const [save, setSave] = useState<SaveData>(first.save);
  const [stage, setStage] = useState<Stage>(first.stage);
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
    setStage(firstStage());
  };

  switch (stage.kind) {
    case 'choose':
      return <DungeonSelectScreen run={save.run} onChoose={(dungeon) => setStage(stageAfterChoosing(save, dungeon))} />;
    case 'prep':
      return (
        <PrepScreen
          run={save.run}
          state={stage.prep}
          error={error}
          onPlay={(uid) => apply(playCard(stage.prep, uid))}
          onBuy={(item: ItemId) => apply(buyItem(stage.prep, item))}
          onEndDay={() => apply(endDay(stage.prep))}
          onReset={() => {
            clearSave();
            clearRun();
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
      const { outcome, seed, resume } = stage;
      return (
        <ExploreScreen
          key={`${save.run}-${seed}`}
          run={save.run}
          // 選んだダンジョンと、準備で決まった特性・持ち物で探索を始める。階層の形は準備と同じシードから作る
          // 前に中断した探索があれば、その続きから
          start={() =>
            resume ??
            startExplore(seed, { dungeon: outcome.dungeon, trait: outcome.trait, loadout: outcome.loadout, hasMap: outcome.hasMap })
          }
          // 1手ごとに途中の状態を保存する（戻る・再読み込み・ページが閉じられたときに、続きから遊べるように）。
          // 探索が終わったら、その時点で結果を記録して、途中の状態は消す（結果の画面へ進む前に閉じても、結果が残るように）
          onProgress={(state) => {
            if (state.outcome === 'ongoing') {
              writeRun(packRun(save, outcome, seed, state));
            } else {
              writeSave(saveAfter(save, outcome, toResult(state)));
              clearRun();
            }
          }}
          guardBack
          onFinish={(state) => {
            const expedition = toResult(state);
            const next = saveAfter(save, outcome, expedition);
            writeSave(next);
            clearRun();
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
