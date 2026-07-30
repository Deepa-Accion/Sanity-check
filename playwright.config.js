import { defineConfig, devices } from "@playwright/test";

// Exclude deviceScaleFactor from Desktop Chrome device to allow null viewport
const { deviceScaleFactor: _dsf, ...DesktopChromeNoDsf } = devices['Desktop Chrome'];

const BASE_URL = "https://ai.accionbreeze.com/";

// Localhost mode (set by the runner): target a local app and skip OIDC auth
// (no global-setup login, no stored auth state).
const isLocalhostRun = process.env.LOCALHOST_RUN === "true";
const TARGET_URL = process.env.TARGET_URL || BASE_URL;

export default defineConfig({
  timeout: 300000, // 5 minutes - accommodate 2-3 min metrics generation
  expect: { timeout: 20000 },
  retries: 1, // retry once on failure — gives app-error recovery a chance to reload
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['./reporter/HealingReporter.mjs'],
  ],
  ...(isLocalhostRun ? {} : { globalSetup: "./global-setup.js" }),
  use: {
    baseURL: TARGET_URL,
    ...(isLocalhostRun ? {} : { storageState: "auth.json" }),
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    viewport: null,
    actionTimeout: 15000,
    navigationTimeout: 30000
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...DesktopChromeNoDsf,
        viewport: null,
        launchOptions: { args: ['--force-device-scale-factor=1', '--high-dpi-support=1', '--start-maximized'] }
      },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});