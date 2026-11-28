import { ITEMS, TRAITS } from '../game/data';
import { echoName, gearName } from '../game/echo';
import { hasDungeon, dungeonOf } from '../game/dungeons';
import type { ExploreResult } from '../game/exploreTypes';
import { LOST, lost, rewindLines } from '../game/story';
import type { Departure } from '../game/types';
import { ItemList } from './ItemIcon';

interface ResultScreenProps {
  run: number;
  outcome: Departure;
  expedition: ExploreResult;
  gold: number; // 持ち帰った分を足した、貯めた金貨（次の店で使える）
  onNextRun: () => void;
}

export function ResultScreen({ run, outcome, expedition, gold, onNextRun }: ResultScreenProps) {
  const cleared = expedition.outcome === 'cleared';
  const where = expedition.bossFloor ? '最深部' : `地下${expedition.floorReached}階`;
  const dungeonName = hasDungeon(outcome.dungeon) ? dungeonOf(outcome.dungeon).name : '';

  return (
    <main className="screen screen--narrow screen--fit">
      <header className="top">
        <div>
          <p className="top__run">
            {dungeonName}
          </p>
          <h1 className="top__title">{cleared ? 'ダンジョンを踏破した' : expedition.outcome === 'retired' ? `${where}でリタイアした` : `${where}で力尽きた`}</h1>
        </div>
      </header>

      {/* スマホでは、画面全体は動かさず、この枠の中だけを動かす（下のボタンは、いつも見えている） */}
      <section className="panel reveal screen__scroll" aria-labelledby="reveal-heading">
        {/* 力尽きたとき：時が巻き戻る（ストーリー。終わらせたい気持ちは、ほのめかすだけ） */}
        {expedition.outcome === 'defeated' && (
          <div className="rewind">
            {rewindLines(run).map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}
        <h2 id="reveal-heading" className="panel__title">ダンジョンの正体</h2>
        <p className="reveal__trait">{TRAITS[outcome.trait].name}のダンジョンだった</p>
        <dl className="facts">
          <div>
            <dt>持っていったもの</dt>
            <dd>{outcome.loadout.length ? <ItemList ids={outcome.loadout} /> : 'なし'}</dd>
          </div>
          <div>
            <dt>倒した敵</dt>
            <dd>{expedition.defeated}体</dd>
          </div>
          <div>
            <dt>持ち帰った{LOST.name}</dt>
            <dd>
              {lost(expedition.goldBrought)}
              {expedition.goldBrought < expedition.gold && `（拾った${lost(expedition.gold)}のうち）`}
            </dd>
          </div>
          {expedition.found && (expedition.found.gear.length > 0 || expedition.found.echoes.length > 0) && (
            <div>
              <dt>拾った刻印武器と残響</dt>
              <dd>
                {[...expedition.found.gear.map((g) => `${gearName(g.base)}（スロット${g.slots}）`), ...expedition.found.echoes.map(echoName)].join('、')}
                （{LOST.shop}の「刻印」に届いた。失うことはない）
              </dd>
            </div>
          )}
          {expedition.found && expedition.found.rings.length > 0 && (
            <div>
              <dt>拾った指輪</dt>
              <dd>
                {expedition.found.rings.map((id) => ITEMS[id].name).join('、')}
                （{LOST.shop}の「指輪」に届いた。失うことはない）
              </dd>
            </div>
          )}
          <div>
            <dt>貯めた{LOST.name}</dt>
            <dd>{lost(gold)}（次の{LOST.shop}で使える。使わなかった道具は倉庫に戻った）</dd>
          </div>
        </dl>
      </section>

      <button type="button" className="primary primary--wide" onClick={onNextRun}>
        次の挑戦を始める
      </button>
    </main>
  );
}
