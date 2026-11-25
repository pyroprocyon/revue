import { defineConfig } from '@playwright/test';

export default defineConfig({
  globalSetup: './e2e/build-test-image.ts',
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  testIgnore: process.env.REVUE_STARTUP_AUDIT === '1' ? [] : '**/startup-audit.spec.ts',
  fullyParallel: false,
  workers: process.env.CI === 'true' && process.env.REVUE_APP_IMAGE ? 2 : 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 30_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    browserName: 'chromium',
    viewport: { width: 360, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
