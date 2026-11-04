// ドット絵のデータ（src/sprites/data.ts）を作り直すスクリプト。
// 形は scripts/sprite-shapes.ts の図形の組み合わせで定義している。
// 実行：npx tsx scripts/build-sprites.ts
import { writeFileSync } from 'node:fs';
import { CLOAKS, PALETTE, SPRITES } from './sprite-shapes';

const body = Object.entries(SPRITES)
  .map(([name, draw]) => `  ${name}: [\n${draw().map((r) => `    '${r}',`).join('\n')}\n  ],`)
  .join('\n');

const file = `// このファイルは scripts/build-sprites.ts で生成している。直接編集しない。
// 1行32文字 × 32行。'.' は透明、それ以外の文字は PALETTE の色。
// 主人公の H / C / c はマントの色で、装備によって CLOAKS から差し替える。

export const SPRITES = {
${body}
} as const;

export type SpriteId = keyof typeof SPRITES;

export const PALETTE: Record<string, string> = ${JSON.stringify(PALETTE, null, 2)};

export const CLOAKS = ${JSON.stringify(CLOAKS, null, 2)} as const;
`;
writeFileSync(new URL('../src/sprites/data.ts', import.meta.url), file);
console.log('wrote src/sprites/data.ts');
