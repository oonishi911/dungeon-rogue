// アイテムのアイコン（装備・道具・呪文書）。絵はファイルにせず、SVG の図形で描く（24×24 の枠）。
// 呪文書は、本の上に呪文の印（炎・雪の結晶・光・月・ハート など）を重ねる。
// 名前といっしょに出すときは、読み上げでは名前だけを読む（アイコンは aria-hidden）。アイコンだけのボタンには、呼ぶ側で aria-label を付ける

import type { ReactElement } from 'react';
import { ITEMS } from '../game/data';
import { baseItemOf, pairElements, ringOf } from '../game/itemMaster';
import type { ItemId, RingKind, SpellId } from '../game/types';

const C = {
  steel: '#cfd6d4',
  steelDark: '#8a9692',
  wood: '#9a6b43',
  woodDark: '#6e4a2c',
  fire: '#e0653a',
  fireLight: '#f2b04a',
  ice: '#7cc4e8',
  iceLight: '#d4f0fb',
  light: '#f3e3a1',
  lightDeep: '#d9b84e',
  dark: '#7a5aa8',
  darkDeep: '#3f2d5e',
  heal: '#e4637a',
  green: '#7fbf6a',
  stone: '#8e948f',
  bread: '#c98f4f',
  breadLight: '#e8bc7c',
  glass: '#e8f1ef',
  ink: '#1c2624',
};

// ===== 印（呪文や属性を表す小さな絵。中心を (12,12) にして描き、置き場所は transform で決める） =====

const flame = (fill = C.fire, inner = C.fireLight) => (
  <>
    <path d="M12 3c3 4 6 6.2 6 10.4A6 6 0 0 1 6 13.4c0-2.6 1.4-4.4 2.9-5.6.1 2.1 1 3.4 2.3 3.6-.5-3 .1-5.6.8-8.4z" fill={fill} />
    <path d="M12 11.5c1.6 1.8 2.8 2.9 2.8 4.7a2.8 2.8 0 0 1-5.6 0c0-1.4.9-2.4 1.6-3.1.2.9.6 1.4 1.2 1.5-.2-1.1-.1-2.1 0-3.1z" fill={inner} />
  </>
);

const snowflake = (stroke = C.ice) => (
  <g stroke={stroke} strokeWidth="2" strokeLinecap="round">
    <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
    <path d="M9.6 4.6 12 6.8l2.4-2.2M9.6 19.4 12 17.2l2.4 2.2" strokeWidth="1.6" fill="none" />
  </g>
);

const sparkle = (fill = C.light) => <path d="M12 2.5 13.9 10.1 21.5 12l-7.6 1.9L12 21.5l-1.9-7.6L2.5 12l7.6-1.9z" fill={fill} />;

const moon = (fill = C.dark) => <path d="M14.5 3.2A9 9 0 1 0 20.8 15 7.2 7.2 0 0 1 14.5 3.2z" fill={fill} />;

const heart = (fill = C.heal) => <path d="M12 20.5S3.5 15 3.5 9.2A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8.5 2.2C20.5 15 12 20.5 12 20.5z" fill={fill} />;

const leaf = (fill = C.green) => (
  <>
    <path d="M5 19C5 9 11 4.5 20 4.5 20 13.5 15 19 5 19z" fill={fill} />
    <path d="M6.5 17.5 15 9" stroke={C.ink} strokeOpacity="0.45" strokeWidth="1.4" strokeLinecap="round" />
  </>
);

const rings = (stroke = C.iceLight) => (
  <g fill="none" stroke={stroke} strokeWidth="2">
    <circle cx="12" cy="12" r="2.6" fill={stroke} />
    <circle cx="12" cy="12" r="6" strokeOpacity="0.8" />
    <circle cx="12" cy="12" r="9.5" strokeOpacity="0.5" />
  </g>
);

/** 強衝撃の印：衝撃の輪に、外へ走る4本の筋と、動けなくする星（中心のきらめき）を足す */
const strongRings = () => (
  <>
    {rings('#9fd0ff')}
    <g stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round">
      <path d="M12 0.8v2.6M12 20.6v2.6M0.8 12h2.6M20.6 12h2.6" />
    </g>
    <path d="M12 9.6 12.7 11.3 14.4 12 12.7 12.7 12 14.4 11.3 12.7 9.6 12 11.3 11.3z" fill="#ffffff" />
  </>
);

