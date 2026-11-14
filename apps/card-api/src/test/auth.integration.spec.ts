import 'reflect-metadata';

import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';

import { photoForm, testFolder } from './test-env';
import { configureApi } from '../api/configure-api';
import { AppModule } from '../app.module';
import { SESSION_COOKIE, newSession, signSession } from '../core/rules/session';
import { SessionService } from '../core/services/session.service';

const SITE = 'https://cards.example.com';
const OWNER = 'owner@example.com';
const GUEST = 'guest@example.com';

process.env['GOOGLE_CLIENT_ID'] = 'test-client';
process.env['GOOGLE_CLIENT_SECRET'] = 'test-secret';
process.env['PUBLIC_URL'] = SITE;
process.env['ALLOWED_EMAILS'] = `Guest@Example.com, ${OWNER}`;
process.env['OWNER_EMAIL'] = OWNER;
process.env['CATALOG_URL'] = 'http://127.0.0.1:9';

describe('login guard over HTTP', () => {
    let app: NestExpressApplication;
    let base: string;
    let secret: string;

    const cookieFor = (email: string): string => `${SESSION_COOKIE}=${signSession(newSession(email, new Date()), secret)}`;
    const status = async (path: string, init?: RequestInit): Promise<number> => (await fetch(`${base}${path}`, { redirect: 'manual', ...init })).status;

    before(async () => {
        app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
        configureApi(app);
        await app.listen(0, '127.0.0.1');
        base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/v1`;
        secret = app.get(SessionService).secret;
    });

    after(async () => {
        await app.close();
        rmSync(testFolder, { recursive: true, force: true });
    });

    it('refuses a request without a session, also for photos and the export', async () => {
        for (const path of ['/cards', '/cards/1', '/photos/1', '/system', '/catalog/search?name=x', '/export/cards.csv']) {
            assert.equal(await status(path), 401, path);
        }
        assert.equal(await status('/cards', { method: 'POST', body: photoForm() }), 401);
    });

    it('lets the health check through', async () => {
        assert.equal(await status('/health'), 200);
    });

    it('accepts the session of an allowed account', async () => {
        assert.equal(await status('/cards', { headers: { cookie: cookieFor(GUEST) } }), 200);
    });

    it('refuses a valid session of an account that is not allowed', async () => {
        assert.equal(await status('/cards', { headers: { cookie: cookieFor('stranger@example.com') } }), 401);
    });

    it('refuses a session signed with another secret', async () => {
        const forged = `${SESSION_COOKIE}=${signSession(newSession(OWNER, new Date()), 'another-secret')}`;

        assert.equal(await status('/cards', { headers: { cookie: forged } }), 401);
    });

    it('keeps the system actions for the owner', async () => {
        assert.equal(await status('/system/catalog/refresh', { method: 'POST', headers: { cookie: cookieFor(GUEST) } }), 403);
        assert.equal(await status('/google/sync', { method: 'POST', headers: { cookie: cookieFor(GUEST) } }), 403);
        assert.equal(await status('/system/catalog/refresh', { method: 'POST', headers: { cookie: cookieFor(OWNER) } }), 202);
    });

    it('refuses a change that comes from another site', async () => {
        const headers = { cookie: cookieFor(OWNER) };

        assert.equal(await status('/cards', { method: 'POST', body: photoForm(), headers: { ...headers, origin: 'https://evil.example.com' } }), 403);
        assert.equal(await status('/cards', { method: 'POST', body: photoForm(), headers: { ...headers, origin: SITE } }), 201);
    });

    it('reports the login state', async () => {
        const anonymous = (await (await fetch(`${base}/auth/me`)).json()) as { enabled: boolean; authenticated: boolean };
        const owner = (await (await fetch(`${base}/auth/me`, { headers: { cookie: cookieFor(OWNER) } })).json()) as { email?: string; owner: boolean };

        assert.deepEqual(anonymous, { enabled: true, authenticated: false, owner: false });
        assert.deepEqual([owner.email, owner.owner], [OWNER, true]);
    });

    it('sends the browser to Google with a state cookie, and refuses a callback without it', async () => {
        const start = await fetch(`${base}/auth/google`, { redirect: 'manual' });
        const target = new URL(start.headers.get('location') ?? '');

        assert.equal(start.status, 302);
        assert.equal(target.host, 'accounts.google.com');
        assert.equal(target.searchParams.get('redirect_uri'), `${SITE}/api/v1/auth/google/callback`);
        assert.match(start.headers.get('set-cookie') ?? '', /oauth_state=.+HttpOnly.+Secure/i);

        const callback = await fetch(`${base}/auth/google/callback?code=abc&state=guess`, { redirect: 'manual' });
        assert.equal(callback.status, 302);
        assert.equal(callback.headers.get('location'), '/#/login?error=failed');
        assert.doesNotMatch(callback.headers.get('set-cookie') ?? '', /session=/);
    });
});
