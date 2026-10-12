import { defineConfig } from 'vitest/config';

// Relative base so the built game works from any folder or GitHub Pages path.
export default defineConfig({
  base: './',
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
