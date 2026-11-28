// 画面の切り替えと、ゲームロジック（純粋関数）の呼び出しだけを担当する。
// ルールはすべて src/game 側にあり、ここには書かない。
// 流れは「ダンジョンを選ぶ → 情報屋（informant.ts）→ 出発の準備（店。shop.ts）→ ダンジョン → 結果 → 次のダンジョンを選ぶ」。
// 金貨・買った持ち物・道具の倉庫はセーブデータに残り、店で買うたびに保存する。
// 始めるときに、テクスチャと音をすべて読み込む（読み込み画面。preload.ts）。

import { useState } from 'react';
import { depart } from './game/depart';
import { dungeonOf } from './game/dungeons';
import { startExplore, step, toResult, traitForSeed } from './game/explore';
import { type ExploreResult, type ExploreState } from './game/exploreTypes';
import { packRun, type ResumedRun } from './game/runSave';
import { newSave, type SaveData } from './game/save';
import { bossOf, startInformant, type InformantState, type Intel } from './game/informant';
import { recall, toneOf, type Scene } from './game/story';
import { receiveLoot, kitEchoes, kitSubEchoes } from './game/engrave';
import { recordRun } from './game/records';
import { departWith, fitKit, kitLoadout, returnWith } from './game/shop';
import type { Departure, ItemId } from './game/types';
import { clearRun, loadRun, loadSave, writeRun, writeSave } from './storage';
import { BestiaryScreen } from './ui/BestiaryScreen';
import { DungeonSelectScreen } from './ui/DungeonSelectScreen';
import { ExploreScreen } from './ui/ExploreScreen';
import { ResultScreen } from './ui/ResultScreen';
import { InformantScreen } from './ui/InformantScreen';
import { LoadingScreen } from './ui/LoadingScreen';
import { MemoryScreen } from './ui/MemoryScreen';
import { NoticeScreen } from './ui/NoticeScreen';
import { ResumeScreen } from './ui/ResumeScreen';
import { ShopScreen } from './ui/ShopScreen';

type Stage =
  | { kind: 'choose' } // 挑むダンジョンを選ぶ（挑戦の始まり）
  | { kind: 'informant'; talk: InformantState; atEntry?: readonly ItemId[] } // 情報屋との会話（ダンジョンの特性は、もう決まっている）。atEntry：店から戻ってきたとき、最初に店に入ったときの持ち物（店の並びを変えないように）
  | { kind: 'shop'; dungeon: string; seed: number; intel: readonly Intel[]; atEntry: readonly ItemId[]; talk: InformantState } // talk：情報屋に戻ったときの会話の続き。 出発の準備。intel：情報屋から聞いたこと、atEntry：店に入ったときに持っていたもの（店の並びを決める）
  | { kind: 'resume'; run: ResumedRun } // 中断した探索の「続きから」の画面
  | { kind: 'dungeon'; outcome: Departure; seed: number; resume?: ExploreState } // resume：前に中断した探索の続き
  | { kind: 'memory'; scene: Scene; outcome: Departure; expedition: ExploreResult; next: SaveData } // ボスを倒した直後の記憶の画面（ストーリー。story.ts）
  | { kind: 'result'; outcome: Departure; expedition: ExploreResult; next: SaveData };

const newSeed = () => Math.floor(Math.random() * 2 ** 31);

/**
 * 探索が終わったあとのセーブデータ：次の挑戦へ進め、持ち帰った金貨と、使わなかった道具を倉庫に戻す。
 * ダンジョンを踏破したときは、倒したボスの記憶も戻る（出す場面も一緒に返す）。同じ入力からは、いつも同じ結果になる
 */
function saveAfter(save: SaveData, state: ExploreState, outcome: Departure): { save: SaveData; scene: Scene | null } {
  // 拾った刻印武器と残響は、力尽きても、リタイアしても、倉庫に入る（失わない）
  const result = toResult(state);
  const loot = receiveLoot(returnWith({ ...save, run: save.run + 1 }, result.goldBrought, state.stats.items), state.found);
  // ダンジョンごとの記録（挑んだ回数・いちばん深い階・踏破した回数）を足す
  const base = { ...loot, records: recordRun(loot.records, outcome.dungeon, result) };
  if (state.outcome !== 'cleared') return { save: base, scene: null };
  const got = recall(base, bossOf(outcome.dungeon, outcome.trait));
  return { save: got.save, scene: got.scene };
}

/** 開いたときの始まり。探索の途中で閉じていれば（戻る・再読み込みなど）、「続きから」の画面を出す */
function firstLoad(): { save: SaveData; stage: Stage } {
  const run = loadRun();
  if (run) return { save: run.base, stage: { kind: 'resume', run } };
  return { save: loadSave() ?? newSave(), stage: { kind: 'choose' } };
}

