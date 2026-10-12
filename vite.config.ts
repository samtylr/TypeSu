import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `--mode single` inlines all JS and CSS into one HTML file that runs by double-clicking.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: mode === 'single' ? { outDir: '.single', emptyOutDir: true } : {},
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}));
