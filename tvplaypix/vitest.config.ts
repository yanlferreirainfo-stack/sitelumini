import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // `server-only` lança erro fora do bundler do Next; nos testes é um no-op.
      'server-only': path.resolve(__dirname, 'tests/server-only-stub.ts'),
    },
  },
});
