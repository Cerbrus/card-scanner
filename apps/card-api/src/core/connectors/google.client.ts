import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import { Injectable } from '@nestjs/common';

import { AppConfig } from '../../config/app.config';
import { Cell } from '../rules/collection-table';

interface StoredToken {
    refreshToken: string;
    connectedAt: string;
}

interface TokenAnswer {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
}

interface DriveFile {
    id: string;
    name?: string;
    trashed?: boolean;
}

interface SheetProperties {
    sheetId: number;
    title: string;
}

interface SheetTables {
    properties: SheetProperties;
    tables?: Array<{ tableId: string }>;
}

export class GoogleError extends Error {
    constructor(
        message: string,
        public readonly status: number
    ) {
        super(message);
    }
}

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const SHEETS_URL = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const FOLDER_TYPE = 'application/vnd.google-apps.folder';
const SHEET_TYPE = 'application/vnd.google-apps.spreadsheet';
const EXPIRY_MARGIN_MILLISECONDS = 60000;
const NOT_FOUND = 404;
const MIN_TABLE_ROWS = 2;

export const DRIVE_ROOT = 'root';

@Injectable()
export class GoogleClient {
    private accessToken?: { value: string; expiresAt: number };

    constructor(private readonly config: AppConfig) {
    }

    public get connected(): boolean {
        return this.stored() !== undefined;
    }

    public get connectedAt(): string | undefined {
        return this.stored()?.connectedAt;
    }

    public consentUrl(state: string): string {
        const query = new URLSearchParams({
            client_id: this.config.googleClientId,
            redirect_uri: this.config.driveRedirectUri,
            response_type: 'code',
            scope: DRIVE_SCOPE,
            access_type: 'offline',
            prompt: 'consent',
            state
        });

        return `${AUTH_URL}?${query}`;
    }

    public async connect(code: string): Promise<void> {
        const tokens = await this.token({ code, redirect_uri: this.config.driveRedirectUri, grant_type: 'authorization_code' });
        if (!tokens.refresh_token) {
            throw new GoogleError('Google gave no refresh token', 0);
        }

        mkdirSync(dirname(this.config.googleTokenPath), { recursive: true });
        const stored: StoredToken = { refreshToken: tokens.refresh_token, connectedAt: new Date().toISOString() };
        writeFileSync(this.config.googleTokenPath, JSON.stringify(stored), { mode: 0o600 });
        this.remember(tokens);
    }

    public disconnect(): void {
        rmSync(this.config.googleTokenPath, { force: true });
        this.accessToken = undefined;
    }

    public async exists(fileId: string): Promise<boolean> {
        try {
            const file = await this.json<DriveFile>(`${DRIVE_URL}/${fileId}?fields=id,trashed`);

            return !file.trashed;
        } catch (error) {
            if (error instanceof GoogleError && error.status === NOT_FOUND) {
                return false;
            }
            throw error;
        }
    }

    public async trash(fileId: string): Promise<void> {
        try {
            await this.json(`${DRIVE_URL}/${fileId}?fields=id`, { method: 'PATCH', body: JSON.stringify({ trashed: true }) });
        } catch (error) {
            if (!(error instanceof GoogleError && error.status === NOT_FOUND)) {
                throw error;
            }
        }
    }

    public async folderPath(path: string): Promise<string> {
        let parent = DRIVE_ROOT;
        for (const name of path.split('/').filter((part) => part)) {
            parent = (await this.find(name, parent, FOLDER_TYPE)) ?? (await this.create(name, parent, FOLDER_TYPE));
        }

        return parent;
    }

    public async folder(name: string, parent: string): Promise<string> {
        return (await this.find(name, parent, FOLDER_TYPE)) ?? (await this.create(name, parent, FOLDER_TYPE));
    }

    public async spreadsheet(name: string, parent: string): Promise<string> {
        return (await this.find(name, parent, SHEET_TYPE)) ?? (await this.create(name, parent, SHEET_TYPE));
    }

    public async find(name: string, parent: string, mimeType?: string): Promise<string | undefined> {
        const conditions = [`name = '${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`, `'${parent}' in parents`, 'trashed = false'];
        if (mimeType) {
            conditions.push(`mimeType = '${mimeType}'`);
        }
        const query = new URLSearchParams({ q: conditions.join(' and '), fields: 'files(id,name)', pageSize: '1' });

        return (await this.json<{ files: Array<DriveFile> }>(`${DRIVE_URL}?${query}`)).files[0]?.id;
    }

