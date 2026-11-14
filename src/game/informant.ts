// 情報屋のルール。ダンジョンを選んだあと、店に行く前に、これから入るダンジョンのことを聞き出す。
// - 聞けることは3つ：どんなダンジョンか（属性）、どんな魔物が多いか（体質）、奥のボスのこと
// - 1回の訪問で聞けるのは INFORMANT_CONFIG.questions 回まで
// - 1回目だけは「それとなく聞く」ができ、無料。答えはぼんやりしていて、本当の答えと、違う答えの2つが混ざる
// - 「はっきり聞く」は情報料（品物の設定 items.json の information。管理画面の「品物」タブ）を払い、正しい答えが聞ける
// ぼんやりした答えに混ぜる違う答えは、ダンジョンのシードから決める（同じダンジョンなら、いつも同じ答え）。
// ほかのロジックと同じく、状態を受け取り新しい状態を返す純粋関数でできている。

import { BODY_NAMES, ENEMIES, ITEM_MASTER, TRAITS, TRAIT_IDS } from './data';
import { dungeonOf } from './dungeons';
import { nextInt } from './rng';
import type { SaveData } from './save';
import type { Body, Element, EnemyId, Result, TraitId } from './types';

export const INFORMANT_CONFIG = {
  questions: 2, // 1回の訪問で聞ける回数
} as const;

export type Topic = 'trait' | 'body' | 'boss';

export const TOPICS: readonly { id: Topic; ask: string; label: string }[] = [
  { id: 'trait', ask: 'どんなダンジョンなんだ？', label: 'ダンジョンの属性' },
  { id: 'body', ask: 'どんな魔物が多い？', label: '多い魔物の体' },
  { id: 'boss', ask: '奥にいるボスのことを教えてくれ', label: 'ボス' },
];

/** 聞き出したこと。vague：ぼんやりした答え（うわさ） */
export interface Intel {
  topic: Topic;
  vague: boolean;
  text: string; // 情報屋の答え
  memo: string; // 店の画面に出す短いメモ
}

export interface InformantState {
  dungeon: string;
  seed: number;
  trait: TraitId; // 本当の属性（画面には出さない）
  heard: Intel[];
}

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T>(error: string): Result<T> => ({ ok: false, error });

export function startInformant(dungeon: string, seed: number, trait: TraitId): InformantState {
  return { dungeon, seed, trait, heard: [] };
}

/** はっきり聞くときの情報料 */
export function priceOf(topic: Topic): number {
  return ITEM_MASTER.information[topic];
}

export const questionsLeft = (s: InformantState): number => INFORMANT_CONFIG.questions - s.heard.length;
/** それとなく（無料で）聞けるか：1回目だけ */
export const canAskVaguely = (s: InformantState): boolean => s.heard.length === 0;
export const alreadyAsked = (s: InformantState, topic: Topic): boolean => s.heard.some((h) => h.topic === topic);

/**
 * 聞く。clear なら情報料を払って、はっきり聞く。返すのは、聞いたあとの情報屋の状態と、情報料を払ったあとのセーブデータ
 */
export function ask(s: InformantState, save: SaveData, topic: Topic, clear: boolean): Result<{ state: InformantState; save: SaveData }> {
  if (questionsLeft(s) <= 0) return err('もう話は終わりだ');
  if (alreadyAsked(s, topic)) return err('それはもう話した');
  if (!clear && !canAskVaguely(s)) return err('ただで話すのは1つだけだ');
  const price = clear ? priceOf(topic) : 0;
  if (price > save.gold) return err('金貨が足りない');
  const intel = answer(s, topic, !clear);
  return ok({ state: { ...s, heard: [...s.heard, intel] }, save: { ...save, gold: save.gold - price } });
}

// ===== 答え =====

