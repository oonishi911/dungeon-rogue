// 敵の図鑑：出会ったことのある敵の、体質・属性・強さ・弱点・効きにくいもの・行動の個性を見る画面（docs/enemy-weakness.md）。
// ダンジョンを選ぶ画面から開く。まだ出会っていない敵は「？？？」で、場所だけ見せる

import { useState } from 'react';
import { bestiary, bestiaryProgress, type BestiaryEntry } from '../game/bestiary';
import type { EnemyId } from '../game/types';
import { BODY_LABELS, ELEMENT_NAMES, elementIcon, rateText, WEAPON_TYPE_NAMES, type WeakIconId } from '../game/weakness';
import { WeakIcon } from './weakIcons';

interface BestiaryScreenProps {
  met: readonly EnemyId[];
  onClose: () => void;
}

export function BestiaryScreen({ met, onClose }: BestiaryScreenProps) {
  const groups = bestiary(met);
  const progress = bestiaryProgress(met);
  const [group, setGroup] = useState(groups[0]?.id ?? 'fire');
  const shown = groups.find((g) => g.id === group) ?? groups[0];
  return (
    <main className="screen screen--narrow screen--fit bestiary">
      <header className="top">
        <div>
          <p className="top__run">
            出会った敵 {progress.met} / {progress.total}
          </p>
          <h1 className="top__title">敵の図鑑</h1>
        </div>
        <button type="button" className="bestiary__close" onClick={onClose}>
          戻る
        </button>
      </header>

      <div className="bestiary__tabs" role="tablist" aria-label="敵の種類">
        {groups.map((g) => {
          const known = g.entries.filter((e) => e.met).length;
          return (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={g.id === shown?.id}
              className={`bestiary__tab bestiary__tab--${g.id}`}
              onClick={() => setGroup(g.id)}
            >
              {g.title}
              <span className="bestiary__count">
                {known}/{g.entries.length}
              </span>
            </button>
          );
        })}
      </div>

      <ul className="bestiary__list screen__scroll" role="tabpanel" aria-label={shown?.title}>
        {shown?.entries.map((e) => (
          <li key={e.id} className={`bestiary__item${e.met ? '' : ' bestiary__item--unknown'}`}>
            {e.met ? <Known entry={e} /> : <Unknown />}
          </li>
        ))}
      </ul>
      <p className="muted bestiary__note">倍率は、ふつうに当てたときとの比べ。強さは、ダンジョンや深さで上がる前の数字。</p>
    </main>
  );
}

function Unknown() {
  return (
    <>
      <h2 className="bestiary__name">？？？</h2>
      <p className="bestiary__hint">まだ出会っていない</p>
    </>
  );
}

function Known({ entry }: { entry: BestiaryEntry }) {
  const { def, weakness: w } = entry;
  const good = [
    ...w.weapons.map((x) => ({ key: x.id, label: WEAPON_TYPE_NAMES[x.id], rate: x.rate, icon: x.id as WeakIconId | null })),
    ...w.elements.map((x) => ({ key: x.id, label: ELEMENT_NAMES[x.id], rate: x.rate, icon: elementIcon(x.id) })),
    ...(w.magic > 1 ? [{ key: 'magic', label: '魔法', rate: w.magic, icon: 'magic' as WeakIconId | null }] : []),
    ...(w.physical > 1 ? [{ key: 'physical', label: '武器の攻撃', rate: w.physical, icon: 'physical' as WeakIconId | null }] : []),
  ];
  const bad = [
    ...w.resistWeapons.map((x) => ({ key: x.id, label: WEAPON_TYPE_NAMES[x.id], rate: x.rate, icon: x.id as WeakIconId | null })),
    ...w.resistElements.map((x) => ({ key: x.id, label: ELEMENT_NAMES[x.id], rate: x.rate, icon: elementIcon(x.id) })),
    ...(w.magic < 1 ? [{ key: 'magic', label: '魔法', rate: w.magic, icon: 'magic' as WeakIconId | null }] : []),
    ...(w.physical < 1 ? [{ key: 'physical', label: '武器の攻撃', rate: w.physical, icon: 'physical' as WeakIconId | null }] : []),
  ];
  return (
    <>
      <h2 className="bestiary__name">{def.name}</h2>
      <p className="bestiary__tags">
        <span className={`bestiary__tag bestiary__tag--${def.element}`}>{ELEMENT_NAMES[def.element]}</span>
        <span className="bestiary__tag">{BODY_LABELS[def.body]}の体</span>
        {entry.behaviors.map((b) => (
          <span key={b} className="bestiary__tag bestiary__tag--behavior">
            {b}
          </span>
        ))}
      </p>
      <dl className="bestiary__facts">
        <div>
          <dt>HP</dt>
          <dd>{def.hp}</dd>
        </div>
        <div>
          <dt>攻撃</dt>
          <dd>{def.atk}</dd>
        </div>
        <div>
          <dt>守り</dt>
          <dd>{def.def}</dd>
        </div>
      </dl>
      <div className="bestiary__row">
        <span className="bestiary__label bestiary__label--good">よく効く</span>
        {good.length ? (
          <span className="bestiary__chips">
            {good.map((g) => (
              <span key={g.key} className="bestiary__chip">
                {g.icon && <WeakIcon id={g.icon} className="bestiary__icon" />}
                {g.label}
                <small>{rateText(g.rate)}</small>
              </span>
            ))}
          </span>
        ) : (
          <span className="bestiary__none">とくになし</span>
        )}
      </div>
      <div className="bestiary__row">
        <span className="bestiary__label bestiary__label--bad">効きにくい</span>
        {bad.length ? (
          <span className="bestiary__chips">
            {bad.map((g) => (
              <span key={g.key} className="bestiary__chip bestiary__chip--dim">
                {g.icon && <WeakIcon id={g.icon} className="bestiary__icon" />}
                {g.label}
                <small>{rateText(g.rate)}</small>
              </span>
            ))}
          </span>
        ) : (
          <span className="bestiary__none">とくになし</span>
        )}
      </div>
    </>
  );
}