/** 烈なぎ払いの印：刃に、したたる血のしずくを2つ足す */
const bleedSlash = () => (
  <>
    {slash('#e8ecf2')}
    <path d="M17.5 12.2c1.5 2.2 2.2 3.4 2.2 4.6a2.2 2.2 0 0 1-4.4 0c0-1.2.7-2.4 2.2-4.6z" fill="#d6283a" />
    <path d="M9.4 15.6c1 1.5 1.5 2.3 1.5 3.1a1.5 1.5 0 0 1-3 0c0-.8.5-1.6 1.5-3.1z" fill="#d6283a" />
  </>
);

const slash = (stroke = C.steel) => <path d="M4 17C8 7 15 5 20.5 6.5 15.5 7.5 10 11 6.5 19.5z" fill={stroke} />;

/** 連矢の印：矢の印を大きく中央に、まわりに小さな印を2つ添える（まわりの敵にも当たる） */
const chain = (mark: ReactElement) => (
  <>
    <g opacity="0.75">
      {place(mark, 5.6, 6, 8)}
      {place(mark, 18.4, 18, 8)}
    </g>
    {place(mark, 12, 12, 16)}
  </>
);

const SPELL_MARKS: Record<SpellId, () => ReactElement> = {
  shockwave: () => rings(),
  shockwave_strong: () => strongRings(),
  sweep: () => slash(),
  sweep_bleed: () => bleedSlash(),
  fire_bolt: () => flame(),
  fire_chain: () => chain(flame()),
  ice_bolt: () => snowflake(C.iceLight),
  ice_chain: () => chain(snowflake(C.iceLight)),
  light_lance: () => sparkle(),
  light_chain: () => chain(sparkle()),
  dark_bolt: () => moon('#c9b3f0'),
  dark_chain: () => chain(moon('#c9b3f0')),
  heal: () => heart(),
  regen: () => leaf(),
};

/** 印を、枠の中の (x, y) を中心に、size の大きさで置く */
const place = (mark: ReactElement, x: number, y: number, size: number) => <g transform={`translate(${x - size / 2} ${y - size / 2}) scale(${size / 24})`}>{mark}</g>;

// ===== アイテムの形 =====

/** 指輪：金の輪に、宝石を置く。宝石の色と中の印は、属性で決まる（万能は白い宝石、二重耐性は2つの宝石） */
const GEMS: Record<RingKind, { fill: string; mark: () => ReactElement }> = {
  fire: { fill: '#c9482c', mark: () => flame(C.fireLight, '#fff1c9') },
  ice: { fill: '#3d78a3', mark: () => snowflake(C.iceLight) },
  neutral: { fill: '#8e948f', mark: () => <circle cx="12" cy="12" r="5" fill={C.steel} /> },
  light: { fill: '#d9b84e', mark: () => sparkle('#fff6c8') },
  dark: { fill: C.darkDeep, mark: () => moon('#c9b3f0') },
  all: { fill: '#e8f1ef', mark: () => sparkle(C.lightDeep) },
};

const ringShape = (id: ItemId) => {
  const info = ringOf(id);
  const kinds: RingKind[] = info?.kind === 'dual' && info.pair ? (pairElements(info.pair) as RingKind[]) : [(info?.kind ?? 'all') as RingKind];
  return (
    <>
      <circle cx="12" cy="14.5" r="6" fill="none" stroke="#c9a24a" strokeWidth="2.6" />
      <circle cx="12" cy="14.5" r="6" fill="none" stroke="#f1d98a" strokeWidth="0.8" strokeDasharray="6 32" strokeLinecap="round" />
      {kinds.length === 1 ? (
        <>
          <path d="M8.2 6.2 12 3l3.8 3.2L12 10z" fill={GEMS[kinds[0]!].fill} stroke="#7a5f22" strokeWidth="0.8" strokeLinejoin="round" />
          {place(GEMS[kinds[0]!].mark(), 12, 6.6, 4.4)}
        </>
      ) : (
        kinds.map((k, i) => (
          <g key={k}>
            <circle cx={i === 0 ? 8.6 : 15.4} cy="6.4" r="3" fill={GEMS[k].fill} stroke="#7a5f22" strokeWidth="0.8" />
            {place(GEMS[k].mark(), i === 0 ? 8.6 : 15.4, 6.4, 3.8)}
          </g>
        ))
      )}
    </>
  );
};

