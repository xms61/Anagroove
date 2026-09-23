import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Frontend unit tests (React hooks/components) in jsdom. Server tests use node:test (npm test).
export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
}));
