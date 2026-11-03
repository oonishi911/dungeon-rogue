// シード付き疑似乱数（mulberry32）。
// 状態を引数と戻り値で受け渡すことで、同じシードなら必ず同じ結果になる。
// テストやリプレイ、バグ再現がしやすくなる。

export interface RngStep {
  value: number; // 0以上1未満
  state: number;
}

export function nextRandom(state: number): RngStep {
  let t = (state + 0x6d2b79f5) >>> 0;
  const nextState = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: nextState };
}

/** 0 以上 max 未満の整数 */
export function nextInt(state: number, max: number): { value: number; state: number } {
  const step = nextRandom(state);
  return { value: Math.floor(step.value * max), state: step.state };
}

/** Fisher–Yates シャッフル（元の配列は変更しない） */
export function shuffle<T>(items: readonly T[], state: number): { value: T[]; state: number } {
  const result = [...items];
  let s = state;
  for (let i = result.length - 1; i > 0; i--) {
    const step = nextInt(s, i + 1);
    s = step.state;
    const j = step.value;
    const tmp = result[i]!;
    result[i] = result[j]!;
    result[j] = tmp;
  }
  return { value: result, state: s };
}
