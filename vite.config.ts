/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  test: {
    // テストのたびに、たまった通信を処理させる（src/test-setup.ts）
    setupFiles: ['src/test-setup.ts'],
  },
});
