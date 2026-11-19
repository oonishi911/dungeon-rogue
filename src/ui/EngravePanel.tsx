// 忘れ物屋の「刻印」の売り場：敵が落とした刻印武器を装備し、スロットに残響をはめる・外す（何度でも、無料）。
// 刻印武器と残響は買えない（敵が落とす）。力尽きても、なくならない。ルールは src/game/engrave.ts、設計は docs/echo-spec.md。

import { useState } from 'react';
import { ECHO_MASTER, ITEMS } from '../game/data';
import { echoName } from '../game/echo';
import { ECHO_INFO, echoText } from '../game/echoMaster';
import { echoStock, engravedName, equipEngraved, isEquipped, setEcho, unequipEngraved } from '../game/engrave';
import type { SaveData } from '../game/save';
import type { Result } from '../game/types';
import { ItemIcon } from './ItemIcon';

export function EngravePanel({ save, apply }: { save: SaveData; apply: (r: Result<SaveData>) => void }) {
  // いま残響を選んでいるスロット（刻印武器の番号と、何番目か）
  const [picking, setPicking] = useState<{ uid: number; index: number } | null>(null);
  const stock = echoStock(save);

  if (save.engraved.length === 0 && stock.length === 0) {
    return (
      <div className="shop__list screen__scroll">
        <p className="muted shop__engrave-empty">
          刻印武器と残響は、買えません。ダンジョンの敵が、ごく稀に落とします。拾ったものは、力尽きても失わず、ここに届きます。
        </p>
      </div>
    );
  }

  return (
    <div className="shop__list screen__scroll shop__engrave">
      <h3 className="shop__engrave-title">刻印武器</h3>
      {save.engraved.length === 0 && <p className="muted">まだ、刻印武器を持っていない</p>}
      <ul className="shop__engrave-list">
        {save.engraved.map((g) => {
          const on = isEquipped(save, g.uid);
          return (
            <li key={g.uid} className="shop__row shop__row--engrave">
              <ItemIcon id={g.base} size={28} className="shop__icon" />
              <div className="shop__about shop__about--static">
                <span className="shop__name">{engravedName(g)}</span>
                <span className="shop__desc">{ITEMS[g.base].description}</span>
                <span className="shop__slots-row">
                  {g.slots.map((s, i) => {
                    const here = picking?.uid === g.uid && picking.index === i;
                    return (
                      <button
                        key={i}
                        type="button"
                        className={`shop__slot${s ? ' shop__slot--filled' : ''}${here ? ' shop__slot--on' : ''}`}
                        aria-pressed={here}
                        aria-label={`${engravedName(g)}の${i + 1}つ目のスロット：${s ? echoName(s) : '空'}`}
                        onClick={() => setPicking(here ? null : { uid: g.uid, index: i })}
                      >
                        {s ? echoName(s) : '空'}
                      </button>
                    );
                  })}
                </span>
                {g.slots.some((s) => s) && <span className="shop__desc">{g.slots.filter((s) => s).map((s) => echoText(ECHO_MASTER, s!)).join(' ／ ')}</span>}
              </div>
              <div className="shop__deal">
                <button type="button" className={on ? 'shop__buy shop__buy--off' : 'primary shop__buy'} onClick={() => apply(on ? unequipEngraved(save, g.uid) : equipEngraved(save, g.uid))}>
                  {on ? '外す' : '装備する'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {picking && (
        <div className="shop__pick-echo" role="group" aria-label="はめる残響を選ぶ">
          <p className="muted">スロットにはめる残響を選ぶ（倉庫にあるもの。外したものは倉庫に戻る）</p>
          <div className="shop__chips">
            {save.engraved.find((g) => g.uid === picking.uid)?.slots[picking.index] && (
              <button
                type="button"
                className="shop__chip"
                onClick={() => {
                  apply(setEcho(save, picking.uid, picking.index, null));
                  setPicking(null);
                }}
              >
                外す
              </button>
            )}
            {stock.map((e) => (
              <button
                key={e.id}
                type="button"
                className="shop__chip"
                title={echoText(ECHO_MASTER, e.id)}
                onClick={() => {
                  apply(setEcho(save, picking.uid, picking.index, e.id));
                  setPicking(null);
                }}
              >
                {echoName(e.id)}×{e.count}
              </button>
            ))}
            {stock.length === 0 && <span className="muted">倉庫に残響がない</span>}
          </div>
        </div>
      )}

      <h3 className="shop__engrave-title">倉庫の残響</h3>
      {stock.length === 0 ? (
        <p className="muted">残響はない（スロットにはめているものは、ここには出ない）</p>
      ) : (
        <ul className="shop__engrave-list">
          {stock.map((e) => (
            <li key={e.id} className="shop__row shop__row--engrave">
              <div className="shop__about shop__about--static">
                <span className="shop__name">
                  {echoName(e.id)}×{e.count}
                </span>
                <span className="shop__desc">{echoText(ECHO_MASTER, e.id)}</span>
                <span className="shop__desc">{ECHO_INFO[e.id].flavor}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
