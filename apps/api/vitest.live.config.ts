import { defineConfig } from 'vitest/config';

// Testes que chamam serviços reais pela internet (API do museu). Fora do npm test padrão.
export default defineConfig({
  test: {
    include: ['test/**/*.live.test.ts'],
    testTimeout: 30_000,
  },
});
