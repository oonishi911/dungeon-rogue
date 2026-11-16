// ストーリー（2026-11-16。仕様と、文章の意図は docs/story.md）。
// 主人公は、名前のない「あなた」。祠の奥の灯に願って、大切な人のために時を戻し続けるうちに、記憶をなくした。
// ボスを倒すたびに、なくした記憶が1つずつよみがえる（5つめで物語が終わる）。力尽きると時が巻き戻る。
// 文章はスマホで短く読めるように、1行を短く、1つの記憶を5〜6行にしている。

import type { EnemyId } from './types';

export const STORY_CONFIG = {
  memories: 5, // よみがえる記憶の数（ボスを倒すたびに1つ。5つめで物語が終わる）
} as const;

export interface Memory {
  title: string;
  lines: readonly string[];
}

/** よみがえる記憶。ボスを倒した順に1つめから。どのボスを倒しても、同じ順番で進む（属性はダンジョンに入るたびに変わるため） */
export const MEMORIES: readonly Memory[] = [
  {
    title: '冬の朝',
    lines: ['小さな手が、あなたの袖をつかんでいた。', '「あした、祠の灯を見にいこうね」', '声だけが、はっきり残っている。', '顔は、まだ思い出せない。'],
  },
  {
    title: '祠のいいつたえ',
    lines: ['村のはずれの祠には、いいつたえがあった。', '奥に灯のともる夜、時は一度だけ戻る。', '大人たちは、笑い話にした。', 'あなたも、そうだった。あの冬までは。'],
  },
  {
    title: '眠ったままの子',
    lines: ['あの子は、熱を出して眠ったまま、目を開けなかった。', '医者は、静かに首を振った。', '雪の降る夜、あなたはひとりで家を出た。', '祠へ向かう道は、足跡ひとつなかった。'],
  },
  {
    title: '祠との約束',
    lines: ['「あの子の冬を、もう一度」', '祠は答えた。時を戻そう、と。', '「ただし、戻すたびに、あなたの記憶を灯の油にする」', 'あなたは、うなずいた。うなずいてしまった。'],
  },
  {
    title: '灯',
    lines: ['何度目の朝か、もう数えられない。', '力尽きるたびに戻り、戻るたびに、忘れていった。', 'それでも足は、この奥へ向かっていた。', '思い出すためではない。', '灯を、持ち帰るためだ。'],
  },
] as const;

/** ボスを倒した直後に、記憶のあとへ添える一文（どの記憶のときも、倒したボスに合わせて出す） */
export const BOSS_ECHOES: Readonly<Record<EnemyId, string>> = {
  flame_beast: '炎の魔獣が崩れた。焦げた匂いが、あの冬の台所を思わせた。',
  ice_colossus: '氷の巨像が砕けた。冷たい指先の感触だけが、手に残った。',
  ogre_chief: '鬼の首領が膝をついた。誰かを責めた声が、自分のものだと気づく。',
  light_guardian: '光の守護者が消えた。まぶしさの向こうに、小さな背中が見えた気がした。',
  dark_lord: '闇の王が溶けた。暗がりが、少しだけ、やさしかった。',
};

/** 5つめの記憶のあとに続く、物語の終わり */
export const ENDING: readonly string[] = [
  '灯を抱えて、祠の階段をのぼる。',
  '外は、もう朝だった。',
  '雪の白さが、目にしみる。',
  '「おかえり」',
  'どこからか、あの子の声がした。',
  '',
  '灯は、消えない。',
  'けれど祠は、まだあなたを待っている。',
];

/** 力尽きたとき・引き返したときに出す、時が巻き戻る一文（挑戦の回数で順に入れ替える） */
export const REWIND_LINES: readonly string[] = [
  '灯が消えた。気がつくと、また祠の前の朝だった。',
  '冷たい石の上で目を覚ます。何かを失くした感じだけが残っていた。',
  '夜が、ゆっくり巻き戻っていく。祠は何も言わない。',
  '息が止まったはずなのに、また朝の光の中にいた。',
];

export const rewindLine = (run: number): string => REWIND_LINES[Math.max(0, run - 1) % REWIND_LINES.length]!;

/** 倒したボスの一文。知らないボスなら null */
export const echoOf = (boss: EnemyId): string | null => BOSS_ECHOES[boss] ?? null;

/** 踏破したあとの、よみがえった記憶の数（上限は STORY_CONFIG.memories） */
export const gainMemory = (memories: number): number => Math.min(STORY_CONFIG.memories, memories + 1);

/** 記憶がすべてよみがえったか（物語が終わったか） */
export const storyDone = (memories: number): boolean => memories >= STORY_CONFIG.memories;
