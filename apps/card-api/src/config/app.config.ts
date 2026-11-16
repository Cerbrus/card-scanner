import { dirname, join } from 'path';

import { Injectable } from '@nestjs/common';

const DEFAULT_PORT = 3030;
const DEFAULT_VISION_MODEL = 'claude-opus-5-5';
const DEFAULT_CATALOG_URL = 'https://api.tcgdex.net/v2/en';
const DEFAULT_DRIVE_FOLDER = 'Documents/~Hobby/Pokémon';
const DEFAULT_SHEET_NAME = 'Pokémon cards';

const setting = (name: string): string | undefined => process.env[name] || undefined;
const list = (value: string): Array<string> =>
    value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part);

@Injectable()
export class AppConfig {
    public readonly port = Number(setting('PORT')) || DEFAULT_PORT;
    public readonly development = setting('ENVIRONMENT') === 'development';

    public readonly version = setting('APP_VERSION') ?? 'dev';
    public readonly commit = setting('APP_COMMIT');
    public readonly builtAt = setting('APP_BUILT');

    public readonly databasePath = setting('DATABASE_PATH') ?? join(process.cwd(), 'data', 'app.db');
    public readonly dataFolder = dirname(this.databasePath);
    public readonly logFile = setting('LOG_PATH') ?? join(this.dataFolder, 'logs', 'app.log');
    public readonly sessionSecretPath = setting('SESSION_SECRET_PATH') ?? join(this.dataFolder, 'session-secret');
    public readonly photosPath = setting('PHOTOS_PATH') ?? join(this.dataFolder, 'photos');
    public readonly googleTokenPath = setting('GOOGLE_TOKEN_PATH') ?? join(this.dataFolder, 'google-token.json');
    public readonly frontendPath = setting('FRONTEND_PATH') ?? join(__dirname, 'public');

    public readonly googleClientId = setting('GOOGLE_CLIENT_ID') ?? '';
    public readonly googleClientSecret = setting('GOOGLE_CLIENT_SECRET') ?? '';
    public readonly publicUrl = (setting('PUBLIC_URL') ?? '').replace(/\/+$/, '');
    public readonly allowedEmails = list(setting('ALLOWED_EMAILS') ?? '').map((email) => email.toLowerCase());
    public readonly viewerEmails = list(setting('VIEWER_EMAILS') ?? '').map((email) => email.toLowerCase());
    public readonly ownerEmail = (setting('OWNER_EMAIL') ?? this.allowedEmails[0] ?? '').toLowerCase();
    public readonly loginEnabled = this.googleClientId !== '';
    public readonly contentPolicyMode = setting('CSP_MODE');

    public readonly anthropicApiKey = setting('ANTHROPIC_API_KEY') ?? '';
    public readonly visionModel = setting('VISION_MODEL') ?? DEFAULT_VISION_MODEL;
    public readonly visionEnabled = this.anthropicApiKey !== '';

    public readonly catalogUrl = (setting('CATALOG_URL') ?? DEFAULT_CATALOG_URL).replace(/\/+$/, '');
    public readonly backgroundJobs = setting('BACKGROUND_JOBS') !== 'off';

    public readonly driveFolder = setting('DRIVE_FOLDER') ?? DEFAULT_DRIVE_FOLDER;
    public readonly sheetName = setting('SHEET_NAME') ?? DEFAULT_SHEET_NAME;
    public readonly syncConfigured = this.googleClientId !== '' && this.googleClientSecret !== '' && this.publicUrl !== '';

    public get redirectUri(): string {
        return `${this.publicUrl}/api/v1/auth/google/callback`;
    }

    public get driveRedirectUri(): string {
        return `${this.publicUrl}/api/v1/google/callback`;
    }

    public get missingLoginSettings(): Array<string> {
        return [
            ['GOOGLE_CLIENT_SECRET', this.googleClientSecret],
            ['PUBLIC_URL', this.publicUrl],
            ['ALLOWED_EMAILS', this.allowedEmails.join()]
        ]
            .filter(([, value]) => !value)
            .map(([name]) => name);
    }
}