    public async upload(name: string, parent: string, mimeType: string, data: Buffer, existingId?: string): Promise<string> {
        if (existingId) {
            const updated = await this.json<DriveFile>(`${UPLOAD_URL}/${existingId}?uploadType=media&fields=id`, {
                method: 'PATCH',
                headers: { 'Content-Type': mimeType },
                body: new Uint8Array(data)
            });

            return updated.id;
        }

        const boundary = `cardscanner-${randomBytes(12).toString('hex')}`;
        const body = Buffer.concat([
            Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [parent] })}\r\n`),
            Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
            data,
            Buffer.from(`\r\n--${boundary}--\r\n`)
        ]);
        const created = await this.json<DriveFile>(`${UPLOAD_URL}?uploadType=multipart&fields=id`, {
            method: 'POST',
            headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
            body: new Uint8Array(body)
        });

        return created.id;
    }

    public async useTabs(spreadsheetId: string, titles: Array<string>): Promise<void> {
        const answer = await this.json<{ sheets: Array<{ properties: SheetProperties }> }>(`${SHEETS_URL}/${spreadsheetId}?fields=sheets.properties(sheetId,title)`);
        const existing = answer.sheets.map((sheet) => sheet.properties);
        const spare = existing.filter((sheet) => !titles.includes(sheet.title));
        const requests = titles
            .filter((title) => !existing.some((sheet) => sheet.title === title))
            .map((title) => {
                const reused = spare.shift();

                return reused
                    ? { updateSheetProperties: { properties: { sheetId: reused.sheetId, title }, fields: 'title' } }
                    : { addSheet: { properties: { title } } };
            });

        if (requests.length) {
            await this.json(`${SHEETS_URL}/${spreadsheetId}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) });
        }
    }

    public async writeTab(spreadsheetId: string, title: string, table: Array<Array<Cell>>): Promise<void> {
        const tab = encodeURIComponent(`'${title}'`);
        await this.json(`${SHEETS_URL}/${spreadsheetId}/values/${tab}:clear`, { method: 'POST', body: '{}' });
        await this.json(`${SHEETS_URL}/${spreadsheetId}/values/${tab}!A1?valueInputOption=RAW`, {
            method: 'PUT',
            body: JSON.stringify({ values: table })
        });
        await this.fitTables(spreadsheetId, title, table);
    }

    private async sheet(spreadsheetId: string, title: string): Promise<SheetTables | undefined> {
        const fields = encodeURIComponent('sheets(properties(sheetId,title),tables(tableId))');
        const answer = await this.json<{ sheets: Array<SheetTables> }>(`${SHEETS_URL}/${spreadsheetId}?fields=${fields}`);

        return answer.sheets.find((candidate) => candidate.properties.title === title);
    }

    private async fitTables(spreadsheetId: string, title: string, table: Array<Array<Cell>>): Promise<void> {
        const sheet = await this.sheet(spreadsheetId, title);
        const range = {
            sheetId: sheet?.properties.sheetId,
            startRowIndex: 0,
            endRowIndex: Math.max(MIN_TABLE_ROWS, table.length),
            startColumnIndex: 0,
            endColumnIndex: Math.max(1, ...table.map((row) => row.length))
        };
        const requests = (sheet?.tables ?? []).map(({ tableId }) => ({ updateTable: { table: { tableId, range }, fields: 'range' } }));

        if (requests.length) {
            await this.json(`${SHEETS_URL}/${spreadsheetId}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) });
        }
    }

    private async create(name: string, parent: string, mimeType: string): Promise<string> {
        const created = await this.json<DriveFile>(`${DRIVE_URL}?fields=id`, {
            method: 'POST',
            body: JSON.stringify({ name, mimeType, parents: [parent] })
        });

        return created.id;
    }

    private async json<T>(url: string, init: RequestInit = {}): Promise<T> {
        const headers = { 'Content-Type': 'application/json', ...init.headers, Authorization: `Bearer ${await this.bearer()}` };
        const answer = await fetch(url, { ...init, headers });
        const text = await answer.text();
        if (!answer.ok) {
            throw new GoogleError(`Google answered ${answer.status} for ${new URL(url).pathname}: ${text.slice(0, 300)}`, answer.status);
        }

        return (text ? JSON.parse(text) : {}) as T;
    }

    private async bearer(): Promise<string> {
        if (this.accessToken && this.accessToken.expiresAt > Date.now()) {
            return this.accessToken.value;
        }

        const stored = this.stored();
        if (!stored) {
            throw new GoogleError('Google Drive is not connected', 0);
        }

        return this.remember(await this.token({ refresh_token: stored.refreshToken, grant_type: 'refresh_token' }));
    }

    private async token(fields: Record<string, string>): Promise<TokenAnswer> {
        const answer = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: this.config.googleClientId, client_secret: this.config.googleClientSecret, ...fields })
        });
        const tokens = (await answer.json()) as TokenAnswer;
        if (!answer.ok || !tokens.access_token) {
            throw new GoogleError(`Google refused the token request: ${tokens.error_description ?? tokens.error ?? answer.status}`, answer.status);
        }

        return tokens;
    }

    private remember(tokens: TokenAnswer): string {
        const value = tokens.access_token as string;
        this.accessToken = { value, expiresAt: Date.now() + (tokens.expires_in ?? 0) * 1000 - EXPIRY_MARGIN_MILLISECONDS };

        return value;
    }

    private stored(): StoredToken | undefined {
        if (!existsSync(this.config.googleTokenPath)) {
            return undefined;
        }

        try {
            return JSON.parse(readFileSync(this.config.googleTokenPath, 'utf-8')) as StoredToken;
        } catch {
            return undefined;
        }
    }
}
