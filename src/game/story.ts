// ストーリー（docs/story.md）の文章と、「いつ、何を見せるか」の決まり。
// ボスを倒す（踏破する）と、そのボスの記憶が戻る。記憶は5つ（順不同）。5つそろうと、最後の場面が出る。
// そのあとは、ボスを倒すたびに、部屋の場面と、あの子のかけらが1つ出る。
// 自害は、場面を描かず、方法にも触れず、肯定しない。ほのめかしだけにする（docs/story.md「表現の約束」）。

import type { SaveData } from './save';

/** 記憶の画面に出す、ひとつ分の記憶 */
export interface Memory {
  feeling: string; // 感情の形（見出しには出さない。記録用）
  lines: string[]; // 記憶の文章
  crossed: string; // 書いては消した言葉（画面では、取り消し線で消す）
  echo: string; // 倒したボスの一文
}

export const MEMORIES: Record<string, Memory> = {
  flame_beast: {
    feeling: '怒りと恐れ',
    lines: ['大きな声が、家をゆらしていた。', 'あの子は、布団の中で息をひそめた。', '誰も来ない。耳をふさいでも、声は入ってきた。'],
    crossed: 'やめて',
    echo: '炎の魔獣が崩れた。焦げた匂いだけが、あの夜と同じだった。',
  },
  ice_colossus: {
    feeling: '孤立',
    lines: ['呼んでも、振り向く人はいなかった。', 'あの子は、笑うのをやめた。', '冷たいのは、外ではなかった。'],
    crossed: 'ここにいるよ',
    echo: '氷の巨像が砕けた。冷たい指先の感触だけが、手に残った。',
  },
  ogre_chief: {
    feeling: '自責',
    lines: ['うまくできない自分が悪いのだと、あの子は思った。', '責める声は、いつのまにか、自分の声になっていた。'],
    crossed: 'ごめんなさい',
    echo: '鬼の首領が膝をついた。誰かを責めた声が、自分のものだと気づく。',
  },
  light_guardian: {
    feeling: '裏切られた期待',
    lines: ['「きっと大丈夫」と、誰かが言った。', 'あの子は、それを信じた。', '大丈夫では、なかった。'],
    crossed: 'きっと',
    echo: '光の守護者が消えた。まぶしさの向こうに、小さな背中が見えた気がした。',
  },
  dark_lord: {
    feeling: '消えたい願い',
    lines: ['消えてしまいたい、と、はじめて思った夜。', 'あの子は、まだ小さかった。', 'その願いだけが、いまも、あなたの中にある。'],
    crossed: 'だれにも',
    echo: '闇の王が溶けた。暗がりが、少しだけ、やさしかった。',
  },
};

/** 記憶の数（5つそろうと、最後の場面が出る） */
export const MEMORY_COUNT = Object.keys(MEMORIES).length;

/** 部屋の場面。最初の1回はこの2行。2回目以降は、ほんの少しの変化の一行と、同じ一言 */
export const ROOM_FIRST = ['カーテンの閉まった部屋。何日も、同じ天井を見ている。', '「また、終わらせようか」'];
export const ROOM_CHANGES = ['今朝は、窓の外の音が、少し聞こえた。', 'カーテンのすきまから、光が細く入っていた。', '机の上のコップに、水が入っていた。', '誰かの足音が、廊下を通りすぎた。'];
export const ROOM_WISH = '「また、終わらせようか」';

/** 最後の場面（5つそろったとき） */
export const ENDING = [
  'あの子の顔を、ようやく思い出す。',
  'それは、鏡の中のあなたに、よく似ていた。',
  'あの子は、あなた自身だった。',
  '救いたかったのは、いつも、あの頃の自分だった。',
  'けれど、時は戻らない。',
  '灯を消せば、また朝が来る。',
];

/** あの子のかけら（5つそろったあと、ボスを倒すたびに1つ。使い切ったら、最後のものを繰り返す） */
export const FRAGMENTS = [
  'あの子は、雪が好きだった。',
  'あの子は、あたたかいミルクを、両手で持つのが好きだった。',
  'あの子は、帰り道で、猫にあいさつをしていた。',
  'あの子は、鼻歌をうたうとき、いつも同じところで間違えた。',
  'あの子は、星の名前を、ひとつだけ知っていた。',
  'あの子は、いつか大きくなったら、遠くへ行きたいと言っていた。',
  'あの子は、誰かの「ありがとう」が、うれしかった。',
  'あの子は、ほんとうは、笑うのが好きだった。',
];

/**
 * 力尽きたとき、結果の画面に出す文章（時が戻る）。挑戦の回数で順に変わる。
 * 終わらせたい気持ちは、ほのめかすだけ。方法には触れない。最後は、ほんの少しだけ、前を向く
 */
