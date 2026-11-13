// 管理画面の入力欄を、入力した直後に確かめるための決まりと、エラーの言葉。
// 言葉は「何がいけないか」と「どんな値なら良いか」の2つを、続けて書く（例：「12 は大きすぎます。1〜10の整数を入れてください。」）。
// 公開する前のまとめての確かめ（genMaster.ts の genProblems、enemyMaster.ts の masterProblems）とは別に、欄ごとに使う。

/** 数の欄の決まり */
export interface NumberRule {
  min: number;
  max: number;
  step?: number; // 整数かどうかを決める（integer を省いたとき、step が整数なら整数の欄）
  integer?: boolean;
  odd?: boolean; // 奇数だけ
}

const isInteger = (rule: NumberRule) => rule.integer ?? Number.isInteger(rule.step ?? 1);

/** 決まりを言葉にする（例：「1〜10の整数」「0〜1の数」「3〜15の奇数」） */
export function ruleText(rule: NumberRule): string {
  const kind = rule.odd ? '奇数' : isInteger(rule) ? '整数' : '数';
  return `${rule.min}〜${rule.max}の${kind}`;
}

/** 入力した文字が決まりに合わなければ、エラーの言葉。合っていれば null */
export function numberError(text: string, rule: NumberRule): string | null {
  const want = `${ruleText(rule)}を入れてください。`;
  const t = text.trim();
  if (t === '') return `値が入っていません。${want}`;
  const v = Number(t);
  if (!Number.isFinite(v)) return `「${t}」は数ではありません。${want}`;
  if (v < rule.min) return `${t} は小さすぎます。${want}`;
  if (v > rule.max) return `${t} は大きすぎます。${want}`;
  if (isInteger(rule) && !Number.isInteger(v)) return `${t} は整数ではありません。${want}`;
  if (rule.odd && Math.abs(v % 2) !== 1) return `${t} は偶数です。${want}`;
  return null;
}

/**
 * 2つの欄の大小の決まり（最小は最大以下、など）。value が limit を超えていれば（atMost）、または下回っていれば（atLeast）、エラーの言葉。
 * name は value の欄の名前、limitName は比べる相手の欄の名前
 */
export function orderError(kind: 'atMost' | 'atLeast', name: string, value: number, limitName: string, limit: number): string | null {
  if (kind === 'atMost' && value > limit) return `${name}（${value}）が、${limitName}（${limit}）より大きくなっています。${limit}以下にしてください。`;
  if (kind === 'atLeast' && value < limit) return `${name}（${value}）が、${limitName}（${limit}）より小さくなっています。${limit}以上にしてください。`;
  return null;
}

/** 文字の欄（名前など）の決まり */
export interface TextRule {
  max: number;
  pattern?: { test: RegExp; text: string }; // 使える文字の決まりと、その説明
  taken?: ReadonlySet<string>; // ほかで使っている値（同じ値にできない）
  takenText?: string; // 同じ値があるときの言葉（例：「同じ名前の敵がもういます」）
}

/** 入力した文字が決まりに合わなければ、エラーの言葉。合っていれば null */
export function textError(text: string, rule: TextRule): string | null {
  const t = text.trim();
  if (t === '') return `値が入っていません。${rule.max}文字までで入れてください。`;
  if (t.length > rule.max) return `${t.length}文字あります。${rule.max}文字までにしてください。`;
  if (rule.pattern && !rule.pattern.test.test(t)) return `「${t}」は使えない形です。${rule.pattern.text}にしてください。`;
  if (rule.taken?.has(t)) return `「${t}」は${rule.takenText ?? 'もう使われています'}。ほかの値にしてください。`;
  return null;
}
