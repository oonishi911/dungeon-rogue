/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { configDefaults } from 'vitest/config';

/** バランスのテスト（自動プレイで多数回遊ばせて、クリア率を確かめる）。時間がかかるので、ふつうのテスト（npm test）からは外している */
export const BALANCE_TESTS = 'src/game/balance*.test.ts';

/**
 * ふつうのテストでは、ゲームが読む設定ファイル（品物・敵・ダンジョン）を、テスト用の決まった中身（src/game/testdata/）に差し替える。
 * 管理画面で値段や敵の強さ、ダンジョンの広さなどを変えても、ふつうのテストは落ちない（テストは「ルールどおりに動くか」だけを確かめる）。
 * 公開する設定ファイルそのものが正しい形かは、src/game/publishedData.test.ts が確かめる。遊びやすさはバランスのテスト（本物の設定で動く）が確かめる。
 */
function testData(): Plugin {
  const swaps: { file: string; from: string; to: string }[] = [
    { file: '/src/game/data.ts', from: "'./enemies.json'", to: "'./testdata/enemies.json'" },
    { file: '/src/game/data.ts', from: "'./items.json'", to: "'./testdata/items.json'" },
    { file: '/src/game/dungeons.ts', from: "'./dungeons/*.json'", to: "'./testdata/dungeons/*.json'" },
  ];
  return {
    name: 'test-data',
    enforce: 'pre',
    transform(code, id) {
      const mine = swaps.filter((s) => id.endsWith(s.file));
      if (mine.length === 0) return null;
      let out = code;
      for (const s of mine) {
        // 読み込む場所の書き方が変わって差し替えられなかったら、黙って本物を使わず、はっきり止める
        if (!out.includes(s.from)) throw new Error(`テスト用の設定に差し替えられない：${s.file} に ${s.from} がない`);
        out = out.replace(s.from, s.to);
      }
      return out;
    },
  };
}

// vitest で動かすときは mode が 'test' になる（vite で開く・作るときは使わない）
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'test' ? [testData()] : [])],
  test: {
    // テストのたびに、たまった通信を処理させる（src/test-setup.ts）
    setupFiles: ['src/test-setup.ts'],
    // バランスのテストは、一旦外している（ダンジョンの設定を自由に試せるように。自動チェックで止まらない）。
    // 動かすときは npm run test:balance（vitest.balance.config.ts。こちらは差し替えず、本物の設定で動く）
    exclude: [...configDefaults.exclude, BALANCE_TESTS],
  },
}));