export const REWIND_LINES: readonly (readonly string[])[] = [
  ['目の前が暗くなる。', '気づくと、また、あの朝だった。', '「また、終わらせようか」。そう思いながら、もう一度、祠へ向かう。'],
  ['時が、巻き戻る。', '薄れていく記憶の中で、「終わらせたい」という気持ちだけが、はっきりしている。', 'それでも、あの子の声が、まだ聞こえる気がした。'],
  ['また、朝が来る。', '終わらせたいのか、忘れたいのか、自分でも分からない。', '分からないまま、灯をともす。'],
];

/** 注意書き（遊び始める前に出す）。相談窓口は、画面で別に出す */
export const NOTICE = [
  'このゲームには、心の傷、孤独、自ら命を絶つことをほのめかす表現があります。',
  'つらいときは、無理をせず、遊ぶのをやめてください。',
  'ひとりで抱え込まず、身近な人や相談窓口に話してください。',
];

/** 相談窓口（厚生労働省「まもろうよ こころ」の、電話相談のページから。2026年11月に確認） */
export interface Hotline {
  name: string;
  number: string;
  note: string;
}
export const HOTLINES: readonly Hotline[] = [
  { name: 'よりそいホットライン', number: '0120-279-338', note: '24時間・無料' },
  { name: 'いのちの電話（フリーダイヤル）', number: '0120-783-556', note: '毎日16時〜21時（毎月10日は朝8時から翌朝8時まで）・無料' },
  { name: 'こころの健康相談統一ダイヤル', number: '0570-064-556', note: '受け付ける曜日や時間は、都道府県で違う・通話料がかかる' },
];
export const HOTLINE_PAGE = 'https://www.mhlw.go.jp/mamorouyokokoro/soudan/tel/index.html';
export const EMERGENCY = '命の危険が迫っているときは、迷わず119番（救急）か110番（警察）へ。';

// ===== 見せるもの =====

/** 画面に出す場面。pages は、ひとつずつ、タップで進む */
export type Scene =
  | { kind: 'memory'; boss: string; room: string[]; memory: Memory; ending: string[] | null }
  | { kind: 'fragment'; room: string[]; fragment: string };

/** n回目（0始まり）の部屋の場面 */
export function roomScene(n: number): string[] {
  if (n <= 0) return [...ROOM_FIRST];
  return [ROOM_CHANGES[(n - 1) % ROOM_CHANGES.length]!, ROOM_WISH];
}

/** 力尽きたときの文章。run は、何回目の挑戦か */
export function rewindLines(run: number): readonly string[] {
  return REWIND_LINES[Math.max(0, run - 1) % REWIND_LINES.length]!;
}

export interface Recalled {
  save: SaveData;
  scene: Scene | null; // 出す場面（なければ null）
}

/**
 * ダンジョンを踏破したときの、記憶とかけら。
 * - まだ思い出していないボス：その記憶が戻る（5つめなら、最後の場面もつく）
 * - すでに思い出したボス：5つそろう前は、何も出さない。そろったあとは、かけらが1つ出る
 * 同じ記録から何度計算しても、同じ結果になる（途中で閉じても、二重に進まない）
 */
export function recall(save: SaveData, boss: string): Recalled {
  const memory = MEMORIES[boss];
  if (!memory) return { save, scene: null };
  const seen = save.memories;
  if (!seen.includes(boss)) {
    const memories = [...seen, boss];
    const ending = memories.length >= MEMORY_COUNT ? ENDING : null;
    return { save: { ...save, memories }, scene: { kind: 'memory', boss, room: roomScene(seen.length), memory, ending } };
  }
  if (seen.length < MEMORY_COUNT) return { save, scene: null };
  const fragment = FRAGMENTS[Math.min(save.fragments, FRAGMENTS.length - 1)]!;
  return { save: { ...save, fragments: save.fragments + 1 }, scene: { kind: 'fragment', room: roomScene(MEMORY_COUNT + save.fragments), fragment } };
}

// ===== 店と情報屋（忘れ物・口調・部屋の背景） =====

/**
 * お金の呼び名：ダンジョンは忘れた記憶の迷路なので、拾ってくるものは「忘れ物」。
 * 数や計算は金貨のときと同じ（内部の名前は gold のまま）。画面では ◇ を付けて数える
 */
export const LOST = { name: '忘れ物', shop: '忘れ物屋' } as const;
export const lost = (n: number): string => `◇${n}`;

/** 情報屋の口調：思い出した記憶の数で、ぶっきらぼう（0）→ 静か（1）→ やさしい（2）と変わる */
export type Tone = 0 | 1 | 2;
export const toneOf = (memories: number): Tone => (memories >= 4 ? 2 : memories >= 2 ? 1 : 0);

/** 部屋の背景の進み具合（0〜8）：思い出した記憶の数 ＋ 5つそろったあとのかけらの数（3つまで） */
export const ROOM_STAGE_MAX = MEMORY_COUNT + 3;
export const roomStage = (save: Pick<SaveData, 'memories' | 'fragments'>): number => Math.min(ROOM_STAGE_MAX, save.memories.length + Math.min(3, save.fragments));
