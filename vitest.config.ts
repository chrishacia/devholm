/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'e2e'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', '.next/', 'src/test/', '**/*.d.ts', '**/*.config.*'],
    },
  },
  resolve: {
    alias: [
      { find: '@/components', replacement: path.resolve(__dirname, './src/core/components') },
      { find: '@/lib', replacement: path.resolve(__dirname, './src/core/lib') },
      { find: '@/hooks', replacement: path.resolve(__dirname, './src/core/hooks') },
      { find: '@/db', replacement: path.resolve(__dirname, './src/core/db') },
      { find: '@/config', replacement: path.resolve(__dirname, './src/core/config') },
      { find: '@/theme', replacement: path.resolve(__dirname, './src/core/theme') },
      { find: '@/types', replacement: path.resolve(__dirname, './src/core/types_app') },
      { find: '@', replacement: path.resolve(__dirname, './src') },
      { find: '@core', replacement: path.resolve(__dirname, './src/core') },
      { find: '@user', replacement: path.resolve(__dirname, './src/user') },
      { find: '@config', replacement: path.resolve(__dirname, './devholm.config') },
    ],
  },
});
