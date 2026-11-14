// バランスのテストだけを動かす設定（npm run test:balance）。
// ふつうのテスト（npm test）と自動チェックからは、一旦外している（vite.config.ts）。
// 確かめるのは「標準」のダンジョン（src/game/dungeons/standard.json）
import { defineConfig } from 'vitest/config';
import { BALANCE_TESTS } from './vite.config';

export default defineConfig({
  test: {
    setupFiles: ['src/test-setup.ts'],
    include: [BALANCE_TESTS],
  },
});