export function App() {
  const [first] = useState(firstLoad);
  const [save, setSave] = useState<SaveData>(first.save);
  const [stage, setStage] = useState<Stage>(first.stage);
  // テクスチャと音をすべて読み込むまでは、読み込み画面を出す（preload.ts）
  const [loaded, setLoaded] = useState(false);
  // 注意書き：最初に遊ぶときは必ず出す（読んだら進む）。あとからは、ダンジョンを選ぶ画面から読める
  const [notice, setNotice] = useState(!first.save.noticeSeen);
  // 敵の図鑑：ダンジョンを選ぶ画面から開く
  const [bestiaryOpen, setBestiaryOpen] = useState(false);
  if (!loaded) return <LoadingScreen onDone={() => setLoaded(true)} />;
  if (notice) {
    return (
      <NoticeScreen
        first={!save.noticeSeen}
        onClose={() => {
          if (!save.noticeSeen) {
            const seen = { ...save, noticeSeen: true };
            setSave(seen);
            writeSave(seen);
          }
          setNotice(false);
        }}
      />
    );
  }

  if (bestiaryOpen && stage.kind === 'choose') return <BestiaryScreen met={save.met} onClose={() => setBestiaryOpen(false)} />;

  switch (stage.kind) {
    case 'choose':
      return (
        <DungeonSelectScreen
          records={save.records}
          memories={save.memories}
          onNotice={() => setNotice(true)}
          onBestiary={() => setBestiaryOpen(true)}
          onChoose={(dungeon) => {
            setSave(fitKit(save)); // 前の持ち物の選び方を、倉庫にある数に合わせる
            const seed = newSeed();
            setStage({ kind: 'informant', talk: startInformant(dungeon, seed, traitForSeed(seed), toneOf(save.memories.length)) });
          }}
        />
      );
    case 'informant': {
      const { talk } = stage;
      return (
        <InformantScreen
          dungeonName={dungeonOf(talk.dungeon).name}
          state={talk}
          save={save}
          onChange={(next, paid) => {
            setSave(paid);
            writeSave(paid); // 払った情報料は、すぐ保存する
            setStage({ ...stage, talk: next });
          }}
          onLeave={() => setStage({ kind: 'shop', dungeon: talk.dungeon, seed: talk.seed, intel: talk.heard, atEntry: stage.atEntry ?? save.owned, talk })}
        />
      );
    }
    case 'shop':
      return (
        <ShopScreen
          dungeonName={dungeonOf(stage.dungeon).name}
          intel={stage.intel}
          atEntry={stage.atEntry}
          save={save}
          onChange={(next) => {
            setSave(next);
            writeSave(next);
          }}
          // 情報屋に戻って、もっと聞く（会話は続きから。店に入ったときの持ち物も覚えておく）
          onBack={() => setStage({ kind: 'informant', talk: stage.talk, atEntry: stage.atEntry })}
          onDepart={() => {
            // 持っていく道具を倉庫から出し、出発した時点で「次の挑戦」として保存する（途中で再読み込みしても、同じ挑戦をやり直せないように）
            const base = departWith(save);
            writeSave({ ...base, run: base.run + 1 });
            setSave(base);
            setStage({ kind: 'dungeon', outcome: depart(stage.seed, stage.dungeon, kitLoadout(save), kitEchoes(save), kitSubEchoes(save)), seed: stage.seed });
          }}
        />
      );
    case 'resume': {
      const { run } = stage;
      return (
        <ResumeScreen
          run={run}
          onContinue={() => setStage({ kind: 'dungeon', outcome: run.outcome, seed: run.seed, resume: run.state })}
          onGiveUp={() => {
            // リタイアしたことにして、持ち帰る分を数える（探索の画面のリタイアと同じ）
            const stepped = step(run.state, { kind: 'retire' });
            const ended = stepped.ok ? stepped.value : { ...run.state, outcome: 'retired' as const };
            const { save: next } = saveAfter(run.base, ended, run.outcome);
            setSave(next);
            writeSave(next);
            clearRun();
            setStage({ kind: 'result', outcome: run.outcome, expedition: toResult(ended), next });
          }}
        />
      );
    }
    case 'dungeon': {
      const { outcome, seed, resume } = stage;
      return (
        <ExploreScreen
          key={`${save.run}-${seed}`}
          run={save.run}
          // 選んだダンジョンと、出発で決まった特性・持ち物で探索を始める。前に中断した探索があれば、その続きから
          start={() => resume ?? startExplore(seed, { dungeon: outcome.dungeon, trait: outcome.trait, loadout: outcome.loadout, ...(outcome.echoes ? { echoes: outcome.echoes } : {}), ...(outcome.subEchoes ? { subEchoes: outcome.subEchoes } : {}) })}
          // 1手ごとに途中の状態を保存する（戻る・再読み込み・ページが閉じられたときに、続きから遊べるように）。
          // 探索が終わったら、金貨と道具を戻した記録を保存して、途中の状態は消す（結果の画面へ進む前に閉じても、持ち帰った分が残るように）
          onProgress={(state) => {
            if (state.outcome === 'ongoing') {
              writeRun(packRun(save, outcome, seed, state));
            } else {
              writeSave(saveAfter(save, state, outcome).save);
              clearRun();
            }
          }}
          guardBack
          // 「中断してもどる」：いまの状態は1手ごとに保存してあるので、保存した続きを「続きから」の画面に出す
          onSuspend={() => {
            const saved = loadRun();
            if (saved) setStage({ kind: 'resume', run: saved });
          }}
          onFinish={(state) => {
            const { save: next, scene } = saveAfter(save, state, outcome);
            writeSave(next);
            clearRun();
            const expedition = toResult(state);
            setStage(scene ? { kind: 'memory', scene, outcome, expedition, next } : { kind: 'result', outcome, expedition, next });
          }}
        />
      );
    }
    case 'memory':
      return <MemoryScreen scene={stage.scene} onDone={() => setStage({ kind: 'result', outcome: stage.outcome, expedition: stage.expedition, next: stage.next })} />;
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
