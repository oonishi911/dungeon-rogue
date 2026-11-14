// 出発の準備：ダンジョンを選んだあと、貯めた金貨で品物を買い、持っていくものを選んで出発する画面。
// ルールはすべて src/game/shop.ts にあり、ここでは呼び出して表示するだけ。
// 売り場は「武器・防具・道具・呪文書」のタブで切り替える。下の「持ち物」の欄は、たたんでおける（スマホで品物を多く見るため）。

import { useState } from 'react';
import { ITEMS, LOADOUT_CONFIG, TRAITS } from '../game/data';
import type { SaveData } from '../game/save';
import { buy, count, equip, kitLoadout, shelfItems, SHELVES, takeSupply, toggleBook, type Shelf } from '../game/shop';
import type { ItemId, Result, TraitId } from '../game/types';
import { ItemIcon } from './ItemIcon';

interface ShopScreenProps {
  run: number;
  dungeonName: string;
  trait: TraitId;
  save: SaveData;
  onChange: (save: SaveData) => void; // 買った・選んだたびに呼ぶ（すぐ保存する）
  onDepart: () => void;
}

export function ShopScreen({ run, dungeonName, trait, save, onChange, onDepart }: ShopScreenProps) {
  const [shelf, setShelf] = useState<Shelf>('weapon');
  const [bagOpen, setBagOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { kit } = save;

  const apply = (r: Result<SaveData>) => {
    if (!r.ok) return setError(r.error);
    setError(null);
    onChange(r.value);
  };

  return (
    <main className="screen screen--narrow screen--fit shop">
      <header className="top">
        <div>
          <p className="top__run">
            {run}回目の挑戦 ・ {dungeonName} ・ 属性：{TRAITS[trait].name}
          </p>
          <h1 className="top__title">出発の準備</h1>
        </div>
        <p className="shop__gold" aria-live="polite">
          <span className="shop__gold-label">所持金</span>
          {save.gold}G
        </p>
      </header>

      <div className="shop__tabs" role="tablist" aria-label="売り場">
        {SHELVES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={shelf === s.id}
            className={`shop__tab${shelf === s.id ? ' shop__tab--on' : ''}`}
            onClick={() => setShelf(s.id)}
          >
            {s.name}
          </button>
        ))}
      </div>

      <ul className="shop__list screen__scroll" aria-label={SHELVES.find((s) => s.id === shelf)!.name}>
        {shelfItems(save.owned, shelf).map((id) => (
          <li key={id} className="shop__row">
            <ItemIcon id={id} size={36} className="shop__icon" />
            <div className="shop__about">
              <p className="shop__name">{ITEMS[id].name}</p>
              <p className="shop__desc">{ITEMS[id].description}</p>
            </div>
            <div className="shop__deal">
              <Deal id={id} shelf={shelf} save={save} apply={apply} />
            </div>
          </li>
        ))}
      </ul>

      <p className="error shop__error" role="alert">
        {error}
      </p>

      <section className="shop__bag" aria-labelledby="shop-bag">
        <h2 id="shop-bag" className="shop__bag-title">
          <button type="button" className="shop__bag-toggle" aria-expanded={bagOpen} aria-controls="shop-slots" onClick={() => setBagOpen((o) => !o)}>
            <span>持っていくもの</span>
            <span className="shop__bag-sum">
              道具 {kit.take.length}/{LOADOUT_CONFIG.maxItems}・呪文書 {kit.books.length}/{LOADOUT_CONFIG.maxSpellbooks}
            </span>
            <span className="shop__bag-arrow" aria-hidden="true">
              {bagOpen ? '▼' : '▲'}
            </span>
          </button>
        </h2>
        {bagOpen && (
          <dl id="shop-slots" className="shop__slots">
            <div>
              <dt>武器</dt>
              <dd>{kit.weapon ? <Chip id={kit.weapon} title="外す" onClick={() => apply(equip(save, 'weapon', null))} /> : <span className="shop__none">なし</span>}</dd>
            </div>
            <div>
              <dt>防具</dt>
              <dd>{kit.armor ? <Chip id={kit.armor} title="外す" onClick={() => apply(equip(save, 'armor', null))} /> : <span className="shop__none">なし</span>}</dd>
            </div>
            <div>
              <dt>道具</dt>
              <dd>
                {kit.take.length === 0 ? (
                  <span className="shop__none">なし</span>
                ) : (
                  kit.take.map((id, i) => <Chip key={i} id={id} title="倉庫に戻す" onClick={() => apply(takeSupply(save, id, -1))} />)
                )}
              </dd>
            </div>
            <div>
              <dt>呪文書</dt>
              <dd>
                {kit.books.length === 0 ? (
                  <span className="shop__none">なし</span>
                ) : (
                  kit.books.map((id) => <Chip key={id} id={id} title="外す" onClick={() => apply(toggleBook(save, id))} />)
                )}
              </dd>
            </div>
          </dl>
        )}
        {bagOpen && <p className="muted">押すと外す（買ったものは、なくならない）</p>}
        <button type="button" className="primary shop__go" onClick={onDepart}>
          {kitLoadout(save).length === 0 ? '何も持たずに出発する' : kit.weapon ? 'この持ち物で出発する' : '武器なしで出発する'}
        </button>
      </section>
    </main>
  );
}