/** 属性ごとの、うわさの言い回し */
const TRAIT_RUMOR: Record<TraitId, string> = {
  fire: '焦げた匂いが漂っていた',
  ice: '息が白くなるほど寒かった',
  neutral: 'これといって変わった気配はなかった',
  light: '目がくらむほどまぶしかった',
  dark: '灯りが吸い込まれるほど暗かった',
};

const BODY_IDS: readonly Body[] = ['normal', 'soft', 'hard', 'spirit'];

/** 本当の答え（a）と、違う答え（b）を、シードから決めた順に並べる */
function mix<T>(seed: number, salt: number, truth: T, others: readonly T[]): [T, T] {
  const pool = others.filter((x) => x !== truth);
  const pick = nextInt((seed ^ salt) >>> 0, pool.length);
  const decoy = pool[pick.value] ?? truth;
  const order = nextInt(pick.state, 2);
  return order.value === 0 ? [truth, decoy] : [decoy, truth];
}

/** そのダンジョンの道中で、いちばん多い魔物の体（出やすさの重みで数える） */
export function commonBody(dungeon: string, trait: TraitId): Body {
  const counts = new Map<Body, number>();
  for (const id of dungeonOf(dungeon).encounters[trait].pool) {
    const body = ENEMIES[id]?.body;
    if (body) counts.set(body, (counts.get(body) ?? 0) + 1);
  }
  return BODY_IDS.reduce((best, b) => ((counts.get(b) ?? 0) > (counts.get(best) ?? 0) ? b : best), BODY_IDS[0]!);
}

export function bossOf(dungeon: string, trait: TraitId): EnemyId {
  return dungeonOf(dungeon).encounters[trait].boss;
}

const bodyText = (b: Body) => `${BODY_NAMES[b]}${b === 'spirit' ? '' : '体'}`;
const elementText = (e: Element) => TRAITS[e].name;

function answer(s: InformantState, topic: Topic, vague: boolean): Intel {
  switch (topic) {
    case 'trait': {
      const name = TRAITS[s.trait].name;
      if (!vague) return { topic, vague, text: `あそこは${name}のダンジョンだ。間違いない。`, memo: `属性：${name}` };
      const [a, b] = mix(s.seed, 0x11, s.trait, TRAIT_IDS);
      return {
        topic,
        vague,
        text: `入った奴の話じゃ「${TRAIT_RUMOR[a]}」とも「${TRAIT_RUMOR[b]}」とも聞く。どっちが本当かは知らねえ。`,
        memo: `属性：${TRAITS[a].name}か${TRAITS[b].name}（うわさ）`,
      };
    }
    case 'body': {
      const body = commonBody(s.dungeon, s.trait);
      if (!vague) return { topic, vague, text: `多いのは${bodyText(body)}の魔物だ。`, memo: `多い魔物：${bodyText(body)}` };
      const [a, b] = mix(s.seed, 0x22, body, BODY_IDS);
      return { topic, vague, text: `${bodyText(a)}の魔物か、${bodyText(b)}の魔物が多いらしいぜ。`, memo: `多い魔物：${bodyText(a)}か${bodyText(b)}（うわさ）` };
    }
    case 'boss': {
      const boss = ENEMIES[bossOf(s.dungeon, s.trait)];
      if (!boss) return { topic, vague, text: 'ボスのことは、誰も知らねえ。', memo: 'ボス：不明' };
      if (!vague) {
        return {
          topic,
          vague,
          text: `奥にいるのは${boss.name}だ。${elementText(boss.element)}の力を持つ、${bodyText(boss.body)}の化け物さ。`,
          memo: `ボス：${boss.name}（${elementText(boss.element)}・${bodyText(boss.body)}）`,
        };
      }
      const [a, b] = mix(s.seed, 0x33, boss.element, TRAIT_IDS);
      return { topic, vague, text: `ボスは${elementText(a)}か${elementText(b)}の力を使うと聞いた。姿までは知らねえ。`, memo: `ボス：${elementText(a)}か${elementText(b)}の力（うわさ）` };
    }
  }
}
