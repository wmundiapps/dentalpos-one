import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgres://postgres@localhost:5433/cashbacksmart_test', AUTH_SECRET: 'test-secret', REQUIRE_PHONE_VERIFICATION: '1' },
    fileParallelism: false,
    testTimeout: 30000,
  },
});
// baseline CI (pode apagar este ramo)