const whetstone = (mark: ReactElement) => (
  <>
    <rect x="3" y="11" width="18" height="8.5" rx="2.5" fill={C.stone} />
    <rect x="3" y="11" width="18" height="3" rx="1.5" fill={C.steel} opacity="0.55" />
    {place(mark, 12, 7.5, 10)}
  </>
);

const flask = (liquid: string, mark?: ReactElement) => (
  <>
    <rect x="9.5" y="2.5" width="5" height="3" rx="1" fill={C.wood} />
    <path d="M10 5.5h4v3.6a6.5 6.5 0 1 1-4 0z" fill={C.glass} opacity="0.9" />
    <path d="M6.4 14.2h11.2a5.6 5.6 0 0 1-11.2 0z" fill={liquid} />
    <path d="M7.2 12.2a6 6 0 0 1 2-2.4" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.2" strokeLinecap="round" fill="none" />
    {mark && place(mark, 12, 15.5, 5.5)}
  </>
);

const book = (cover: string, mark: ReactElement) => (
  <>
    <path d="M5 3.5h12.5a1.5 1.5 0 0 1 1.5 1.5v15.5H6.5A1.5 1.5 0 0 1 5 19z" fill={cover} />
    <path d="M6.5 17.5H19v3H6.5a1.5 1.5 0 0 1 0-3z" fill={C.glass} />
    <path d="M7.5 3.5v14" stroke={C.ink} strokeOpacity="0.35" strokeWidth="1.2" />
    {place(mark, 13.2, 10.2, 10)}
  </>
);

