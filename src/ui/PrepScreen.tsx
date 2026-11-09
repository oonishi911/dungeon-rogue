import type { CSSProperties } from 'react';
import { ITEMS, TRAITS } from '../game/data';
import { toPlayerView } from '../game/prep';
import { RANK_CONFIG, rankParams, upgradeCost } from '../game/rank';
import type { ItemId, Knowledge, PrepState, ShopId } from '../game/types';
import { Card } from './Card';

const SHOP_NAME: Record<ShopId, string> = { smithy: '鍛冶屋', item: '道具屋', magic: '魔法屋' };

export function knowledgeText(knowledge: Knowledge): string {
  if (knowledge.status === 'unknown') return 'まだ何もわからない';
  const how = knowledge.source === 'informant' ? '情報屋の話' : '酒場の噂';
  return `${TRAITS[knowledge.trait].name}の気配（${how}）`;
}

interface PrepScreenProps {
  run: number;
  state: PrepState;
  error: string | null;
  onPlay: (uid: string) => void;
  onBuy: (item: ItemId) => void;
  onUpgrade: () => void;
  onEndDay: () => void;
  onReset: () => void;
}

export function PrepScreen({ run, state, error, onPlay, onBuy, onUpgrade, onEndDay, onReset }: PrepScreenProps) {
  // 正解の特性を含まない状態だけを使って描画する
  const view = toPlayerView(state);
  const daysLeft = view.maxDays - view.day;
  const days = Array.from({ length: view.maxDays }, (_, i) => i + 1);
  const shopItems = view.openShop ? Object.values(ITEMS).filter((i) => i.shop === view.openShop) : [];

  return (
    <main className="screen">
      <header className="top">
        <div>
          <p className="top__run">
            {run}回目の挑戦 ・ ランク{view.rank}
          </p>
          <h1 className="top__title">
            {daysLeft === 0 ? '明日、ダンジョンへ出発' : `出発まで、あと${daysLeft + 1}日`}
          </h1>
        </div>
        <dl className="status">
          <div>
            <dt>所持金</dt>
            <dd>{view.gold}G</dd>
          </div>
          <div>
            <dt>ダンジョンの情報</dt>
            <dd>{knowledgeText(view.knowledge)}</dd>
          </div>
          <div>
            <dt>地図</dt>
            <dd>{view.hasMap ? 'あり' : 'なし'}</dd>
          </div>
        </dl>
      </header>

      <ol className="calendar" aria-label="準備の日程" style={{ '--days': view.maxDays } as CSSProperties}>
        {days.map((d) => {
          const used = view.played.find((p) => p.day === d);
          const state = d < view.day ? 'past' : d === view.day ? 'today' : 'future';
          return (
            <li key={d} className={`day day--${state}`} aria-current={state === 'today' ? 'date' : undefined}>
              <span className="day__label">{d}日目</span>
              {used ? (
                <Card cardId={used.card.cardId} size="slot" />
              ) : (
                <span className="day__empty">
                  {state === 'past' ? '何もしなかった' : state === 'today' ? '手札から1枚選ぶ' : ''}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="middle">
        <section className="panel shop" aria-labelledby="shop-heading">
          <h2 id="shop-heading" className="panel__title">
            {view.openShop ? `今日は${SHOP_NAME[view.openShop]}にいる` : '今日の店'}
          </h2>
          {view.openShop ? (
            <ul className="shop__list">
              {shopItems.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="buy"
                    onClick={() => onBuy(item.id)}
                    disabled={view.gold < item.price}
                  >
                    <span className="buy__name">{item.name}</span>
                    <span className="buy__desc">{item.description}</span>
                    <span className="buy__price">{item.price}G</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">店のカードを使うと、その日だけ買い物ができる。</p>
          )}
          {view.inventory.length > 0 && (
            <p className="shop__bag">
              持ち物：{view.inventory.map((id) => ITEMS[id].name).join('、')}
            </p>
          )}
        </section>

        <section className="panel log" aria-labelledby="log-heading">
          <h2 id="log-heading" className="panel__title">これまでの記録</h2>
          {view.log.length === 0 ? (
            <p className="muted">カードを使うと、ここに起きたことが残る。</p>
          ) : (
            <ul className="log__list">
              {[...view.log].reverse().map((line, i) => (
                <li key={view.log.length - i}>{line}</li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <RankPanel rank={view.rank} exp={view.exp} gold={view.gold} onUpgrade={onUpgrade} />

      <p className="error" role="alert">
        {error ?? ''}
      </p>

      <section className="hand" aria-labelledby="hand-heading">
        <div className="hand__head">
          <h2 id="hand-heading" className="panel__title">
            手札 {view.hand.length}枚
          </h2>
          <button type="button" className="primary" onClick={onEndDay}>
            {daysLeft === 0 ? '準備を終える' : `${view.day}日目を終える`}
          </button>
        </div>
        <div className="hand__cards">
          {view.hand.map((c) => (
            <Card key={c.uid} cardId={c.cardId} onClick={() => onPlay(c.uid)} disabled={view.playedToday} />
          ))}
        </div>
        {view.playedToday && <p className="muted">今日はもうカードを使った。</p>}
      </section>

      <footer className="prep-footer">
        <button
          type="button"
          className="reset"
          onClick={() => {
            if (window.confirm('ランク・経験・持ち越したカードと金貨を消して、最初から始めますか？')) onReset();
          }}
        >
          記録を消して最初から始める
        </button>
      </footer>
    </main>
  );
}

/** ランクと強化。強化はカードも日数も使わず、経験と金貨を払う */
function RankPanel({ rank, exp, gold, onUpgrade }: { rank: number; exp: number; gold: number; onUpgrade: () => void }) {
  const now = rankParams(rank);
  const maxed = rank >= RANK_CONFIG.maxRank;
  const next = rankParams(rank + 1);
  const cost = upgradeCost(rank);
  const reason =
    exp < RANK_CONFIG.expPerUpgrade
      ? 'ダンジョンを踏破すると、強化に使える経験が手に入る。'
      : gold < cost
        ? `強化には${cost}G必要。`
        : null;

  return (
    <section className="panel rank" aria-labelledby="rank-heading">
      <h2 id="rank-heading" className="panel__title">
        ランク{rank}
      </h2>
      <p className="rank__now">
        ダンジョン {now.mapSize}×{now.mapSize} ・ 満腹度の上限 {now.maxSatiety} ・ 踏破した経験 {exp}
      </p>
      {maxed ? (
        <p className="muted">これ以上ランクは上げられない。</p>
      ) : (
        <div className="rank__next">
          <p>
            ランク{next.rank}にすると：ダンジョン {next.mapSize}×{next.mapSize}、満腹度の上限 {next.maxSatiety}、宝箱の金貨
            ×{next.chestGoldRate}、ボスの報酬 {next.bossGold}G
          </p>
          <button type="button" className="primary" onClick={onUpgrade} disabled={reason !== null}>
            ランクを上げる（{cost}G・経験{RANK_CONFIG.expPerUpgrade}）
          </button>
          {reason && <p className="muted">{reason}</p>}
        </div>
      )}
    </section>
  );
}
