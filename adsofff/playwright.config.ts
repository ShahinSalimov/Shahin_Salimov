import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'off',
    acceptDownloads: true,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, grepInvert: /@mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  webServer: [
    {
      command: 'npx vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    // Optional-AI path: production server + mock OpenAI-compatible provider (no real keys, no network).
    {
      command: 'node e2e/mock-ai.mjs',
      url: 'http://127.0.0.1:9911/calls',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npx tsx server/index.ts',
      url: 'http://127.0.0.1:8788/api/health',
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        AI_PROVIDER: 'openai',
        AI_API_KEY: 'e2e-key',
        AI_MODEL: 'mock-model',
        AI_BASE_URL: 'http://127.0.0.1:9911/v1',
        AI_DAILY_LIMIT_PER_CLIENT: '50',
        ADSOFFF_SERVER_PORT: '8788',
      },
    },
  ],
});
