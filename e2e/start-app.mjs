import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startCatalog } from './fake-catalog.mjs';

const API_BUNDLE = 'dist/apps/card/main.js';
const WEB_APP = 'dist/apps/card-front/browser';

if (!existsSync(API_BUNDLE) || !existsSync(WEB_APP)) {
    console.error('Build first: yarn card-api:build && yarn card-front:build');
    process.exit(1);
}

const folder = join(tmpdir(), 'cardscanner-e2e-app');

rmSync(folder, { recursive: true, force: true });
mkdirSync(folder, { recursive: true });
const site = join(folder, 'public');

cpSync(WEB_APP, site, { recursive: true });
writeFileSync(join(site, 'assets', 'appsettings.json'), JSON.stringify({ api: { core: '/api' } }));
writeFileSync(join(site, 'app-files.json'), JSON.stringify(readdirSync(site).filter((file) => /\.(js|css)$/.test(file))));

const catalog = await startCatalog();
const server = spawn(process.execPath, [API_BUNDLE], {
    stdio: 'inherit',
    env: {
        ...process.env,
        PORT: process.env.E2E_PORT ?? '3932',
        FRONTEND_PATH: site,
        DATABASE_PATH: join(folder, 'app.db'),
        CATALOG_URL: `http://127.0.0.1:${catalog.address().port}`,
        GOOGLE_CLIENT_ID: '',
        ANTHROPIC_API_KEY: '',
        CSP_MODE: 'report'
    }
});

const stop = () => {
    server.kill();
    catalog.close();
    rmSync(folder, { recursive: true, force: true });
    process.exit(0);
};

process.on('SIGTERM', stop);
process.on('SIGINT', stop);
server.on('exit', (code) => {
    catalog.close();
    process.exit(code ?? 0);
});
