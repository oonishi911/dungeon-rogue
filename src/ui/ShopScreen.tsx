// 出発の準備：ダンジョンを選んだあと、貯めた金貨で品物を買い、持っていくものを選んで出発する画面。
// ルールはすべて src/game/shop.ts にあり、ここでは呼び出して表示するだけ。
// ダンジョンの属性は出さず、情報屋から聞いたことだけを、上にメモとして出す。
// はっきり聞いたこと（うわさでない）があれば、それに合う品物に「おすすめ」の印を付ける（shop.ts の recommended）。
// 画面は、上の切り替えで「買い物」と「装備」に分かれる（2026-11-23）。
// ・買い物：店に並ぶ品物を買うだけ（買った武器・防具は、そのまま装備する。持っているものには「持っている」の印）。売り場は「武器・防具・指輪・道具・呪文書」のタブ
// ・装備：持っているものから、持っていくものを選ぶ（装備する・付ける・持っていく）。「武器・防具・指輪・道具・呪文書・刻印」のタブ（指輪には、敵が落とした二重耐性の指輪も並ぶ）。
//   下の「持っていくもの」の欄（たためる）と、出発のボタンは、装備の画面にだけある

import { useEffect, useMemo, useState } from 'react';
import { LOST, lost } from '../game/story';
import { RoomBackdrop } from './RoomBackdrop';
import { ITEMS, LOADOUT_CONFIG } from '../game/data';
import type { Intel } from '../game/informant';
import type { SaveData } from '../game/save';
import { equipForIntel } from '../game/autoEquip';
import { buy, canTake, count, equip, equipSub, kitLoadout, ownedOn, recommended, shelfItems, SHELVES, takeCount, takeLimit, takeSupply, toggleBook, type Shelf } from '../game/shop';
import type { ItemId, Result } from '../game/types';
import { ItemIcon } from './ItemIcon';
import { EngravePanel } from './EngravePanel';
import { engravedName } from '../game/engrave';
import { equipRing, fingers, kitRings, unequipRing } from '../game/ring';

interface ShopScreenProps {
  run: number;
  dungeonName: string;
  intel: readonly Intel[]; // 情報屋から聞いたこと（ダンジョンの属性は、聞かなければわからない）
  save: SaveData;
  atEntry: readonly ItemId[]; // 店に入ったときに持っていたもの（並びはこれで決まり、店で買っても広がらない）
  onChange: (save: SaveData) => void; // 買った・選んだたびに呼ぶ（すぐ保存する）
  onBack: () => void; // 情報屋に戻る（2026-11-28）
  onDepart: () => void;
}

