// 状態異常の設定（src/game/statuses.json）を読み、正しい形かを確かめる。設計は docs/status-spec.md。
// 状態異常は3つ：毒（数ターン、毎ターン決まったダメージ）、鈍足（数歩のあいだ、歩くのに2ターンかかる）、空腹（満腹度がその場で減る）。
// 敵の攻撃でダメージが入ると、設定の確率でかかる。確率には、指輪の耐性・弱点（その敵の攻撃が受けるダメージの倍率）が掛かる。
// 治すのは、時間（ターン数・歩数が切れる）と、道具の万能薬（すべて治る）。
// statuses.json は、管理画面（?view=admin の「状態異常」タブ。src/ui/StatusPanels.tsx）から書き換えて公開できる。
// 読めない値が入っていたら、ゲームを動かさずにエラーにする（テストで見つかるので、公開はされない）

export const STATUS_IDS = ['poison', 'chill', 'hunger'] as const;
export type StatusId = (typeof STATUS_IDS)[number];

export const STATUS_LABELS: Record<StatusId, string> = { poison: '毒', chill: '鈍足', hunger: '空腹' };

export type StatusMaster = {
  poison: { chance: number; turns: number; damage: number }; // chance：かかる確率（%）、turns：続くターン数、damage：毎ターンのダメージ（守りは関係ない）
  chill: { chance: number; steps: number }; // steps：鈍足でいる歩数（1歩に2ターンかかる）
  hunger: { chance: number; amount: number }; // amount：当たったときに、その場で減る満腹度
  foe: FoeMaster; // 敵にかける燃焼・凍結（設計は docs/combat-fun-spec.md ①）
};

/**
 * 敵にかける状態異常。炎・氷の呪文は必ず、炎・氷の砥石で殴ったときは確率（chance）でかかる
 * burn：燃焼（turns ターン、毎ターン damage ダメージ。守りは関係ない）／freeze：凍結（turns ターン動けない）
 * weakBonus：弱点の属性（炎→氷の敵、氷→炎の敵）のとき延びるターン数
 * smashPercent：ハンマーで凍った敵を殴ったときのダメージの倍率（%。凍結は解ける）
 * spellPercent：杖を持って、燃えている・凍っている敵に唱えたときの呪文のダメージの倍率（%）
 */
export type FoeMaster = {
  burn: { chance: number; turns: number; damage: number };
  freeze: { chance: number; turns: number };
  weakBonus: number;
  smashPercent: number;
  spellPercent: number;
};

export const STATUS_LIMITS = {
  chance: { min: 0, max: 100 },
  turns: { min: 1, max: 20 },
  damage: { min: 1, max: 20 },
  steps: { min: 1, max: 20 },
  amount: { min: 1, max: 50 },
  weakBonus: { min: 0, max: 5 },
  percent: { min: 100, max: 500 },
} as const;

/** 状態異常の説明（ゲーム内の表示と管理画面の説明に使う）。数字は設定から */
export const STATUS_TEXTS: Record<StatusId, (m: StatusMaster) => string> = {
  poison: (m) => `${m.poison.turns}ターンのあいだ、毎ターン${m.poison.damage}ダメージ（守りは関係ない）`,
  chill: (m) => `${m.chill.steps}歩のあいだ、歩くのに2ターンかかる（殴る・唱えるは1ターン）`,
  hunger: (m) => `満腹度が、その場で${m.hunger.amount}減る`,
};

// ===== 確かめる =====

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const intIn = (v: unknown, r: { min: number; max: number }) => typeof v === 'number' && Number.isInteger(v) && v >= r.min && v <= r.max;

