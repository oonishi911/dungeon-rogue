// 画面の切り替えと、ゲームロジック（純粋関数）の呼び出しだけを担当する。
// ルールはすべて src/game 側にあり、ここには書かない。
// 流れは「ダンジョンを選ぶ → 情報屋（informant.ts）→ 出発の準備（店。shop.ts）→ ダンジョン → 結果 → 次のダンジョンを選ぶ」。
// 金貨・買った持ち物・道具の倉庫はセーブデータに残り、店で買うたびに保存する。

import { useState } from 'react';
import { depart } from './game/depart';
import { dungeonOf } from './game/dungeons';
import { startExplore, toResult, traitForSeed } from './game/explore';
import { type ExploreResult, type ExploreState } from './game/exploreTypes';
import { packRun } from './game/runSave';
import { newSave, type SaveData } from './game/save';
import { startInformant, type InformantState, type Intel } from './game/informant';
import { departWith, fitKit, kitLoadout, returnWith } from './game/shop';
import type { Departure, ItemId } from './game/types';
import { clearRun, loadRun, loadSave, writeRun, writeSave } from './storage';
import { DungeonSelectScreen } from './ui/DungeonSelectScreen';
import { ExploreScreen } from './ui/ExploreScreen';
import { ResultScreen } from './ui/ResultScreen';
import { InformantScreen } from './ui/InformantScreen';
import { ShopScreen } from './ui/ShopScreen';

type Stage =
  | { kind: 'choose' } // 挑むダンジョンを選ぶ（挑戦の始まり）
  | { kind: 'informant'; talk: InformantState } // 情報屋との会話（ダンジョンの特性は、もう決まっている）
  | { kind: 'shop'; dungeon: string; seed: number; intel: readonly Intel[]; atEntry: readonly ItemId[] } // 出発の準備。intel：情報屋から聞いたこと、atEntry：店に入ったときに持っていたもの（店の並びを決める）
  | { kind: 'dungeon'; outcome: Departure; seed: number; resume?: ExploreState } // resume：前に中断した探索の続き
  | { kind: 'result'; outcome: Departure; expedition: ExploreResult; next: SaveData };

const newSeed = () => Math.floor(Math.random() * 2 ** 31);

/** 探索が終わったあとのセーブデータ：次の挑戦へ進め、持ち帰った金貨と、使わなかった道具を倉庫に戻す */
function saveAfter(save: SaveData, state: ExploreState): SaveData {
  return returnWith({ ...save, run: save.run + 1 }, toResult(state).goldBrought, state.stats.items);
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
      return (
        <DungeonSelectScreen
          run={save.run}
          onChoose={(dungeon) => {
            setSave(fitKit(save)); // 前の持ち物の選び方を、倉庫にある数に合わせる
            const seed = newSeed();
            setStage({ kind: 'informant', talk: startInformant(dungeon, seed, traitForSeed(seed)) });
          }}
        />
      );
    case 'informant': {
      const { talk } = stage;
      return (
        <InformantScreen
          run={save.run}
          dungeonName={dungeonOf(talk.dungeon).name}
          state={talk}
          save={save}
          onChange={(next, paid) => {
            setSave(paid);
            writeSave(paid); // 払った情報料は、すぐ保存する
            setStage({ kind: 'informant', talk: next });
          }}
          onLeave={() => setStage({ kind: 'shop', dungeon: talk.dungeon, seed: talk.seed, intel: talk.heard, atEntry: save.owned })}
        />
      );
    }
    case 'shop':
      return (
        <ShopScreen
          run={save.run}
          dungeonName={dungeonOf(stage.dungeon).name}
          intel={stage.intel}
          atEntry={stage.atEntry}
          save={save}
          onChange={(next) => {
            setSave(next);
            writeSave(next);
          }}
          onDepart={() => {
            // 持っていく道具を倉庫から出し、出発した時点で「次の挑戦」として保存する（途中で再読み込みしても、同じ挑戦をやり直せないように）
            const base = departWith(save);
            writeSave({ ...base, run: base.run + 1 });
            setSave(base);
            setStage({ kind: 'dungeon', outcome: depart(stage.seed, stage.dungeon, kitLoadout(save)), seed: stage.seed });
          }}
        />
      );
    case 'dungeon': {
      const { outcome, seed, resume } = stage;
      return (
        <ExploreScreen
          key={`${save.run}-${seed}`}
          run={save.run}
          // 選んだダンジョンと、出発で決まった特性・持ち物で探索を始める。前に中断した探索があれば、その続きから
          start={() => resume ?? startExplore(seed, { dungeon: outcome.dungeon, trait: outcome.trait, loadout: outcome.loadout })}
          // 1手ごとに途中の状態を保存する（戻る・再読み込み・ページが閉じられたときに、続きから遊べるように）。
          // 探索が終わったら、金貨と道具を戻した記録を保存して、途中の状態は消す（結果の画面へ進む前に閉じても、持ち帰った分が残るように）
          onProgress={(state) => {
            if (state.outcome === 'ongoing') {
              writeRun(packRun(save, outcome, seed, state));
            } else {
              writeSave(saveAfter(save, state));
              clearRun();
            }
          }}
          guardBack
          onFinish={(state) => {
            const next = saveAfter(save, state);
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
          gold={stage.next.gold}
          onNextRun={() => {
            setSave(stage.next);
            setStage({ kind: 'choose' });
          }}
        />
      );
  }
}
