// 準備フェーズのロジック。
// すべて「状態を受け取り、新しい状態を返す」純粋関数。UI（React）からは独立している。

import { itemSlot } from './combat';
import { CARDS, DECK, ITEMS, PREP_CONFIG, TRAITS, TRAIT_IDS } from './data';
import { RANK_CONFIG, rankParams, upgradeCost } from './rank';
import { nextInt, nextRandom, shuffle } from './rng';
import type { CardInstance, ItemId, PrepResult, PrepState, Result } from './types';

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T>(error: string): Result<T> => ({ ok: false, error });

export interface PrepOptions {
  maxDays?: number;
  handSize?: number;
  startGold?: number;
  rank?: number;
  exp?: number;
}

/**
 * 準備フェーズを開始する。
 * 前の周回から持ち越したカードは手札の枠を使い、残りを山札から引く。
 */
export function createPrep(seed: number, carried: CardInstance[] = [], options: PrepOptions = {}): PrepState {
  const maxDays = options.maxDays ?? PREP_CONFIG.maxDays;
  const handSize = options.handSize ?? PREP_CONFIG.handSize;
  const gold = options.startGold ?? PREP_CONFIG.startGold;

  const traitRoll = nextInt(seed, TRAIT_IDS.length);
  const trait = TRAIT_IDS[traitRoll.value]!;

  const drawCount = Math.max(0, handSize - carried.length);
  const shuffled = shuffle(DECK, traitRoll.state);
  const drawn: CardInstance[] = shuffled.value
    .slice(0, drawCount)
    .map((cardId, i) => ({ uid: `s${seed}-c${i}`, cardId }));

  return {
    seed,
    trait,
    phase: 'prep',
    day: 1,
    maxDays,
    hand: [...carried, ...drawn],
    played: [],
    playedToday: false,
    gold,
    knowledge: { status: 'unknown' },
    hasMap: false,
    rank: options.rank ?? 1,
    exp: options.exp ?? 0,
    openShop: null,
    inventory: [],
    rngState: shuffled.state,
    log: [],
  };
}

/** 手札のカードを1枚使う（1日1枚まで） */
export function playCard(state: PrepState, uid: string): Result<PrepState> {
  if (state.phase !== 'prep') return err('準備フェーズは終わっています');
  if (state.playedToday) return err('今日はもうカードを使いました');

  const card = state.hand.find((c) => c.uid === uid);
  if (!card) return err('そのカードは手札にありません');

  const def = CARDS[card.cardId];
  const effect = def.effect;
  let next: PrepState = state;

  switch (effect.kind) {
    case 'rumor': {
      const roll = nextRandom(state.rngState);
      next = { ...next, rngState: roll.state };
      if (roll.value < effect.revealChance) {
        next = learn(next, 'rumor');
      } else {
        next = withLog(next, '有益な噂は聞けなかった');
      }
      break;
    }
    case 'informant': {
      if (state.gold < effect.cost) return err(`お金が足りません（${effect.cost}G必要）`);
      next = learn({ ...next, gold: next.gold - effect.cost }, 'informant');
      break;
    }
    case 'map': {
      if (state.hasMap) return err('地図はもう持っています');
      if (state.gold < effect.cost) return err(`お金が足りません（${effect.cost}G必要）`);
      next = withLog({ ...next, gold: next.gold - effect.cost, hasMap: true }, '地図を手に入れた。各階の階段までの道筋がわかる');
      break;
    }
    case 'open_shop': {
      next = withLog({ ...next, openShop: effect.shop }, `${def.name}：今日は買い物ができる`);
      break;
    }
    case 'work': {
      next = withLog({ ...next, gold: next.gold + effect.gold }, `${effect.gold}G稼いだ`);
      break;
    }
    default: {
      // 新しい効果を追加して case を書き忘れると、ここで型エラーになる
      const unreachable: never = effect;
      return unreachable;
    }
  }

  return ok({
    ...next,
    hand: next.hand.filter((c) => c.uid !== uid),
    played: [...next.played, { day: state.day, card }],
    playedToday: true,
  });
}

