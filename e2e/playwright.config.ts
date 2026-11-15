import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defineConfig } from '@playwright/test';

const PORT = 3932;

export default defineConfig({
    testDir: '.',
    testMatch: '*.e2e.ts',
    workers: 1,
    fullyParallel: false,
    retries: 0,
    timeout: 60_000,
    reporter: [['list']],
    outputDir: join(tmpdir(), 'cardscanner-e2e-results'),
    use: {
        baseURL: `http://127.0.0.1:${PORT}`,
        channel: 'chrome',
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        locale: 'nl-NL'
    },
    webServer: {
        command: 'node e2e/start-app.mjs',
        cwd: join(__dirname, '..'),
        url: `http://127.0.0.1:${PORT}/api/v1/health`,
        reuseExistingServer: false,
        timeout: 60_000,
        env: { E2E_PORT: String(PORT) }
    }
});
