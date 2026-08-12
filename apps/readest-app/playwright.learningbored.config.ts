import { defineConfig } from '@playwright/test';

const readerPort = 3310;
const readerOrigin = `http://127.0.0.1:${readerPort}`;

export default defineConfig({
  testDir: './e2e/learningbored',
  testMatch: '**/*.pw.ts',
  outputDir: './.test-sandbox-node/playwright/learningbored',
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: [['line']],
  timeout: 90_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.0001,
      scale: 'css',
    },
  },
  // Font rasterization differs across operating systems. Keep baselines platform-qualified and run
  // visual assertions on the canonical Windows path; Linux PR checks run the nonvisual matrix.
  snapshotPathTemplate:
    '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}-{platform}{ext}',
  use: {
    baseURL: readerOrigin,
    browserName: 'chromium',
    colorScheme: 'light',
    locale: 'en-US',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    timezoneId: 'UTC',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
      },
    },
  ],
  webServer: {
    command:
      'node ./node_modules/dotenv-cli/cli.js -e .env.web -- node ./node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3310',
    env: {
      ...process.env,
      ENABLE_LEARNINGBORED_READER_PREVIEW: 'true',
    },
    reuseExistingServer: false,
    timeout: 180_000,
    url: `${readerOrigin}/design/learningbored`,
  },
});