/** 品物の右側：値段と「買う」、または持っているものの「装備する」「持っていく」 */
function Deal({ id, shelf, save, apply }: { id: ItemId; shelf: Shelf; save: SaveData; apply: (r: Result<SaveData>) => void }) {
  const owned = save.owned.includes(id);
  const price = ITEMS[id].price;
  const short = price > save.gold;
  const buyButton = (
    <>
      <span className="shop__price">{price}G</span>
      <button type="button" className={short ? 'shop__buy shop__buy--off' : 'primary shop__buy'} disabled={short} onClick={() => apply(buy(save, id))}>
        {short ? '金貨が足りない' : '買う'}
      </button>
    </>
  );
  if (shelf === 'supply') {
    const inStock = count(save.stock, id);
    const taking = count(save.kit.take, id);
    return (
      <>
        {buyButton}
        <span className="shop__stock">
          倉庫 {inStock}・持っていく {taking}
          <button type="button" className="shop__step" aria-label={`${ITEMS[id].name}を1つ減らす`} disabled={taking === 0} onClick={() => apply(takeSupply(save, id, -1))}>
            −
          </button>
          <button
            type="button"
            className="shop__step"
            aria-label={`${ITEMS[id].name}を1つ増やす`}
            disabled={taking >= inStock || save.kit.take.length >= LOADOUT_CONFIG.maxItems}
            onClick={() => apply(takeSupply(save, id, 1))}
          >
            ＋
          </button>
        </span>
      </>
    );
  }
  if (!owned) return buyButton;
  if (shelf === 'book') {
    const taking = save.kit.books.includes(id);
    return (
      <>
        <span className="shop__owned">持っている</span>
        <button type="button" className={taking ? 'shop__buy shop__buy--off' : 'primary shop__buy'} onClick={() => apply(toggleBook(save, id))}>
          {taking ? '外す' : '持っていく'}
        </button>
      </>
    );
  }
  const slot = shelf === 'weapon' ? 'weapon' : 'armor';
  const wearing = save.kit[slot] === id;
  return (
    <>
      <span className="shop__owned">持っている</span>
      <button type="button" className={wearing ? 'shop__buy shop__buy--off' : 'primary shop__buy'} disabled={wearing} onClick={() => apply(equip(save, slot, id))}>
        {wearing ? '装備中' : '装備する'}
      </button>
    </>
  );
}

function Chip({ id, title, onClick }: { id: ItemId; title: string; onClick: () => void }) {
  return (
    <button type="button" className="shop__chip" onClick={onClick} title={`${ITEMS[id].name}を${title}`}>
      <ItemIcon id={id} size={20} />
      {ITEMS[id].name.replace('の呪文書', '')}
    </button>
  );
}
