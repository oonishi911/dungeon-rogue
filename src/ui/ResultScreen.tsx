import { CARDS, ITEMS, TRAITS } from '../game/data';
import { hasDungeon, dungeonOf } from '../game/dungeons';
import type { ExploreResult } from '../game/explore';
import type { PrepResult } from '../game/types';
import { knowledgeText } from './PrepScreen';

interface ResultScreenProps {
  run: number;
  outcome: PrepResult;
  expedition: ExploreResult;
  onNextRun: () => void;
}

export function ResultScreen({ run, outcome, expedition, onNextRun }: ResultScreenProps) {
  const cleared = expedition.outcome === 'cleared';
  const where = expedition.bossFloor ? '最深部' : `地下${expedition.floorReached}階`;
  const dungeonName = hasDungeon(outcome.dungeon) ? dungeonOf(outcome.dungeon).name : '';

  return (
    <main className="screen screen--narrow screen--fit">
      <header className="top">
        <div>
          <p className="top__run">
            {run}回目の挑戦 ・ {dungeonName && `${dungeonName} ・ `}ランク{outcome.rank}
          </p>
          <h1 className="top__title">{cleared ? 'ダンジョンを踏破した' : `${where}で力尽きた`}</h1>
        </div>
      </header>

      {/* スマホでは、画面全体は動かさず、この枠の中だけを動かす（下のボタンは、いつも見えている） */}
      <section className="panel reveal screen__scroll" aria-labelledby="reveal-heading">
        <h2 id="reveal-heading" className="panel__title">ダンジョンの正体</h2>
        <p className="reveal__trait">{TRAITS[outcome.trait].name}のダンジョンだった</p>
        <dl className="facts">
          <div>
            <dt>出発前の情報</dt>
            <dd>{knowledgeText(outcome.knowledge)}</dd>
          </div>
          <div>
            <dt>持っていったもの</dt>
            <dd>{outcome.loadout.length ? outcome.loadout.map((id) => ITEMS[id].name).join('、') : 'なし'}</dd>
          </div>
          <div>
            <dt>倒した敵</dt>
            <dd>{expedition.defeated}体</dd>
          </div>
          <div>
            <dt>踏破した経験</dt>
            <dd>{cleared ? `1つ得た（今${outcome.exp + 1}つ。準備で強化に使える）` : `得られなかった（今${outcome.exp}つ）`}</dd>
          </div>
          <div>
            <dt>持ち帰った金貨</dt>
            <dd>
              {expedition.goldBrought}G
              {expedition.goldBrought < expedition.gold && `（手に入れた${expedition.gold}Gのうち）`}
            </dd>
          </div>
          <div>
            <dt>次に持ち越すカード</dt>
            <dd>{outcome.carried.length ? outcome.carried.map((c) => CARDS[c.cardId].name).join('、') : 'なし'}</dd>
          </div>
        </dl>
      </section>

      <p className="muted">持ち帰った金貨は、次の準備の所持金に足される。</p>
      <button type="button" className="primary primary--wide" onClick={onNextRun}>
        次の挑戦を始める
      </button>
    </main>
  );
}
