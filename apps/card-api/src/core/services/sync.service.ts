import { readFileSync, rmSync } from 'fs';
import { join } from 'path';

import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { CardService } from './card.service';
import { PriceService } from './price.service';
import { SettingService } from './setting.service';
import { AppConfig } from '../../config/app.config';
import { PhotoEntity } from '../../data/entities';
import { GoogleClient } from '../connectors/google.client';
import { Cell, collectionTable } from '../rules/collection-table';

export interface SyncState {
    configured: boolean;
    connected: boolean;
    connectedAt?: string;
    running: boolean;
    lastRunAt?: string;
    lastError?: string;
    waitingPhotos: number;
    folder: string;
    sheetUrl?: string;
}

interface Places {
    root: string;
    photos: string;
    backup: string;
    sheet: string;
}

const PLACES = 'sync.places';
const LAST_RUN = 'sync.lastRunAt';
const LAST_ERROR = 'sync.lastError';
const BACKUP_FILE = 'sync.backupFileId';
const PHOTOS_FOLDER = 'photos';
const BACKUP_FOLDER = 'backup';
const BACKUP_NAME = 'app.db';
const CARDS_TAB = 'Cards';
const PRICES_TAB = 'Prices';
const PRICES_HEADER: Array<Cell> = ['Day', 'Card id', 'Name', 'Trend (EUR)', '30-day average (EUR)', 'Low (EUR)'];
const DRIVE_FILE_URL = 'https://drive.google.com/file/d/';
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/';

@Injectable()
export class SyncService {
    private readonly logger = new Logger('Sync');
    private running?: Promise<void>;

    constructor(
        private readonly config: AppConfig,
        private readonly google: GoogleClient,
        private readonly cards: CardService,
        private readonly prices: PriceService,
        private readonly settings: SettingService,
        private readonly dataSource: DataSource
    ) {
    }

    public get usable(): boolean {
        return this.config.syncConfigured && this.google.connected;
    }

    public async state(): Promise<SyncState> {
        const places = await this.knownPlaces();

        return {
            configured: this.config.syncConfigured,
            connected: this.google.connected,
            connectedAt: this.google.connectedAt,
            running: this.running !== undefined,
            lastRunAt: await this.settings.get(LAST_RUN),
            lastError: await this.settings.get(LAST_ERROR),
            waitingPhotos: (await this.cards.unsyncedPhotos()).length + (await this.cards.unsyncedSources()).length,
            folder: this.config.driveFolder,
            sheetUrl: places ? `${SHEET_URL}${places.sheet}` : undefined
        };
    }

    public async disconnect(): Promise<void> {
        this.google.disconnect();
        await this.settings.remove(LAST_ERROR);
    }

    public run(withBackup = false): Promise<void> {
        if (!this.usable) {
            return Promise.resolve();
        }

        this.running ??= this.sync(withBackup)
            .then(() => this.settings.remove(LAST_ERROR))
            .catch(async (error: unknown) => {
                this.logger.warn(`sync failed: ${error}`);
                await this.settings.set(LAST_ERROR, error instanceof Error ? error.message : String(error));
            })
            .finally(() => {
                this.running = undefined;
            });

        return this.running;
    }

    private async sync(withBackup: boolean): Promise<void> {
        const places = await this.places();
        const removed = await this.removeDeletedPhotos();
        const waiting = await this.cards.unsyncedPhotos();
        for (const photo of waiting) {
            const data = readFileSync(join(this.config.photosPath, photo.file));
            const existing = await this.google.find(photo.file, places.photos);
            await this.cards.markPhotoSynced(photo.id, await this.google.upload(photo.file, places.photos, 'image/jpeg', data, existing));
        }
        for (const photo of await this.cards.unsyncedSources()) {
            const file = photo.sourceFile as string;
            const existing = await this.google.find(file, places.photos);
            await this.cards.markSourceSynced(photo.id, await this.google.upload(file, places.photos, 'image/jpeg', readFileSync(join(this.config.photosPath, file)), existing));
        }

        await this.google.useTabs(places.sheet, [CARDS_TAB, PRICES_TAB]);
        const rows = await this.cards.rows((photo) => this.photoLink(photo));
        await this.google.writeTab(places.sheet, CARDS_TAB, collectionTable(rows));
        await this.google.writeTab(places.sheet, PRICES_TAB, await this.priceTable(new Map(rows.map((row) => [row.id, row.name]))));

        if (withBackup) {
            await this.backup(places);
        }
        await this.settings.set(LAST_RUN, new Date().toISOString());
        this.logger.log(`synced: ${waiting.length} photo(s) uploaded, ${removed} moved to the Drive trash, ${rows.length} row(s) written${withBackup ? ', database copied' : ''}`);
    }

    private async removeDeletedPhotos(): Promise<number> {
        const deleted = await this.cards.drivePhotosToRemove();
        for (const photo of deleted) {
            await this.google.trash(photo.driveFileId);
            await this.cards.markDrivePhotoRemoved(photo.id);
        }

        return deleted.length;
    }

    private async backup(places: Places): Promise<void> {
        const copy = join(this.config.dataFolder, 'backup-copy.db');
        rmSync(copy, { force: true });
        await this.dataSource.query('VACUUM INTO ?', [copy]);

        try {
            const known = await this.settings.get(BACKUP_FILE);
            const existing = known && (await this.google.exists(known)) ? known : await this.google.find(BACKUP_NAME, places.backup);
            await this.settings.set(BACKUP_FILE, await this.google.upload(BACKUP_NAME, places.backup, 'application/vnd.sqlite3', readFileSync(copy), existing));
        } finally {
            rmSync(copy, { force: true });
        }
    }

    private async priceTable(names: Map<number, string>): Promise<Array<Array<Cell>>> {
        const snapshots = await this.prices.all();

        return [
            PRICES_HEADER,
            ...snapshots.map((snapshot): Array<Cell> => [
                snapshot.day,
                snapshot.ownedCardId,
                names.get(snapshot.ownedCardId) ?? '',
                snapshot.trend ?? '',
                snapshot.avg30 ?? '',
                snapshot.low ?? ''
            ])
        ];
    }

    private photoLink(photo: PhotoEntity): string {
        return photo.driveFileId ? `${DRIVE_FILE_URL}${photo.driveFileId}/view` : '';
    }

    private async knownPlaces(): Promise<Places | undefined> {
        const stored = await this.settings.get(PLACES);

        return stored ? (JSON.parse(stored) as Places) : undefined;
    }

    private async places(): Promise<Places> {
        const known = await this.knownPlaces();
        if (known && (await this.google.exists(known.root)) && (await this.google.exists(known.photos)) && (await this.google.exists(known.sheet))) {
            return known;
        }

        const root = await this.google.folderPath(this.config.driveFolder);
        const photos = await this.google.folder(PHOTOS_FOLDER, root);
        const places: Places = {
            root,
            photos,
            backup: await this.google.folder(BACKUP_FOLDER, root),
            sheet: await this.google.spreadsheet(this.config.sheetName, root)
        };
        if (known?.photos !== photos) {
            await this.cards.forgetDriveFiles();
        }
        await this.settings.set(PLACES, JSON.stringify(places));

        return places;
    }
}