/** 今日開いている店でアイテムを買う */
export function buyItem(state: PrepState, itemId: ItemId): Result<PrepState> {
  if (state.phase !== 'prep') return err('準備フェーズは終わっています');
  const item = ITEMS[itemId];
  if (state.openShop !== item.shop) return err('今日はその店に行っていません');
  if (state.gold < item.price) return err(`お金が足りません（${item.price}G必要）`);

  // 武器と防具は1つずつしか装備できないので、2つ目は買えない
  const slot = itemSlot(item);
  const owned = state.inventory.filter((id) => itemSlot(ITEMS[id]) === slot).length;
  if (slot === 'weapon' && owned >= 1) return err('武器はもう持っています（1つまで）');
  if (slot === 'armor' && owned >= 1) return err('防具はもう持っています（1つまで）');
  if (slot === 'consumable' && owned >= PREP_CONFIG.maxItems) {
    return err(`道具はこれ以上持てません（${PREP_CONFIG.maxItems}個まで）`);
  }

  return ok(
    withLog(
      { ...state, gold: state.gold - item.price, inventory: [...state.inventory, itemId] },
      `${item.name}を買った`,
    ),
  );
}

/**
 * ランクを1つ上げる。踏破経験と金貨を払う。カードも日数も使わない。
 * ランクが上がるとダンジョンが広くなるかわりに、満腹度の上限と報酬が増える。
 */
export function upgradeRank(state: PrepState): Result<PrepState> {
  if (state.phase !== 'prep') return err('準備フェーズは終わっています');
  if (state.rank >= RANK_CONFIG.maxRank) return err('これ以上ランクは上げられません');
  if (state.exp < RANK_CONFIG.expPerUpgrade) return err('ダンジョンを踏破した経験が足りません');
  const cost = upgradeCost(state.rank);
  if (state.gold < cost) return err(`お金が足りません（${cost}G必要）`);
  const rank = state.rank + 1;
  return ok(
    withLog(
      { ...state, rank, exp: state.exp - RANK_CONFIG.expPerUpgrade, gold: state.gold - cost },
      `ランク${rank}に上がった。ダンジョンは${rankParams(rank).mapSize}×${rankParams(rank).mapSize}になる`,
    ),
  );
}

/** 1日を終える。カードを使わずに終えることもできる */
export function endDay(state: PrepState): Result<PrepState> {
  if (state.phase !== 'prep') return err('準備フェーズは終わっています');
  const isLastDay = state.day >= state.maxDays;
  return ok({
    ...state,
    day: isLastDay ? state.day : state.day + 1,
    phase: isLastDay ? 'ready' : 'prep',
    playedToday: false,
    openShop: null,
  });
}

/**
 * 準備を終え、探索に向かう。
 * keepUids に指定した余りカードを次の周回に持ち越し、それ以外は捨てる。
 */
export function finishPrep(state: PrepState, keepUids: string[]): Result<PrepResult> {
  if (state.phase !== 'ready') return err('まだ準備期間が残っています');
  if (keepUids.length > PREP_CONFIG.maxCarry) {
    return err(`持ち越せるのは${PREP_CONFIG.maxCarry}枚までです`);
  }
  const carried = keepUids.map((uid) => state.hand.find((c) => c.uid === uid));
  if (carried.some((c) => c === undefined)) return err('手札にないカードは持ち越せません');

  return ok({
    trait: state.trait,
    knowledge: state.knowledge,
    hasMap: state.hasMap,
    rank: state.rank,
    exp: state.exp,
    loadout: state.inventory,
    carried: carried as CardInstance[],
  });
}

/** UIに渡す用の状態。正解の特性は知っている場合だけ見える */
export type PlayerPrepView = Omit<PrepState, 'trait' | 'rngState' | 'seed'>;

export function toPlayerView(state: PrepState): PlayerPrepView {
  const { trait: _trait, rngState: _rng, seed: _seed, ...view } = state;
  return view;
}

// ===== 内部ヘルパー =====

function learn(state: PrepState, source: 'rumor' | 'informant'): PrepState {
  const name = TRAITS[state.trait].name;
  return withLog(
    { ...state, knowledge: { status: 'known', trait: state.trait, source, day: state.day } },
    `ダンジョンには${name}の気配があるらしい`,
  );
}

function withLog(state: PrepState, message: string): PrepState {
  return { ...state, log: [...state.log, `${state.day}日目：${message}`] };
}
