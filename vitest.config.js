import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/test/**/*.test.js'],
    hookTimeout: 15_000,
    testTimeout: 15_000,
    coverage: {
      reporter: ['text', 'html'],
      include: ['server/src/**/*.js'],
    },
  },
});
