import { CARDS } from '../game/data';
import type { CardCategory, CardId } from '../game/types';

export const CATEGORY_LABEL: Record<CardCategory, string> = {
  info: '情報',
  procure: '調達',
  funds: '資金',
};

interface CardProps {
  cardId: CardId;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  size?: 'hand' | 'slot';
  ariaLabel?: string;
}

/** カード1枚。クリックできるときは button、できないときは div として描く */
export function Card({ cardId, onClick, disabled, selected, size = 'hand', ariaLabel }: CardProps) {
  const def = CARDS[cardId];
  const className = `card card--${def.category} card--${size}${selected ? ' is-selected' : ''}`;
  const body = (
    <>
      <span className="card__kind">{CATEGORY_LABEL[def.category]}</span>
      <span className="card__name">{def.name}</span>
      {size === 'hand' && <span className="card__desc">{def.description}</span>}
    </>
  );

  if (!onClick) return <div className={className}>{body}</div>;
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={ariaLabel}
    >
      {body}
    </button>
  );
}
