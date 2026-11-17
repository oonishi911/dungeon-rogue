// 情報屋の言い回し（ストーリー。docs/story.md「店と情報屋」）。
// 同じ内容を、思い出した記憶の数で変わる3つの口調で言う。0：ぶっきらぼう、1：静か、2：やさしい。
// 内容（属性・体・弱点・ボス）は、口調で変わらない。変わるのは言い方だけ。

import type { Tone } from './story';

export interface Voice {
  greeting: (dungeon: string, questions: number) => string; // 最初のあいさつ
  farewell: string; // もう聞けないとき
  trait: { clear: (name: string) => string; vague: (a: string, b: string) => string };
  body: { clear: (body: string, weak: string) => string; vague: (a: string, b: string, wa: string, wb: string) => string };
  boss: { clear: (name: string, element: string, body: string) => string; vague: (a: string, b: string) => string; unknown: string };
  weak: { magic: string; physical: string; none: string }; // 弱点の偏りの、はっきりした言い方
}

export const VOICES: Record<Tone, Voice> = {
  // 0：ぶっきらぼう（はじめの口調）
  0: {
    greeting: (d, n) => `${d}に潜るのか。話せるのは、ダンジョンの属性、多い魔物、奥のボスのことだ。ただし、今日話すのは${n}つまで。1つ目だけなら、それとなく、ただで話してやってもいい。はっきり知りたけりゃ、忘れ物を置いていきな。`,
    farewell: '今日はここまでだ。うまくやれよ。',
    trait: {
      clear: (name) => `あそこは${name}のダンジョンだ。間違いない。`,
      vague: (a, b) => `入った奴の話じゃ「${a}」とも「${b}」とも聞く。どっちが本当かは知らねえ。`,
    },
    body: {
      clear: (body, weak) => `多いのは${body}の魔物だ。それと、${weak}`,
      vague: (a, b, wa, wb) => `${a}の魔物か、${b}の魔物が多いらしいぜ。それと、「${wa}」とも「${wb}」とも聞く。`,
    },
    boss: {
      clear: (name, element, body) => `奥にいるのは${name}だ。${element}の力を持つ、${body}の化け物さ。`,
      vague: (a, b) => `ボスは${a}か${b}の力を使うと聞いた。姿までは知らねえ。`,
      unknown: 'ボスのことは、誰も知らねえ。',
    },
    weak: {
      magic: '魔法がよく効く奴が多いな。殴るより、呪文のほうが通る。',
      physical: '殴ればすぐ倒れる奴が多いな。呪文はあまり通らねえ。',
      none: '魔法が効く奴も、殴って倒せる奴も、特に偏っちゃいねえ。',
    },
  },
  // 1：静か（2つ思い出したあと）
  1: {
    greeting: (d, n) => `${d}か。……話せるのは、ダンジョンの属性と、多い魔物と、奥にいるもののこと。今日は${n}つまで。最初の1つは、それとなくでよければ、何もいらない。はっきり知りたいなら、忘れ物を置いていって。`,
    farewell: '今日は、ここまで。……気をつけて。',
    trait: {
      clear: (name) => `ここは${name}の迷路。……間違いない。`,
      vague: (a, b) => `「${a}」とも「${b}」とも言われている。どちらなのかは、分からない。`,
    },
    body: {
      clear: (body, weak) => `多いのは${body}の魔物。……${weak}`,
      vague: (a, b, wa, wb) => `${a}の魔物か、${b}の魔物が多いらしい。それと、「${wa}」とも「${wb}」とも言われている。`,
    },
    boss: {
      clear: (name, element, body) => `奥にいるのは${name}。${element}の力を持った、${body}の姿をしている。`,
      vague: (a, b) => `ボスは${a}か${b}の力、らしい。姿までは、覚えていない。`,
      unknown: '奥のことは、誰も覚えていない。',
    },
    weak: {
      magic: '魔法が効く魔物が多い。殴るより、呪文のほうが通る。',
      physical: '殴れば倒れる魔物が多い。呪文はあまり通らない。',
      none: '魔法にも、殴るのにも、偏りはない。',
    },
  },
  // 2：やさしい（4つ思い出したあと）
  2: {
    greeting: (d, n) => `${d}へ行くんだね。話せるのは、ダンジョンの属性と、多い魔物と、奥にいるもののこと。今日は${n}つまで。最初の1つは、気軽に聞いていいよ。はっきり知りたいなら、忘れ物を少しだけ、分けてほしい。`,
    farewell: '今日は、ここまで。いってらっしゃい。',
    trait: {
      clear: (name) => `ここは${name}の迷路だよ。大丈夫、間違いない。`,
      vague: (a, b) => `「${a}」とも「${b}」とも聞いたよ。どちらだったかは、思い出せない。`,
    },
    body: {
      clear: (body, weak) => `多いのは${body}の魔物だよ。${weak}`,
      vague: (a, b, wa, wb) => `${a}の魔物か、${b}の魔物が多いみたい。それと、「${wa}」とも「${wb}」とも聞いたよ。`,
    },
    boss: {
      clear: (name, element, body) => `奥にいるのは${name}。${element}の力を持つ、${body}の姿をしている。……怖くなったら、立ち止まってもいいよ。`,
      vague: (a, b) => `ボスは${a}か${b}の力だったと思う。姿は、はっきりしない。`,
      unknown: '奥のことは、まだ思い出せないんだ。',
    },
    weak: {
      magic: '魔法がよく効く魔物が多いよ。殴るより、呪文のほうが届く。',
      physical: '殴れば倒れる魔物が多いよ。呪文はあまり届かない。',
      none: '魔法にも、殴るのにも、偏りはないよ。',
    },
  },
};
