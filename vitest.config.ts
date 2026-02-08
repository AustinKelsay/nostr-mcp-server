import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'],
    exclude: ['node_modules', 'build'],
    globals: true,
    environment: 'node',
    setupFiles: [],
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: ['node_modules/**', 'build/**', '__tests__/**']
    }
  },
});