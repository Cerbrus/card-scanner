import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { Server, createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const testFolder = mkdtempSync(join(tmpdir(), 'cardscanner-test-'));
export const frontend = join(testFolder, 'public');

mkdirSync(frontend, { recursive: true });
writeFileSync(join(frontend, 'index.html'), '<title>Pokémon cards</title><script>start()</script>');

process.env['DATABASE_PATH'] = join(testFolder, 'test.db');
process.env['FRONTEND_PATH'] = frontend;
process.env['BACKGROUND_JOBS'] = 'off';
process.env['ANTHROPIC_API_KEY'] = '';

export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9]);

const SETS = [
    { id: 'base1', name: 'Base Set', logo: 'https://assets.example/base1/logo', cardCount: { total: 102, official: 102 } },
    { id: 'base4', name: 'Base Set 2', cardCount: { total: 130, official: 130 } }
];
const CARDS = [
    { id: 'base1-4', localId: '4', name: 'Charizard', image: 'https://assets.example/base1/4' },
    { id: 'base4-4', localId: '4', name: 'Charizard', image: 'https://assets.example/base4/4' },
    { id: 'base1-58', localId: '58', name: 'Pikachu' }
];
const DETAILS: Record<string, object> = {
    'base1-4': {
        rarity: 'Rare',
        pricing: { cardmarket: { idProduct: 273699, trend: 385.83, avg30: 407.53, low: 90, updated: '2026-11-13T22:24:06.052Z' } },
        variants_detailed: [
            { type: 'holo', subtype: 'unlimited', pricing: { cardmarket: { idProduct: 273700, trend: 412.5, avg30: 430.1, low: 95 } } },
            { type: 'holo', subtype: 'shadowless', stamp: ['1st-edition'], pricing: { cardmarket: { idProduct: 660224, trend: 3489.25, avg30: 2445.05, low: 979 } } }
        ]
    },
    'base1-58': { rarity: 'Common' }
};

export async function startCatalogue(): Promise<Server> {
    const server = createServer((request, response) => {
        const path = decodeURIComponent(request.url ?? '');
        const body = path === '/sets' ? SETS : path === '/cards' ? CARDS : DETAILS[path.replace('/cards/', '')];
        response.statusCode = body ? 200 : 404;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify(body ?? { status: 404 }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    process.env['CATALOG_URL'] = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    return server;
}

export function photoForm(parts: Array<string> = ['front', 'back', 'frontThumb', 'backThumb'], data: Buffer = JPEG, extra: Record<string, Buffer> = {}, fields: Record<string, string> = {}): FormData {
    const form = new FormData();
    for (const part of parts) {
        form.append(part, new Blob([new Uint8Array(data)], { type: 'image/jpeg' }), `${part}.jpg`);
    }
    for (const [part, file] of Object.entries(extra)) {
        form.append(part, new Blob([new Uint8Array(file)], { type: 'image/jpeg' }), `${part}.jpg`);
    }
    for (const [name, value] of Object.entries(fields)) {
        form.append(name, value);
    }

    return form;
}
