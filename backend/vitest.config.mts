import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      API_KEY: 'test-key',
      WEBHOOK_SECRET: 'test-secret',
      STORE_NAME: 'Trailhead Supply Co.',
      CURRENCY: 'USD',
      LOG_LEVEL: 'silent',
    },
  },
});
