import 'reflect-metadata';

import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';

import { JPEG, photoForm, startCatalogue, testFolder } from './test-env';
import { configureApi } from '../api/configure-api';
import { AppModule } from '../app.module';
import { CardReader } from '../core/connectors/card.reader';
import { CatalogService } from '../core/services/catalog.service';
import { CardReading } from '../data/entities/types';

interface Card {
    id: number;
    status: string;
    readingState: string;
    readingError?: string;
    name?: string;
    setName?: string;
    rarity?: string;
    variant?: string;
    condition?: string;
    conditionSource?: string;
    priceTrend?: number;
    estimatedValue?: number;
    valueFactor?: number;
    cardmarketUrl?: string;
    candidates?: Array<{ catalogCardId: string }>;
    priceHistory?: Array<{ day: string; trend: number }>;
    photos: { front?: number; back?: number };
}

process.env['APP_VERSION'] = '9.9.9';

const READING: CardReading = {
    isPokemonCard: true,
    name: 'Charizard',
    number: '4/102',
    setName: 'Base Set',
    language: 'en',
    firstEdition: false,
    finish: 'holo',
    confidence: 'high',
    condition: 'good',
    conditionNotes: 'White edges on the back.'
};

describe('the whole app', () => {
    let app: NestExpressApplication;
    let catalogue: Server;
    let site: string;
    let api: string;

    const json = async <T>(path: string, init?: RequestInit): Promise<T> => (await (await fetch(`${api}${path}`, init)).json()) as T;
    const send = (method: string, body?: object): RequestInit => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
    const upload = async (): Promise<Card> => json<Card>('/cards', { method: 'POST', body: photoForm() });
    const settled = async (id: number): Promise<Card> => {
        for (let attempt = 0; attempt < 100; attempt++) {
            const card = await json<Card>(`/cards/${id}`);
            if (card.readingState !== 'pending') {
                return card;
            }
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        throw new Error('the reading never finished');
    };
    const useReader = (read: () => Promise<CardReading>): void => {
        Object.assign(app.get(CardReader), { enabled: true, read });
    };

    before(async () => {
        catalogue = await startCatalogue();
        app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
        configureApi(app);
        await app.listen(0, '127.0.0.1');
        site = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
        api = `${site}/api/v1`;
        await app.get(CatalogService).refresh();
    });

    after(async () => {
        await app.close();
        catalogue.close();
        rmSync(testFolder, { recursive: true, force: true });
    });

    it('reports its health and version', async () => {
        const health = await json<{ status: string; version: string }>('/health');

        assert.deepEqual([health.status, health.version], ['ok', '9.9.9']);
    });

    it('serves the web app for the root and for unknown pages, and keeps API paths out of that', async () => {
        assert.match(await (await fetch(`${site}/`)).text(), /Pokémon cards/);
        assert.match(await (await fetch(`${site}/collection`)).text(), /Pokémon cards/);
        assert.equal((await fetch(`${api}/no-such-route`)).status, 404);
    });

    it('forbids framing and type guessing on pages and API answers', async () => {
        for (const path of ['/', '/api/v1/health', '/api/v1/no-such-route']) {
            const headers = (await fetch(`${site}${path}`)).headers;

            assert.equal(headers.get('x-frame-options'), 'DENY', path);
            assert.equal(headers.get('x-content-type-options'), 'nosniff', path);
            assert.match(headers.get('content-security-policy-report-only') ?? '', /script-src 'self' 'sha256-/, path);
        }
    });

    it('says what is switched on: no login, no photo reading, no Drive, a filled catalogue', async () => {
        const system = await json<{ login: boolean; vision: { enabled: boolean }; sync: { configured: boolean; connected: boolean }; catalog: { sets: number; cards: number } }>('/system');

        assert.deepEqual([system.login, system.vision.enabled, system.sync.configured, system.sync.connected], [false, false, false, false]);
        assert.deepEqual([system.catalog.sets, system.catalog.cards], [2, 3]);
    });

    it('stores a scanned card with both photos and serves them back', async () => {
        const card = await upload();
        const photo = await fetch(`${api}/photos/${card.photos.front}`);
        const thumb = await fetch(`${api}/photos/${card.photos.back}?thumb`);

        assert.deepEqual([card.status, card.readingState], ['new', 'none']);
        assert.equal(photo.headers.get('content-type'), 'image/jpeg');
        assert.deepEqual(Buffer.from(await photo.arrayBuffer()), JPEG);
        assert.equal(thumb.status, 200);
        assert.equal((await fetch(`${api}/photos/99999`)).status, 404);
        assert.ok((await json<Array<Card>>('/cards')).some((listed) => listed.id === card.id));
    });

    it('refuses a scan with a missing side, or a file that is not a JPEG', async () => {
        const oneSide = await fetch(`${api}/cards`, { method: 'POST', body: photoForm(['front', 'frontThumb']) });
        const notJpeg = await fetch(`${api}/cards`, { method: 'POST', body: photoForm(undefined, Buffer.from('<html>not a photo</html>')) });

        assert.equal(oneSide.status, 400);
        assert.equal(notJpeg.status, 400);
    });

    it('finds catalogue cards by name and number, best fit first', async () => {
        const byBoth = await json<Array<{ catalogCardId: string; setName: string }>>('/catalog/search?name=chariz&number=4/102');
        const byName = await json<Array<{ catalogCardId: string }>>('/catalog/search?name=pikachu');

        assert.deepEqual(byBoth.map((found) => found.catalogCardId), ['base1-4', 'base4-4']);
        assert.equal(byBoth[0].setName, 'Base Set');
        assert.deepEqual(byName.map((found) => found.catalogCardId), ['base1-58']);
        assert.deepEqual(await json('/catalog/search'), []);
    });

    it('prices a card once the user says which card it is, and keeps the price history', async () => {
        const card = await upload();
        const confirmed = await json<Card>(`/cards/${card.id}/confirm`, send('POST', { catalogCardId: 'base1-4' }));

        assert.deepEqual([confirmed.status, confirmed.name, confirmed.setName, confirmed.rarity], ['confirmed', 'Charizard', 'Base Set', 'Rare']);
        assert.equal(confirmed.priceTrend, 385.83);
        assert.deepEqual([confirmed.estimatedValue, confirmed.valueFactor], [385.83, 1]);
        assert.equal(confirmed.cardmarketUrl, 'https://www.cardmarket.com/en/Pokemon/Products?idProduct=273699');
        assert.equal(confirmed.priceHistory?.length, 1);
        assert.equal((await fetch(`${api}/cards/${card.id}/confirm`, send('POST', { catalogCardId: 'nope-1' }))).status, 400);
    });

    it('reprices when the print changes, and remembers that the user set the condition', async () => {
        const card = await upload();
        await json(`/cards/${card.id}/confirm`, send('POST', { catalogCardId: 'base1-4' }));
        const changed = await json<Card>(`/cards/${card.id}`, send('PATCH', { variant: 'holo', firstEdition: true, condition: 'played', notes: 'from the attic' }));

        assert.deepEqual([changed.priceTrend, changed.condition, changed.conditionSource], [3489.25, 'played', 'user']);
        assert.deepEqual([changed.estimatedValue, changed.valueFactor], [1046.77, 0.3]);
        assert.equal((await fetch(`${api}/cards/${card.id}`, send('PATCH', { condition: 'shiny' }))).status, 400);
    });

    it('keeps a confirmed card without price when the catalogue has none for it', async () => {
        const card = await upload();
        const confirmed = await json<Card>(`/cards/${card.id}/confirm`, send('POST', { catalogCardId: 'base1-58' }));

        assert.deepEqual([confirmed.status, confirmed.priceTrend, confirmed.rarity], ['confirmed', undefined, 'Common']);
        assert.match(confirmed.cardmarketUrl ?? '', /searchString=Pikachu$/);
    });

    it('reads the photos when a reader is there, and offers the catalogue cards that fit', async () => {
        useReader(() => Promise.resolve(READING));
        const read = await settled((await upload()).id);

        assert.deepEqual([read.status, read.readingState, read.name, read.variant], ['identified', 'done', 'Charizard', 'holo']);
        assert.deepEqual([read.condition, read.conditionSource], ['good', 'model']);
        assert.equal(read.candidates?.[0].catalogCardId, 'base1-4');
    });

    it('keeps the card and its photos when the reading fails', async () => {
        useReader(() => Promise.reject(new Error('the model is away')));
        const failed = await settled((await upload()).id);

        assert.deepEqual([failed.status, failed.readingState, failed.readingError], ['new', 'failed', 'the model is away']);
        assert.equal((await fetch(`${api}/photos/${failed.photos.front}`)).status, 200);
    });

    it('leaves the user\'s condition and confirmed card alone on a second reading', async () => {
        useReader(() => Promise.resolve(READING));
        const card = await settled((await upload()).id);
        await json(`/cards/${card.id}/confirm`, send('POST', { catalogCardId: 'base4-4' }));
        await json(`/cards/${card.id}`, send('PATCH', { condition: 'poor' }));
        await json(`/cards/${card.id}/read`, send('POST'));
        const again = await settled(card.id);

        assert.deepEqual([again.status, again.setName, again.condition, again.conditionSource], ['confirmed', 'Base Set 2', 'poor', 'user']);
    });

    it('exports the collection as CSV', async () => {
        const answer = await fetch(`${api}/export/cards.csv`);
        const lines = (await answer.text()).trim().split('\r\n');

        assert.match(answer.headers.get('content-type') ?? '', /text\/csv/);
        assert.match(lines[0], /Id,Name,Set,Number/);
        assert.ok(lines.some((line) => /Charizard,Base Set,4,Rare/.test(line)));
        assert.ok(lines.some((line) => /played,user,3489\.25,2445\.05,979,1046.77/.test(line)));
        assert.equal(lines.length, (await json<Array<Card>>('/cards')).length + 1);
    });

    it('removes a card with its photo files', async () => {
        const card = await upload();
        const file = join(testFolder, 'photos', `${card.id}-front.jpg`);

        assert.equal(existsSync(file), true);
        assert.equal((await fetch(`${api}/cards/${card.id}`, { method: 'DELETE' })).status, 204);
        assert.equal(existsSync(file), false);
        assert.equal((await fetch(`${api}/cards/${card.id}`)).status, 404);
    });
});
