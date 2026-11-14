import { randomBytes } from 'crypto';

import { Controller, Get, HttpCode, Logger, Post, Query, Req, Res } from '@nestjs/common';

import { AppConfig } from '../../config/app.config';
import { GoogleClient } from '../../core/connectors/google.client';
import { parseCookies, safeEqual } from '../../core/rules/session';
import { SyncService, SyncState } from '../../core/services/sync.service';
import { OwnerOnly } from '../guards/owner.decorator';
import { CookieOptions, HttpRequest, HttpResponse, cookieHeader } from '../http';

const STATE_COOKIE = 'drive_state';
const STATE_LIFETIME_MILLISECONDS = 10 * 60 * 1000;
const SETTINGS_PAGE = '/#/settings';

@OwnerOnly()
@Controller({ path: 'google', version: '1' })
export class GoogleController {
    private readonly logger = new Logger('Sync');

    constructor(
        private readonly config: AppConfig,
        private readonly google: GoogleClient,
        private readonly sync: SyncService
    ) {
    }

    @Get('connect')
    public start(@Res() response: HttpResponse): void {
        if (!this.config.syncConfigured) {
            response.redirect(`${SETTINGS_PAGE}?google=not_configured`);
            return;
        }

        const state = randomBytes(24).toString('base64url');
        response.cookie(STATE_COOKIE, state, { ...this.cookieOptions(), maxAge: STATE_LIFETIME_MILLISECONDS });
        response.redirect(this.google.consentUrl(state));
    }

    @Get('callback')
    public async finish(
        @Req() request: HttpRequest,
        @Res() response: HttpResponse,
        @Query('code') code?: string,
        @Query('state') state?: string
    ): Promise<void> {
        const expectedState = parseCookies(cookieHeader(request))[STATE_COOKIE];
        response.clearCookie(STATE_COOKIE, this.cookieOptions());
        if (!code || !state || !expectedState || !safeEqual(state, expectedState)) {
            response.redirect(`${SETTINGS_PAGE}?google=failed`);
            return;
        }

        try {
            await this.google.connect(code);
            this.logger.log('Google Drive connected');
            void this.sync.run(true);
            response.redirect(`${SETTINGS_PAGE}?google=connected`);
        } catch (error) {
            this.logger.warn(`Google Drive could not be connected: ${error}`);
            response.redirect(`${SETTINGS_PAGE}?google=failed`);
        }
    }

    @Post('disconnect')
    @HttpCode(200)
    public async disconnect(): Promise<SyncState> {
        await this.sync.disconnect();

        return this.sync.state();
    }

    @Post('sync')
    @HttpCode(202)
    public run(): Promise<SyncState> {
        void this.sync.run(true);

        return this.sync.state();
    }

    private cookieOptions(): CookieOptions {
        return { httpOnly: true, sameSite: 'lax', secure: this.config.publicUrl.startsWith('https://'), path: '/' };
    }
}
