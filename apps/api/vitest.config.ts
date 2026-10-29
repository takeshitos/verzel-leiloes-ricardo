import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Aplica as migrações no banco de teste (TEST_DATABASE_URL, nome terminado em _test).
    globalSetup: ['test/global-setup.ts'],
    // Os arquivos compartilham o mesmo banco de teste: um arquivo por vez.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