// 武器と防具は種類ごとに1つ（段階が違っても同じ絵）
const SHAPES: Partial<Record<ItemId, () => ReactElement>> = {
  sword: () => (
    <>
      <path d="M19.5 3.5 20.5 4.5 10 15 9 14z" fill={C.steel} />
      <path d="M20.5 3.5l-.5 3-10 10-1.5-1.5z" fill={C.steelDark} opacity="0.5" />
      <path d="M6.5 13.5l4 4" stroke={C.lightDeep} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M8.5 15.5 4 20" stroke={C.wood} strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="3.6" cy="20.4" r="1.4" fill={C.lightDeep} />
    </>
  ),
  hammer: () => (
    <>
      <path d="M15 9 4 20" stroke={C.wood} strokeWidth="2.6" strokeLinecap="round" />
      <g transform="rotate(45 15.5 8.5)">
        <rect x="10" y="5.5" width="11" height="6" rx="1.2" fill={C.steelDark} />
        <rect x="10" y="5.5" width="11" height="2.4" rx="1" fill={C.steel} />
      </g>
    </>
  ),
  staff: () => (
    <>
      <path d="M15 9 5 21" stroke={C.wood} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M14.2 9.8c-1.6-1.6-1.6-4.6.4-6.4" stroke={C.woodDark} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <circle cx="17" cy="7" r="3.6" fill="#a98be6" />
      <circle cx="16" cy="6" r="1.2" fill="#fff" opacity="0.8" />
    </>
  ),
  plate: () => (
    <>
      <path d="M6 4.5h3.5L12 6l2.5-1.5H18l3 3.5-2.5 2.5V19a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-8.5L3 8z" fill={C.steelDark} />
      <path d="M8 9.5h8v3.5a4 4 0 0 1-8 0z" fill={C.steel} />
      <path d="M12 6v14.5" stroke={C.ink} strokeOpacity="0.3" strokeWidth="1.2" />
    </>
  ),
  potion: () => flask(C.heal, heart('#fff')),
  panacea: () => flask(C.green, sparkle('#fff')),
  food: () => (
    <>
      <path d="M3.5 13.5C3.5 9 7.5 6.5 12 6.5s8.5 2.5 8.5 7v3a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" fill={C.bread} />
      <path d="M4 12.5C5 9.6 8 8 12 8s7 1.6 8 4.5" stroke={C.breadLight} strokeWidth="1.6" fill="none" />
      <path d="M8.5 9.5l1.5 3M12 9l.5 3.2M15.5 9.5l-1 3" stroke="#7a4f24" strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
  fire_whetstone: () => whetstone(flame()),
  ice_whetstone: () => whetstone(snowflake()),
  holy_water: () => flask(C.light, sparkle('#fff')),
  dark_oil: () => flask(C.dark, moon('#e3d6fb')),
  bag: () => (
    <>
      <path d="M8.5 6.5c-1-1.6-.4-3 1-3h5c1.4 0 2 1.4 1 3" fill="none" stroke={C.woodDark} strokeWidth="1.4" />
      <path d="M7 7.5h10l2.5 9.5a3.5 3.5 0 0 1-3.4 4.5H7.9a3.5 3.5 0 0 1-3.4-4.5z" fill={C.wood} />
      <path d="M7 7.5h10l.6 2.3H6.4z" fill={C.woodDark} />
      <path d="M12 12v6M9 15h6" stroke={C.light} strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  lantern: () => (
    <>
      <path d="M9 4.5a3 3 0 0 1 6 0" stroke={C.steelDark} strokeWidth="1.6" fill="none" />
      <rect x="7" y="6" width="10" height="2.4" rx="1" fill={C.steelDark} />
      <rect x="7.8" y="8.4" width="8.4" height="10" rx="1.6" fill={C.light} />
      <path d="M12 10.2c1.6 1.6 1.8 3.4 0 5.4-1.8-2-1.6-3.8 0-5.4z" fill={C.lightDeep} />
      <path d="M9.6 8.4v10M14.4 8.4v10" stroke={C.steelDark} strokeWidth="1" />
      <rect x="7" y="18.4" width="10" height="2.4" rx="1" fill={C.steelDark} />
    </>
  ),
  book_shockwave: () => book('#4f6f8a', SPELL_MARKS.shockwave()),
  book_shockwave_strong: () => book('#4f6f8a', SPELL_MARKS.shockwave_strong()),
  book_sweep: () => book('#5b6b5e', SPELL_MARKS.sweep()),
  book_sweep_bleed: () => book('#5b4a4e', SPELL_MARKS.sweep_bleed()),
  book_fire_bolt: () => book('#8a3a28', SPELL_MARKS.fire_bolt()),
  book_fire_chain: () => book('#8a3a28', SPELL_MARKS.fire_chain()),
  book_ice_bolt: () => book('#2f5f7f', SPELL_MARKS.ice_bolt()),
  book_ice_chain: () => book('#2f5f7f', SPELL_MARKS.ice_chain()),
  book_light_lance: () => book('#8a7432', SPELL_MARKS.light_lance()),
  book_light_chain: () => book('#8a7432', SPELL_MARKS.light_chain()),
  book_dark_bolt: () => book(C.darkDeep, SPELL_MARKS.dark_bolt()),
  book_dark_chain: () => book(C.darkDeep, SPELL_MARKS.dark_chain()),
  book_heal: () => book('#7f3546', SPELL_MARKS.heal()),
  book_regen: () => book('#3f6a3a', SPELL_MARKS.regen()),
};

/** アイテムのアイコン。size は表示の大きさ（px） */
export function ItemIcon({ id, size = 24, className }: { id: ItemId; size?: number; className?: string }) {
  const shape = ringOf(id) ? () => ringShape(id) : SHAPES[baseItemOf(id)];
  return (
    <svg className={className ? `item-icon ${className}` : 'item-icon'} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {shape ? shape() : <circle cx="12" cy="12" r="8" fill={C.stone} />}
    </svg>
  );
}

/** 呪文の印のアイコン（呪文のボタンで使う） */
export function SpellIcon({ spell, size = 24 }: { spell: SpellId; size?: number }) {
  return (
    <svg className="item-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {SPELL_MARKS[spell]()}
    </svg>
  );
}

/** アイコンと名前を並べたものを、いくつも並べる（持ち物の一覧。同じアイテムは「×2」にまとめる） */
export function ItemList({ ids }: { ids: readonly ItemId[] }) {
  const counts = new Map<ItemId, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return (
    <span className="item-list">
      {[...counts].map(([id, n]) => (
        <ItemLabel key={id} id={id} name={n > 1 ? `${ITEMS[id].name}×${n}` : ITEMS[id].name} />
      ))}
    </span>
  );
}

/** アイコンと名前を並べた1つ（持ち物の一覧などで使う） */
export function ItemLabel({ id, name }: { id: ItemId; name: string }) {
  return (
    <span className="item-label">
      <ItemIcon id={id} size={20} />
      {name}
    </span>
  );
}
