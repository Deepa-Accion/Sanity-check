import { defineConfig, devices } from "@playwright/test";

// Exclude deviceScaleFactor from Desktop Chrome device to allow null viewport
const { deviceScaleFactor: _dsf, ...DesktopChromeNoDsf } = devices['Desktop Chrome'];

const BASE_URL = "https://ai.accionbreeze.com/";

export default defineConfig({
  timeout: 300000, // 5 minutes - accommodate 2-3 min metrics generation
  expect: { timeout: 20000 },
  globalSetup: "./global-setup.js",
  use: {
    baseURL: BASE_URL,
    storageState: "auth.json",
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