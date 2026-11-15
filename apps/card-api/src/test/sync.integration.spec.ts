import 'reflect-metadata';

import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';

import { configureApi } from '../api/configure-api';
import { AppModule } from '../app.module';
import { SESSION_COOKIE } from '../core/rules/session';
import { CatalogService } from '../core/services/catalog.service';
import { SessionService } from '../core/services/session.service';
import { SyncService, SyncState } from '../core/services/sync.service';
import { FakeGoogle } from './fake-google';
import { JPEG, photoForm, startCatalogue, testFolder } from './test-env';

const SITE = 'https://cards.example.com';
const OWNER = 'owner@example.com';
const GUEST = 'guest@example.com';

process.env['GOOGLE_CLIENT_ID'] = 'test-client';
process.env['GOOGLE_CLIENT_SECRET'] = 'test-secret';
process.env['PUBLIC_URL'] = SITE;
process.env['ALLOWED_EMAILS'] = `${OWNER}, ${GUEST}`;

describe('copying the collection to Google Drive', () => {
    const google = new FakeGoogle();
    let app: NestExpressApplication;
    let catalogue: Server;
    let api: string;
    let sync: SyncService;

    const as = (email: string, extra = ''): Record<string, string> => ({ cookie: `${SESSION_COOKIE}=${app.get(SessionService).issue(email)}${extra}`, origin: SITE });
    const call = (path: string, email: string, init: RequestInit = {}, cookie = ''): Promise<Response> =>
        fetch(`${api}${path}`, { redirect: 'manual', ...init, headers: { ...as(email, cookie), ...init.headers } });
    const upload = async (): Promise<{ id: number }> => (await (await call('/cards', OWNER, { method: 'POST', body: photoForm() })).json()) as { id: number };
    const state = async (): Promise<SyncState> => (await (await call('/system', OWNER)).json()).sync as SyncState;

    before(async () => {
        catalogue = await startCatalogue();
        google.install();
        app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
        configureApi(app);
        await app.listen(0, '127.0.0.1');
        api = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/v1`;
        sync = app.get(SyncService);
        await app.get(CatalogService).refresh();
    });

    after(async () => {
        await app.close();
        google.uninstall();
        catalogue.close();
        rmSync(testFolder, { recursive: true, force: true });
    });

    it('is ready to connect but does nothing before the owner gave consent', async () => {
        await upload();
        await sync.run();

        assert.deepEqual([(await state()).configured, (await state()).connected, (await state()).waitingPhotos], [true, false, 2]);
        assert.deepEqual(google.files, []);
    });

    it('lets only the owner start the consent, asking Google for Drive access that lasts', async () => {
        const start = await call('/google/connect', OWNER);
        const target = new URL(start.headers.get('location') ?? '');

        assert.equal((await call('/google/connect', GUEST)).status, 403);
        assert.equal(start.status, 302);
        assert.equal(target.host, 'accounts.google.com');
        assert.equal(target.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive');
        assert.equal(target.searchParams.get('access_type'), 'offline');
        assert.equal(target.searchParams.get('redirect_uri'), `${SITE}/api/v1/google/callback`);
    });

    it('refuses a callback whose state does not match', async () => {
        const answer = await call('/google/callback?code=abc&state=guess', OWNER, {}, '; drive_state=other');

        assert.equal(answer.headers.get('location'), '/#/settings?google=failed');
        assert.equal((await state()).connected, false);
    });

    it('connects, then puts photos, sheet and database copy in the Drive folder', async () => {
        const start = await call('/google/connect', OWNER);
        const stateValue = new URL(start.headers.get('location') ?? '').searchParams.get('state') ?? '';
        const answer = await call(`/google/callback?code=abc&state=${stateValue}`, OWNER, {}, `; drive_state=${stateValue}`);
        await sync.run();
        await sync.run(true);

        assert.equal(answer.headers.get('location'), '/#/settings?google=connected');
        assert.equal(google.tokenRequests[0]['grant_type'], 'authorization_code');
        assert.deepEqual(google.paths(), [
            'Documents',
            'Documents/~Hobby',
            'Documents/~Hobby/Pokémon',
            'Documents/~Hobby/Pokémon/Pokémon cards',
            'Documents/~Hobby/Pokémon/backup',
            'Documents/~Hobby/Pokémon/backup/app.db',
            'Documents/~Hobby/Pokémon/photos',
            'Documents/~Hobby/Pokémon/photos/1-back.jpg',
            'Documents/~Hobby/Pokémon/photos/1-front.jpg'
        ]);
        assert.deepEqual([(await state()).connected, (await state()).waitingPhotos, (await state()).lastError], [true, 0, undefined]);
        assert.match((await state()).sheetUrl ?? '', /docs\.google\.com\/spreadsheets\/d\/file-/);
    });

    it('writes one row per card with links to its photos, on tabs with fixed names', async () => {
        const cards = google.table('Cards');
        const front = google.files.find((file) => file.name === '1-front.jpg');

        assert.deepEqual(cards[0].slice(0, 4), ['Id', 'Name', 'Set', 'Number']);
        assert.equal(cards.length, 2);
        assert.equal(cards[1][20], `https://drive.google.com/file/d/${front?.id}/view`);
        assert.deepEqual(google.table('Prices')[0].slice(0, 2), ['Day', 'Card id']);
    });

    it('uploads only what is new on a later run, and replaces the database copy', async () => {
        const second = await upload();
        await call(`/cards/${second.id}/confirm`, OWNER, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ catalogCardId: 'base1-4' }) });
        await sync.run(true);

        const photos = google.files.filter((file) => file.mimeType === 'image/jpeg');
        const backups = google.files.filter((file) => file.name === 'app.db');

        assert.deepEqual(photos.map((file) => [file.name, file.uploads]), [['1-front.jpg', 1], ['1-back.jpg', 1], ['2-front.jpg', 1], ['2-back.jpg', 1]]);
        assert.equal(backups.length, 1);
        assert.ok(backups[0].uploads > 1);
        assert.deepEqual(google.table('Cards').map((row) => row[1]), ['Name', '', 'Charizard']);
        assert.deepEqual(google.table('Prices')[1].slice(1, 4), [second.id, 'Charizard', 385.83]);
    });

    it('reports a failed run and catches up on the next one', async () => {
        await upload();
        google.failUploads = true;
        await sync.run();
        const failed = await state();

        google.failUploads = false;
        await sync.run();

        assert.match(failed.lastError ?? '', /Google answered 403/);
        assert.equal(failed.waitingPhotos, 2);
        assert.deepEqual([(await state()).waitingPhotos, (await state()).lastError], [0, undefined]);
    });

    it('keeps a table the owner made of the cards tab fitted to the rows and columns it writes', async () => {
        const cards = google.tab('Cards');
        assert.ok(cards);
        cards.tables = [{ tableId: 'table-1', range: { sheetId: cards.sheetId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 5 } }];
        await upload();
        await sync.run();

        const written = google.table('Cards');

        assert.deepEqual(cards.tables[0].range, { sheetId: cards.sheetId, startRowIndex: 0, endRowIndex: written.length, startColumnIndex: 0, endColumnIndex: written[0].length });
        assert.equal(written.length, 5);
        assert.equal((await state()).lastError, undefined);
    });

    it('copies the original photo too, and moves it to the Drive trash with the card', async () => {
        const created = (await (await call('/cards', OWNER, { method: 'POST', body: photoForm(undefined, undefined, { backSource: Buffer.from(JPEG) }) })).json()) as { id: number };
        await sync.run();
        const source = google.files.find((file) => file.name === `${created.id}-back-source.jpg`);

        await call(`/cards/${created.id}`, OWNER, { method: 'DELETE' });
        await sync.run();

        assert.equal(source?.parent, google.files.find((file) => file.name === 'photos')?.id);
        assert.equal(source?.trashed, true);
        assert.equal((await state()).waitingPhotos, 0);
    });

    it('moves the photos of a deleted card to the Drive trash on the next run', async () => {
        const doomed = await upload();
        await sync.run();
        await call(`/cards/${doomed.id}`, OWNER, { method: 'DELETE' });
        await sync.run();

        const photos = google.files.filter((file) => file.name.startsWith(`${doomed.id}-`));

        assert.deepEqual(photos.map((file) => [file.name, file.trashed]), [[`${doomed.id}-front.jpg`, true], [`${doomed.id}-back.jpg`, true]]);
        assert.equal(google.table('Cards').some((row) => row[0] === doomed.id), false);
        assert.equal((await state()).lastError, undefined);
    });

    it('stops copying after the owner disconnects', async () => {
        const answer = await call('/google/disconnect', OWNER, { method: 'POST' });
        const filesBefore = google.files.length;
        await upload();
        await sync.run();

        assert.equal(((await answer.json()) as SyncState).connected, false);
        assert.equal(google.files.length, filesBefore);
    });
});