/** 設定の直すところ（日本語の文）。なければ空 */
export function statusProblems(data: unknown): string[] {
  const out: string[] = [];
  if (!isObj(data)) return ['状態異常の設定が読めない'];
  const field = (id: StatusId, key: string, range: { min: number; max: number }, label: string) => {
    const v = isObj(data[id]) ? (data[id] as Record<string, unknown>)[key] : undefined;
    if (!intIn(v, range)) out.push(`${STATUS_LABELS[id]}：${label}は${range.min}〜${range.max}の整数にする`);
  };
  for (const id of STATUS_IDS) {
    if (!isObj(data[id])) {
      out.push(`${STATUS_LABELS[id]}の設定が読めない`);
      continue;
    }
    field(id, 'chance', STATUS_LIMITS.chance, 'かかる確率（%）');
  }
  if (isObj(data.poison)) {
    field('poison', 'turns', STATUS_LIMITS.turns, 'ターン数');
    field('poison', 'damage', STATUS_LIMITS.damage, '毎ターンのダメージ');
  }
  if (isObj(data.chill)) field('chill', 'steps', STATUS_LIMITS.steps, '歩数');
  if (isObj(data.hunger)) field('hunger', 'amount', STATUS_LIMITS.amount, '減る満腹度');
  const foe = isObj(data.foe) ? data.foe : null;
  if (!foe) {
    out.push('敵にかける状態異常の設定が読めない');
    return out;
  }
  const sub = (key: 'burn' | 'freeze') => (isObj(foe[key]) ? (foe[key] as Record<string, unknown>) : null);
  const check = (v: unknown, range: { min: number; max: number }, label: string) => {
    if (!intIn(v, range)) out.push(`敵にかける状態異常：${label}は${range.min}〜${range.max}の整数にする`);
  };
  const burn = sub('burn');
  const freeze = sub('freeze');
  if (!burn) out.push('敵にかける状態異常：燃焼の設定が読めない');
  else {
    check(burn.chance, STATUS_LIMITS.chance, '燃焼の確率（%）');
    check(burn.turns, STATUS_LIMITS.turns, '燃焼のターン数');
    check(burn.damage, STATUS_LIMITS.damage, '燃焼の毎ターンのダメージ');
  }
  if (!freeze) out.push('敵にかける状態異常：凍結の設定が読めない');
  else {
    check(freeze.chance, STATUS_LIMITS.chance, '凍結の確率（%）');
    check(freeze.turns, STATUS_LIMITS.turns, '凍結のターン数');
  }
  check(foe.weakBonus, STATUS_LIMITS.weakBonus, '弱点で延びるターン数');
  check(foe.smashPercent, STATUS_LIMITS.percent, '砕くときのダメージの倍率（%）');
  check(foe.spellPercent, STATUS_LIMITS.percent, '杖の呪文のダメージの倍率（%）');
  return out;
}

export function parseStatusMaster(data: unknown): StatusMaster {
  const problems = statusProblems(data);
  if (problems.length) throw new Error(`状態異常の設定（statuses.json）が正しくない：\n${problems.join('\n')}`);
  return data as StatusMaster;
}

export function serializeStatusMaster(master: StatusMaster): string {
  return `${JSON.stringify(master, null, 2)}\n`;
}

/** 変えたところを、日本語の文で並べる（公開の欄とコミットの説明に使う） */
export function describeStatusChanges(before: StatusMaster, after: StatusMaster): string[] {
  const out: string[] = [];
  const diff = (label: string, a: number, b: number, unit = '') => {
    if (a !== b) out.push(`${label}：${a}${unit} → ${b}${unit}`);
  };
  for (const id of STATUS_IDS) diff(`${STATUS_LABELS[id]}のかかる確率`, before[id].chance, after[id].chance, '%');
  diff('毒のターン数', before.poison.turns, after.poison.turns);
  diff('毒の毎ターンのダメージ', before.poison.damage, after.poison.damage);
  diff('鈍足の歩数', before.chill.steps, after.chill.steps);
  diff('空腹で減る満腹度', before.hunger.amount, after.hunger.amount);
  diff('敵の燃焼：砥石でかかる確率', before.foe.burn.chance, after.foe.burn.chance, '%');
  diff('敵の燃焼のターン数', before.foe.burn.turns, after.foe.burn.turns);
  diff('敵の燃焼の毎ターンのダメージ', before.foe.burn.damage, after.foe.burn.damage);
  diff('敵の凍結：砥石でかかる確率', before.foe.freeze.chance, after.foe.freeze.chance, '%');
  diff('敵の凍結のターン数', before.foe.freeze.turns, after.foe.freeze.turns);
  diff('弱点で延びるターン数', before.foe.weakBonus, after.foe.weakBonus);
  diff('砕くときのダメージの倍率', before.foe.smashPercent, after.foe.smashPercent, '%');
  diff('杖の呪文のダメージの倍率', before.foe.spellPercent, after.foe.spellPercent, '%');
  return out;
}
