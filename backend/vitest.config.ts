import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // Each test gets its own tables in DynamoDB Local (docker compose up -d dynamodb); creating them takes a moment
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Tests never reach AWS: DynamoDB goes to DynamoDB Local, and a forgotten SSM or other SDK call fails fast
    // against a closed port with fake keys instead of signing a request with the developer's own credentials
    env: {
      DYNAMODB_ENDPOINT: 'http://localhost:8000',
      AWS_ENDPOINT_URL: 'http://127.0.0.1:9',
      AWS_ACCESS_KEY_ID: 'test',
      AWS_SECRET_ACCESS_KEY: 'test',
      AWS_SESSION_TOKEN: '',
      AWS_PROFILE: '',
      AWS_REGION: 'us-east-1',
      API_KEY: 'test-key',
      WEBHOOK_SECRET: 'test-secret',
      STORE_NAME: 'Trailhead Supply Co.',
      CURRENCY: 'USD',
      AUTO_REORDER: 'true',
      WEBHOOK_RETRIES: '1',
      WEBHOOK_BACKOFF_MS: '10',
      LOG_LEVEL: 'silent',
    },
  },
});
