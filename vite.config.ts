/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  test: {
    // テストのファイルごとに別のプロセスで動かす。バランステスト（自動プレイを何百回も回す重いテスト）を
    // スレッドで並べて動かすと、GitHub Actions の小さなマシンでは、テストを動かす仕組みどうしのやりとりが
    // 時間切れになる（"Timeout calling onTaskUpdate"）ことがあったため
    pool: 'forks',
  },
});