export function ShopScreen({ run, dungeonName, intel, save, atEntry, onChange, onBack, onDepart }: ShopScreenProps) {
  const [mode, setMode] = useState<'buy' | 'equip'>('buy');
  const [tab, setTab] = useState<Shelf | 'engrave'>('weapon');
  const shelf: Shelf = tab === 'engrave' ? 'weapon' : tab;
  // 買い物の画面には「刻印」のタブがないので、そこから切り替えたら武器のタブにする
  const switchMode = (next: 'buy' | 'equip') => {
    setMode(next);
    setOpen(null);
    setError(null);
    if (next === 'buy' && tab === 'engrave') setTab('weapon');
  };
  const [bagOpen, setBagOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<ItemId | null>(null); // 説明を全部出している品物
  const { kit } = save;
  // 装備の画面では、装備している・持っていくものを先に並べる
  const inKit = (id: ItemId) => kit.weapon === id || kit.weapon2 === id || kit.armor === id || kitRings(save).includes(id) || kit.books.includes(id) || kit.take.includes(id);
  const items = mode === 'buy' ? [...shelfItems(atEntry, shelf)] : [...ownedOn(save, shelf)].sort((a, b) => Number(inKit(b)) - Number(inKit(a)));
  // 情報屋の話からのおすすめの装備：選んだ理由と、元に戻すための前の状態
  const [auto, setAuto] = useState<{ notes: string[]; before: SaveData } | null>(null);
  // 買ったときの知らせ（少しすると消える）
  const [bought, setBought] = useState<string | null>(null);
  useEffect(() => {
    if (!bought) return;
    const id = window.setTimeout(() => setBought(null), 2400);
    return () => window.clearTimeout(id);
  }, [bought]);
  /** 装備の画面のタブに添える、今の数（指輪 1/2・道具 6/8・呪文書 3/5。武器・防具は、装備していれば ✓） */
  const tabCount = (id: Shelf): string => {
    if (id === 'weapon') return kit.weapon ? '✓' : '';
    if (id === 'armor') return kit.armor ? '✓' : '';
    if (id === 'ring') return `${kitRings(save).length}/${fingers(save.memories.length)}`;
    if (id === 'supply') return `${takeCount(kit.take)}/${takeLimit(kit.take, Boolean(kit.weapon2))}`;
    return `${kit.books.length}/${LOADOUT_CONFIG.maxSpellbooks}`;
  };
  const autoEquip = () => {
    const r = equipForIntel(save, intel);
    setAuto({ notes: r.notes, before: save });
    setError(null);
    onChange(r.save);
  };
  const rings = kitRings(save);
  const fingerCount = fingers(save.memories.length);
  // 情報屋からはっきり聞いたことに合う品物（うわさだけでは付けない）
  const picks = useMemo(() => recommended(intel), [intel]);

  const apply = (r: Result<SaveData>) => {
    if (!r.ok) return setError(r.error);
    setError(null);
    onChange(r.value);
  };

  return (
    <main className={`screen screen--narrow screen--fit shop${mode === 'equip' ? ' shop--equip' : ''}`}>
      <RoomBackdrop save={save} />
      <header className="top">
        <div>
          {/* 情報屋に戻って、もっと話を聞ける（買ったもの・装備はそのまま） */}
          <button type="button" className="shop__back" onClick={onBack}>
            <span aria-hidden="true">‹</span> 情報屋に戻る
          </button>
          <p className="top__run">
            {run}回目の挑戦 ・ {dungeonName} ・ 出発の準備
          </p>
          <h1 className="top__title">{LOST.shop}</h1>
        </div>
        <p className="shop__gold" aria-live="polite">
          <span className="shop__gold-label">手持ちの{LOST.name}</span>
          {lost(save.gold)}
        </p>
      </header>

      <ul className="shop__memo" aria-label="情報屋から聞いたこと">
        {intel.length === 0 ? <li className="muted">情報屋からは、何も聞いていない（ダンジョンの属性はわからない）</li> : intel.map((h) => <li key={h.topic}>{h.memo}</li>)}
      </ul>

      {/* 買い物と装備の切り替え */}
      <div className="shop__modes" role="tablist" aria-label="画面">
        {(
          [
            ['buy', '買い物'],
            ['equip', '装備'],
          ] as const
        ).map(([id, name]) => (
          <button key={id} type="button" role="tab" aria-selected={mode === id} className={`shop__mode${mode === id ? ' shop__mode--on' : ''}`} onClick={() => switchMode(id)}>
            {name}
          </button>
        ))}
      </div>

      {mode === 'equip' && (
        // 情報屋の話から、持っているものでおすすめの装備にする（autoEquip.ts）。選んだ理由を出し、元に戻せる
        <div className="shop__auto">
          <button type="button" className="primary shop__auto-go" onClick={autoEquip}>
            情報屋の話から、おすすめを装備する
          </button>
          {auto && (
            <div className="shop__auto-notes" role="status">
              <ul>
                {auto.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              <div className="shop__auto-actions">
                <button
                  type="button"
                  className="shop__buy shop__buy--second"
                  onClick={() => {
                    onChange(auto.before);
                    setAuto(null);
                  }}
                >
                  元に戻す
                </button>
                <button type="button" className="shop__buy shop__buy--second" onClick={() => setAuto(null)}>
                  閉じる
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="shop__tabs" role="tablist" aria-label={mode === 'buy' ? '売り場' : '持ち物の種類'}>
        {SHELVES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={tab === s.id}
            className={`shop__tab${tab === s.id ? ' shop__tab--on' : ''}`}
            onClick={() => setTab(s.id)}
          >
            {s.name}
            {mode === 'equip' && tabCount(s.id) && <span className="shop__tab-count">{tabCount(s.id)}</span>}
          </button>
        ))}
        {/* 刻印：敵が落とした刻印武器と残響。買えない。装備と付け替えをする（engrave.ts）。装備の画面にだけある */}
        {mode === 'equip' && (
          <button type="button" role="tab" aria-selected={tab === 'engrave'} className={`shop__tab${tab === 'engrave' ? ' shop__tab--on' : ''}`} onClick={() => setTab('engrave')}>
            刻印
          </button>
        )}
      </div>

      {tab === 'engrave' && <EngravePanel save={save} apply={apply} />}
      {tab !== 'engrave' && (
      <ul className="shop__list screen__scroll" aria-label={SHELVES.find((s) => s.id === shelf)!.name}>
        {items.length === 0 && <li className="muted shop__empty">{mode === 'buy' ? '並んでいるものはない' : 'まだ持っていない（「買い物」で買える）'}</li>}
        {items.map((id) => (
          <li
            key={id}
            className={`shop__row${mode === 'equip' && inKit(id) ? ' shop__row--on' : ''}${
              // 買い物で、お金が足りない品物は薄くする（持っているものは除く。道具は何度でも買える）
              mode === 'buy' && ITEMS[id].price > save.gold && (shelf === 'supply' || !save.owned.includes(id)) ? ' shop__row--short' : ''
            }`}
          >
            <ItemIcon id={id} size={28} className="shop__icon" />
            {/* 説明は2行に切ってある。押すと全文と、今の装備との比べを出す */}
            <button type="button" className="shop__about" aria-expanded={open === id} onClick={() => setOpen((o) => (o === id ? null : id))}>
              <span className="shop__name">
                {ITEMS[id].name}
                {picks.has(id) && <span className="shop__pick">おすすめ</span>}
                {(shelf === 'weapon' || shelf === 'armor') && <Compare id={id} save={save} />}
              </span>
              <span className="shop__desc">{ITEMS[id].description}</span>
              {open === id && (shelf === 'weapon' || shelf === 'armor') && <VersusLine id={id} save={save} />}
            </button>
            <div className="shop__deal">
              {mode === 'buy' ? (
                <BuyDeal
                  id={id}
                  shelf={shelf}
                  save={save}
                  atEntry={atEntry}
                  apply={(r) => {
                    if (r.ok) setBought(`${ITEMS[id].name}を買った${shelf === 'weapon' || shelf === 'armor' ? '（装備した）' : shelf === 'supply' ? '（倉庫へ）' : ''}`);
                    apply(r);
                  }}
                />
              ) : (
                <EquipDeal id={id} shelf={shelf} save={save} apply={apply} />
              )}
            </div>
          </li>
        ))}
      </ul>
      )}

      <p className="error shop__error" role="alert">
        {error}
      </p>
      {bought && !error && (
        <p className="shop__bought" role="status">
          {bought}
        </p>
      )}

      {mode === 'buy' && (
        // 買い物の画面の下：装備の画面へ（出発は、装備の画面から）
        <div className="shop__bag shop__next">
          <p className="muted shop__bag-hint">買った武器・防具は、そのまま装備する。持っていくものは「装備」で選ぶ</p>
          <button type="button" className="primary shop__go" onClick={() => switchMode('equip')}>
            装備を選ぶ
          </button>
        </div>
      )}

      {mode === 'equip' && (
      <section className="shop__bag" aria-labelledby="shop-bag">
        <h2 id="shop-bag" className="shop__bag-title">
          <button type="button" className="shop__bag-toggle" aria-expanded={bagOpen} aria-controls="shop-slots" onClick={() => setBagOpen((o) => !o)}>
            <span>持っていくもの</span>
            <span className="shop__bag-sum">
              指輪 {rings.length}/{fingerCount}・道具 {takeCount(kit.take)}/{takeLimit(kit.take, Boolean(kit.weapon2))}・呪文書 {kit.books.length}/{LOADOUT_CONFIG.maxSpellbooks}
            </span>
            <span className="shop__bag-arrow" aria-hidden="true">
              {bagOpen ? '▼' : '▲'}
            </span>
          </button>
        </h2>
        {bagOpen && (
          <div className="shop__bag-body">
          <dl id="shop-slots" className="shop__slots">
            <div>
              <dt>武器</dt>
              <dd>{kit.weapon ? <Chip id={kit.weapon} label={gearLabel(save)} title="外す" onClick={() => apply(equip(save, 'weapon', null))} /> : <span className="shop__none">なし</span>}</dd>
            </div>
            <div>
              <dt>サブ武器</dt>
              <dd>{kit.weapon2 ? <Chip id={kit.weapon2} label={gearLabel(save, 'sub')} title="外す" onClick={() => apply(equipSub(save, null))} /> : <span className="shop__none">なし</span>}</dd>
            </div>
            <div>
              <dt>防具</dt>
              <dd>{kit.armor ? <Chip id={kit.armor} title="外す" onClick={() => apply(equip(save, 'armor', null))} /> : <span className="shop__none">なし</span>}</dd>
            </div>
            <div>
              <dt>指輪</dt>
              <dd>
                {rings.map((id) => (
                  <Chip key={id} id={id} title="外す" onClick={() => apply(unequipRing(save, id))} />
                ))}
                {rings.length === 0 && <span className="shop__none">なし</span>}
              </dd>
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
          <p className="muted shop__bag-hint">押すと外す（買ったものは、なくならない）。指輪は指{fingerCount}本まで（思い出した記憶で増える）</p>
          </div>
        )}
        <button type="button" className="primary shop__go" onClick={onDepart}>
          {kitLoadout(save).length === 0 ? '何も持たずに出発する' : kit.weapon ? 'この持ち物で出発する' : '武器なしで出発する'}
        </button>
      </section>
      )}
    </main>
  );
}

/** 買い物の画面の、品物の右側：値段と「買う」。持っているもの（道具は倉庫の数）は、その印 */
function BuyDeal({ id, shelf, save, atEntry, apply }: { id: ItemId; shelf: Shelf; save: SaveData; atEntry: readonly ItemId[]; apply: (r: Result<SaveData>) => void }) {
  const price = ITEMS[id].price;
  const short = price > save.gold;
  if (shelf !== 'supply' && save.owned.includes(id)) return <span className="shop__owned">持っている</span>;
  return (
    <>
      {shelf === 'supply' && <span className="shop__owned">倉庫{count(save.stock, id)}</span>}
      <span className="shop__price">{lost(price)}</span>
      <button
        type="button"
        className={short ? 'shop__buy shop__buy--off' : 'primary shop__buy'}
        disabled={short}
        aria-label={short ? `${ITEMS[id].name}は、忘れ物があと${price - save.gold}足りない` : undefined}
        onClick={() => apply(buy(save, id, atEntry))}
      >
        {/* 足りないときは、あといくら足りないかを出す（2026-11-28） */}
        {short ? `あと${lost(price - save.gold)}` : '買う'}
      </button>
    </>
  );
}

/** 装備の画面の、品物の右側：「装備する」「サブにする」「付ける」「持っていく」（道具は、持っていく数の −・＋） */
function EquipDeal({ id, shelf, save, apply }: { id: ItemId; shelf: Shelf; save: SaveData; apply: (r: Result<SaveData>) => void }) {
  if (shelf === 'supply') {
    const inStock = count(save.stock, id);
    const taking = count(save.kit.take, id);
    return (
      <>
        <span className="shop__stock">
          倉庫{inStock}・持っていく{taking}
          <button type="button" className="shop__step" aria-label={`${ITEMS[id].name}を1つ減らす`} disabled={taking === 0} onClick={() => apply(takeSupply(save, id, -1))}>
            −
          </button>
          <button
            type="button"
            className="shop__step"
            aria-label={`${ITEMS[id].name}を1つ増やす`}
            disabled={taking >= inStock || !canTake(save.kit.take, id, Boolean(save.kit.weapon2))}
            onClick={() => apply(takeSupply(save, id, 1))}
          >
            ＋
          </button>
        </span>
      </>
    );
  }
  if (shelf === 'book') {
    const taking = save.kit.books.includes(id);
    return (
      <>
        <button type="button" className={taking ? 'shop__buy shop__buy--off' : 'primary shop__buy'} onClick={() => apply(toggleBook(save, id))}>
          {taking ? '外す' : '持っていく'}
        </button>
      </>
    );
  }
  if (shelf === 'ring') {
    const wearing = kitRings(save).includes(id);
    return (
      <>
        <button type="button" className={wearing ? 'shop__buy shop__buy--off' : 'primary shop__buy'} onClick={() => apply(wearing ? unequipRing(save, id) : equipRing(save, id))}>
          {wearing ? '外す' : '付ける'}
        </button>
      </>
    );
  }
  const slot = shelf === 'weapon' ? 'weapon' : 'armor';
  // 刻印武器を付けているときは、元の武器（ふつうの武器）は装備していない扱い（刻印の売り場で付け外しする）
  const wearing = save.kit[slot] === id && !(slot === 'weapon' && save.kit.weaponGear);
  const isSub = slot === 'weapon' && save.kit.weapon2 === id && !save.kit.weapon2Gear;
  return (
    <>
      {slot === 'weapon' && !wearing && (
        // サブ武器：探索中に持ち替えて使う（メインとちがう種類。道具を持てる数が1つ減る）
        <button
          type="button"
          className={isSub ? 'shop__buy shop__buy--off' : 'shop__buy shop__buy--second'}
          title="持ち替えて使う2本目の武器（メインとちがう種類。道具を持てる数が1つ減る）"
          onClick={() => apply(equipSub(save, isSub ? null : id))}
        >
          {isSub ? 'サブを外す' : 'サブにする'}
        </button>
      )}
      <button type="button" className={wearing ? 'shop__buy shop__buy--off' : 'primary shop__buy'} disabled={wearing} onClick={() => apply(equip(save, slot, id))}>
        {wearing ? '装備中' : '装備する'}
      </button>
    </>
  );
}

/**
 * 武器・防具の、今の装備とのちがい（攻撃・魔力・守りの増減）。装備しているもの・何も装備していないときは、上がる数だけ
 */
function Compare({ id, save }: { id: ItemId; save: SaveData }) {
  const e = ITEMS[id].effect;
  const cur = e.kind === 'weapon' ? save.kit.weapon : e.kind === 'armor' ? save.kit.armor : null;
  if (cur === id || (e.kind !== 'weapon' && e.kind !== 'armor')) return null;
  const c = cur ? ITEMS[cur].effect : null;
  const parts: [string, number][] =
    e.kind === 'weapon'
      ? [
          ['攻撃', e.atk - (c?.kind === 'weapon' ? c.atk : 0)],
          ['魔力', e.mag - (c?.kind === 'weapon' ? c.mag : 0)],
        ]
      : [
          ['守り', e.def - (c?.kind === 'armor' ? c.def : 0)],
          ['魔力', e.mag - (c?.kind === 'armor' ? c.mag : 0)],
        ];
  const shown = parts.filter(([, d]) => d !== 0);
  if (shown.length === 0) return null;
  return (
    <span className="shop__compare" title={cur ? `今の${ITEMS[cur].name}とくらべて` : '何も装備していないときとくらべて'}>
      {shown.map(([k, d]) => (
        <span key={k} className={d > 0 ? 'shop__up' : 'shop__down'}>
          {k}
          {d > 0 ? `+${d}` : d}
        </span>
      ))}
    </span>
  );
}

/** 開いたときの、今の装備との比べ：攻撃・魔力・守りを「今 → この品」で並べる（装備しているものなら、その数字だけ） */
function VersusLine({ id, save }: { id: ItemId; save: SaveData }) {
  const e = ITEMS[id].effect;
  if (e.kind !== 'weapon' && e.kind !== 'armor') return null;
  const cur = e.kind === 'weapon' ? save.kit.weapon : save.kit.armor;
  const c = cur ? ITEMS[cur].effect : null;
  const rows: [string, number, number][] =
    e.kind === 'weapon'
      ? [
          ['攻撃', c?.kind === 'weapon' ? c.atk : 0, e.atk],
          ['魔力', c?.kind === 'weapon' ? c.mag : 0, e.mag],
        ]
      : [
          ['守り', c?.kind === 'armor' ? c.def : 0, e.def],
          ['魔力', c?.kind === 'armor' ? c.mag : 0, e.mag],
        ];
  const same = cur === id;
  return (
    <span className="shop__vs">
      <span className="shop__vs-head">{same ? '装備している' : cur ? `今の${ITEMS[cur].name}とくらべて` : '何も装備していないときとくらべて'}</span>
      {rows.map(([k, before, after]) =>
        same ? (
          <span key={k}>
            {k} <b>{after}</b>
          </span>
        ) : (
          <span key={k}>
            {k} {before} → <b className={after > before ? 'shop__up' : after < before ? 'shop__down' : undefined}>{after}</b>
          </span>
        ),
      )}
    </span>
  );
}

/** 装備している武器（hand：メインかサブか）の名前（刻印武器なら、その名前とはめた残響の数） */
function gearLabel(save: SaveData, hand: 'main' | 'sub' = 'main'): string | undefined {
  const g = save.engraved.find((x) => x.uid === (hand === 'main' ? save.kit.weaponGear : save.kit.weapon2Gear));
  return g ? `${engravedName(g)}（残響${g.slots.filter((s) => s).length}/${g.slots.length}）` : undefined;
}

function Chip({ id, title, label, onClick }: { id: ItemId; title: string; label?: string; onClick: () => void }) {
  return (
    <button type="button" className="shop__chip" onClick={onClick} title={`${ITEMS[id].name}を${title}`}>
      <ItemIcon id={id} size={20} />
      {label ?? ITEMS[id].name.replace('の呪文書', '')}
    </button>
  );
}
