/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';

/** バランスのテスト（自動プレイで多数回遊ばせて、クリア率を確かめる）。時間がかかるので、ふつうのテスト（npm test）からは外している */
export const BALANCE_TESTS = 'src/game/balance*.test.ts';

export default defineConfig({
  plugins: [react()],
  test: {
    // テストのたびに、たまった通信を処理させる（src/test-setup.ts）
    setupFiles: ['src/test-setup.ts'],
    // バランスのテストは、一旦外している（ダンジョンの設定を自由に試せるように。自動チェックで止まらない）。
    // 動かすときは npm run test:balance（vitest.balance.config.ts）
    exclude: [...configDefaults.exclude, BALANCE_TESTS],
  },
});
