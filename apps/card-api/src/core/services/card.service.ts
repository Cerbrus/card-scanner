import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

import { BadRequestException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';

import { AppConfig } from '../../config/app.config';
import {
    Candidate,
    CardReading,
    CatalogCardEntity,
    CatalogSetEntity,
    Condition,
    DriveTrashEntity,
    Finish,
    Language,
    OwnedCardEntity,
    PhotoEntity,
    PhotoSide,
    PriceSnapshotEntity
} from '../../data/entities';
import { CardReader, describeReaderError } from '../connectors/card.reader';
import { CollectionRow } from '../rules/collection-table';
import { MatchQuery, numbersWithSlash } from '../rules/matching';
import { MAX_PHOTO_BYTES, MAX_THUMB_BYTES, PhotoVersion, isJpeg, photoFileName } from '../rules/photo-file';
import { PriceBasis, ValueSource, cardmarketUrl, ownedValue, pickPrice, worthGrading } from '../rules/pricing';
import { CatalogService } from './catalog.service';
import { ChangesService } from './changes.service';
import { PriceService } from './price.service';

export interface PhotoUpload {
    side: PhotoSide;
    photo: Buffer;
    thumb: Buffer;
    source?: Buffer;
    keepSource?: boolean;
}

export interface ScanText {
    name?: string;
    number?: string;
    digits?: string;
    language?: Language;
}

export interface CardChanges {
    language?: Language | null;
    variant?: Finish | null;
    condition?: Condition | null;
    ownPrice?: number | null;
    notes?: string;
}

export interface CardSummary {
    id: number;
    status: OwnedCardEntity['status'];
    readingState: OwnedCardEntity['readingState'];
    catalogCardId?: string;
    name?: string;
    setName?: string;
    setTotal?: number;
    number?: string;
    rarity?: string;
    image?: string;
    language?: Language;
    variant?: Finish;
    condition?: Condition;
    conditionSource?: OwnedCardEntity['conditionSource'];
    priceTrend?: number;
    priceAvg30?: number;
    priceLow?: number;
    ownPrice?: number;
    value?: number;
    valueSource?: ValueSource;
    worthGrading: boolean;
    priceCheckedAt?: Date;
    createdAt: Date;
    photos: Partial<Record<PhotoSide, number>>;
}

export interface CardDetail extends CardSummary {
    readingError?: string;
    reading?: CardReading;
    candidates: Array<Candidate>;
    conditionNotes?: string;
    notes: string;
    cardmarketUrl?: string;
    priceBasis?: PriceBasis;
    priceHistory: Array<Pick<PriceSnapshotEntity, 'day' | 'trend' | 'avg30' | 'low'>>;
}

const SIDES: Array<PhotoSide> = ['front', 'back'];

@Injectable()
export class CardService implements OnApplicationBootstrap {
    private readonly logger = new Logger('Cards');
    private readingQueue: Promise<void> = Promise.resolve();

    constructor(
        @InjectRepository(OwnedCardEntity) private readonly cards: Repository<OwnedCardEntity>,
        @InjectRepository(PhotoEntity) private readonly photos: Repository<PhotoEntity>,
        @InjectRepository(DriveTrashEntity) private readonly driveTrash: Repository<DriveTrashEntity>,
        private readonly config: AppConfig,
        private readonly catalog: CatalogService,
        private readonly prices: PriceService,
        private readonly reader: CardReader,
        private readonly changes: ChangesService
    ) {
    }

    public async onApplicationBootstrap(): Promise<void> {
        if (!this.reader.enabled) {
            await this.cards.update({ readingState: 'pending' }, { readingState: 'none' });
            return;
        }

        for (const card of await this.cards.findBy({ readingState: 'pending' })) {
            this.queueReading(card.id);
        }
    }

    public async create(uploads: Array<PhotoUpload>, text: ScanText = {}): Promise<CardSummary> {
        const missing = SIDES.filter((side) => !uploads.some((upload) => upload.side === side));
        if (missing.length) {
            throw new BadRequestException(`Missing photo: ${missing.join(', ')}`);
        }
        for (const upload of uploads) {
            this.checkUpload(upload);
        }

        const now = new Date();
        const card = await this.cards.save(
            this.cards.create({
                status: 'new',
                readingState: this.reader.enabled ? 'pending' : 'none',
                language: text.language ?? null,
                notes: '',
                createdAt: now,
                updatedAt: now
            })
        );

        for (const upload of uploads) {
            await this.storePhoto(card.id, upload);
        }
        if (text.name?.trim() || text.number?.trim() || text.digits) {
            await this.applyScanText(card, text);
        }

        if (this.reader.enabled) {
            this.queueReading(card.id);
        }
        this.changes.notify();

        return (await this.summaries([card]))[0];
    }

    public async list(): Promise<Array<CardSummary>> {
        return this.summaries(await this.cards.find({ order: { createdAt: 'DESC', id: 'DESC' } }));
    }

    public async get(id: number): Promise<CardDetail> {
        const card = await this.find(id);
        const [summary] = await this.summaries([card]);
        const known = card.catalogCardId ? (await this.catalog.byIds([card.catalogCardId])).get(card.catalogCardId) : undefined;

        return {
            ...summary,
            readingError: card.readingError ?? undefined,
            reading: card.reading ?? undefined,
            candidates: card.candidates ?? [],
            conditionNotes: card.conditionNotes ?? undefined,
            notes: card.notes,
            cardmarketUrl: summary.name ? cardmarketUrl(card.priceProductId, summary.name, card) : undefined,
            priceBasis: card.priceTrend == null ? undefined : pickPrice(known?.pricing, { variant: card.variant })?.basis,
            priceHistory: (await this.prices.history(id)).map(({ day, trend, avg30, low }) => ({ day, trend, avg30, low }))
        };
    }

    public async update(id: number, changes: CardChanges): Promise<CardDetail> {
        const card = await this.find(id);
        const printChanged = changes.variant !== undefined && changes.variant !== card.variant;

        if (changes.condition !== undefined && changes.condition !== card.condition) {
            card.condition = changes.condition;
            card.conditionSource = changes.condition ? 'user' : null;
        }
        card.language = changes.language === undefined ? card.language : changes.language;
        card.variant = changes.variant === undefined ? card.variant : changes.variant;
        card.notes = changes.notes?.trim() ?? card.notes;
        if (changes.ownPrice !== undefined && changes.ownPrice !== card.ownPrice) {
            card.ownPrice = changes.ownPrice;
            card.ownPriceAt = changes.ownPrice === null ? null : new Date();
        }
        card.updatedAt = new Date();

        if (printChanged && card.catalogCardId) {
            await this.applyPrice(card);
        }
        await this.cards.save(card);
        this.changes.notify();

        return this.get(id);
    }

    public async confirm(id: number, catalogCardId: string): Promise<CardDetail> {
        const card = await this.find(id);
        const chosen = (await this.catalog.byIds([catalogCardId])).get(catalogCardId);
        if (!chosen) {
            throw new BadRequestException('Unknown catalogue card');
        }

        await this.catalog.learnName(card.reading?.name, chosen.name);

        card.catalogCardId = catalogCardId;
        card.status = 'confirmed';
        card.updatedAt = new Date();
        await this.applyPrice(card);
        await this.cards.save(card);
        this.changes.notify();

        return this.get(id);
    }

    public async read(id: number): Promise<CardDetail> {
        const card = await this.find(id);
        if (!this.reader.enabled) {
            throw new BadRequestException('Reading photos is switched off');
        }

        await this.cards.update(card.id, { readingState: 'pending', readingError: null });
        this.queueReading(card.id);

        return this.get(id);
    }

    public async remove(id: number): Promise<void> {
        const card = await this.find(id);
        for (const photo of await this.photos.findBy({ ownedCardId: id })) {
            for (const file of [photo.file, photo.thumbFile, photo.sourceFile]) {
                if (file) {
                    rmSync(join(this.config.photosPath, file), { force: true });
                }
            }
            for (const driveFileId of [photo.driveFileId, photo.sourceDriveFileId]) {
                if (driveFileId) {
                    await this.driveTrash.save(this.driveTrash.create({ driveFileId, createdAt: new Date() }));
                }
            }
        }
        await this.photos.delete({ ownedCardId: id });
        await this.cards.remove(card);
        this.changes.notify();
    }

    public async replacePhoto(id: number, upload: PhotoUpload): Promise<CardDetail> {
        const card = await this.find(id);
        this.checkUpload(upload);

        const previous = await this.photos.findOneBy({ ownedCardId: id, side: upload.side });
        const kept = upload.keepSource && !upload.source ? previous : undefined;
        if (previous?.sourceFile && !kept) {
            rmSync(join(this.config.photosPath, previous.sourceFile), { force: true });
            if (previous.sourceDriveFileId && !upload.source) {
                await this.driveTrash.save(this.driveTrash.create({ driveFileId: previous.sourceDriveFileId, createdAt: new Date() }));
            }
        }
        await this.photos.delete({ ownedCardId: id, side: upload.side });
        await this.storePhoto(id, upload, kept);
        card.updatedAt = new Date();
        await this.cards.save(card);
        this.changes.notify();

        return this.get(id);
    }

    public async photoPath(photoId: number, version: PhotoVersion): Promise<string> {
        const photo = await this.photos.findOneBy({ id: photoId });
        const file = version === 'source' ? photo?.sourceFile : version === 'thumb' ? photo?.thumbFile : photo?.file;
        if (!file) {
            throw new NotFoundException('Unknown photo');
        }

        return join(this.config.photosPath, file);
    }

    public unsyncedPhotos(): Promise<Array<PhotoEntity>> {
        return this.photos.find({ where: { driveFileId: IsNull() }, order: { id: 'ASC' } });
    }

    public async markPhotoSynced(photoId: number, driveFileId: string): Promise<void> {
        await this.photos.update(photoId, { driveFileId, syncedAt: new Date() });
    }

    public unsyncedSources(): Promise<Array<PhotoEntity>> {
        return this.photos.find({ where: { sourceFile: Not(IsNull()), sourceDriveFileId: IsNull() }, order: { id: 'ASC' } });
    }

    public async markSourceSynced(photoId: number, sourceDriveFileId: string): Promise<void> {
        await this.photos.update(photoId, { sourceDriveFileId });
    }

    public drivePhotosToRemove(): Promise<Array<DriveTrashEntity>> {
        return this.driveTrash.find({ order: { id: 'ASC' } });
    }

    public async markDrivePhotoRemoved(id: number): Promise<void> {
        await this.driveTrash.delete(id);
    }

    public async forgetDriveFiles(): Promise<void> {
        await this.photos.createQueryBuilder().update().set({ driveFileId: null, syncedAt: null, sourceDriveFileId: null }).execute();
    }

    public async rows(photoLink: (photo: PhotoEntity) => string): Promise<Array<CollectionRow>> {
        const cards = await this.cards.find({ order: { id: 'ASC' } });
        const summaries = new Map((await this.summaries(cards)).map((summary) => [summary.id, summary]));
        const photos = await this.photos.find();
        const link = (cardId: number, side: PhotoSide): string => {
            const photo = photos.find((candidate) => candidate.ownedCardId === cardId && candidate.side === side);

            return photo ? photoLink(photo) : '';
        };

        return cards.map((card) => {
            const summary = summaries.get(card.id) as CardSummary;

            return {
                id: card.id,
                name: summary.name ?? '',
                setName: summary.setName ?? '',
                number: summary.number ?? '',
                rarity: summary.rarity ?? '',
                language: card.language ?? '',
                variant: card.variant ?? '',
                condition: card.condition ?? '',
                conditionSource: card.conditionSource ?? '',
                priceTrend: card.priceTrend,
                priceAvg30: card.priceAvg30,
                priceLow: card.priceLow,
                value: summary.value,
                valueSource: summary.valueSource ?? '',
                priceCheckedAt: card.priceCheckedAt,
                status: card.status,
                notes: card.notes,
                createdAt: card.createdAt,
                frontPhoto: link(card.id, 'front'),
                backPhoto: link(card.id, 'back'),
                cardmarket: summary.name && card.status === 'confirmed' ? cardmarketUrl(card.priceProductId, summary.name, card) : '',
                worthGrading: summary.worthGrading
            };
        });
    }

    public async refreshPrices(): Promise<number> {
        const confirmed = await this.cards.findBy({ status: 'confirmed' });
        let priced = 0;
        for (const card of confirmed) {
            if (await this.applyPrice(card)) {
                priced++;
            }
            await this.cards.save(card);
        }
        if (confirmed.length) {
            this.changes.notify();
        }

        return priced;
    }

    private async applyPrice(card: OwnedCardEntity): Promise<boolean> {
        const quote = await this.prices.quote(card.catalogCardId as string, { variant: card.variant });
        if (!quote.reachedSource) {
            return false;
        }

        card.priceTrend = quote.price?.trend ?? null;
        card.priceAvg30 = quote.price?.avg30 ?? null;
        card.priceLow = quote.price?.low ?? null;
        card.priceProductId = quote.price?.productId ?? null;
        card.priceCheckedAt = new Date();
        if (quote.price) {
            await this.prices.record(card.id, quote.price);
        }

        return quote.price !== undefined;
    }

    private async storePhoto(cardId: number, upload: PhotoUpload, kept?: PhotoEntity): Promise<void> {
        const file = photoFileName(cardId, upload.side, 'photo');
        const thumbFile = photoFileName(cardId, upload.side, 'thumb');
        const sourceFile = upload.source ? photoFileName(cardId, upload.side, 'source') : (kept?.sourceFile ?? null);
        mkdirSync(this.config.photosPath, { recursive: true });
        writeFileSync(join(this.config.photosPath, file), upload.photo);
        writeFileSync(join(this.config.photosPath, thumbFile), upload.thumb);
        if (upload.source && sourceFile) {
            writeFileSync(join(this.config.photosPath, sourceFile), upload.source);
        }
        await this.photos.save(
            this.photos.create({
                ownedCardId: cardId,
                side: upload.side,
                file,
                thumbFile,
                bytes: upload.photo.length,
                sourceFile,
                sourceDriveFileId: upload.source ? null : (kept?.sourceDriveFileId ?? null)
            })
        );
    }

    private queueReading(id: number): void {
        this.readingQueue = this.readingQueue.then(() => this.runReading(id)).catch((error: unknown) => this.logger.error(`reading card ${id} failed: ${error}`));
    }

    private async runReading(id: number): Promise<void> {
        const card = await this.cards.findOneBy({ id });
        if (!card) {
            return;
        }

        try {
            const photos = await this.photos.findBy({ ownedCardId: id });
            const [front, back] = SIDES.map((side) => {
                const photo = photos.find((candidate) => candidate.side === side);
                if (!photo) {
                    throw new Error(`the ${side} photo is missing`);
                }

                return readFileSync(join(this.config.photosPath, photo.file));
            });
            const reading = await this.reader.read(front, back);
            await this.applyReading(card, reading);
        } catch (error) {
            card.readingState = 'failed';
            card.readingError = describeReaderError(error);
            this.logger.warn(`card ${id} could not be read: ${card.readingError}`);
        }

        card.updatedAt = new Date();
        await this.cards.save(card);
        this.changes.notify();
    }

    private async applyScanText(card: OwnedCardEntity, text: ScanText): Promise<void> {
        const name = text.name?.trim() || null;
        const number = text.number?.trim() || (await this.numberFromDigits(name, text.digits));
        if (!name && !number) {
            return;
        }

        card.reading = { isPokemonCard: true, name, number, setName: null, language: null, finish: null, confidence: 'low', condition: null, conditionNotes: '' };
        card.candidates = await this.catalog.search({ name, number, setName: null });
        card.status = card.candidates.length ? 'identified' : 'new';
        await this.cards.save(card);
    }

    private async numberFromDigits(name: string | null, digits = ''): Promise<string | null> {
        const sets = Array.from((await this.catalog.setsById()).values());
        const numbers = numbersWithSlash(digits, new Set(sets.flatMap((set) => [set.officialCount, set.totalCount])));
        if (!name) {
            return numbers.length === 1 ? numbers[0] : null;
        }

        let best: { number: string | null; score: number } = { number: null, score: await this.bestScore({ name }) };
        for (const number of numbers) {
            const score = await this.bestScore({ name, number });
            if (score > best.score) {
                best = { number, score };
            }
        }

        return best.number;
    }

    private async bestScore(query: MatchQuery): Promise<number> {
        return (await this.catalog.search(query, 1))[0]?.score ?? 0;
    }

    private async applyReading(card: OwnedCardEntity, reading: CardReading): Promise<void> {
        card.reading = reading;
        card.readingState = 'done';
        card.readingError = null;

        if (card.conditionSource !== 'user') {
            card.condition = reading.condition;
            card.conditionSource = reading.condition ? 'model' : null;
            card.conditionNotes = reading.conditionNotes || null;
        }
        if (card.status === 'confirmed' || !reading.isPokemonCard) {
            return;
        }

        card.language = reading.language;
        card.variant = reading.finish;
        card.candidates = await this.catalog.search({ name: reading.name, number: reading.number, setName: reading.setName });
        card.status = card.candidates.length ? 'identified' : 'new';
    }

    private async summaries(cards: Array<OwnedCardEntity>): Promise<Array<CardSummary>> {
        const catalog = await this.catalog.byIds(cards.map((card) => card.catalogCardId).filter((id): id is string => id != null));
        const sets = await this.catalog.setsById();
        const photos = cards.length ? await this.photos.find() : [];

        return cards.map((card) => {
            const known = card.catalogCardId ? catalog.get(card.catalogCardId) : undefined;

            return this.summary(card, known, known ? sets.get(known.setId) : undefined, photos);
        });
    }

    private summary(card: OwnedCardEntity, known: CatalogCardEntity | undefined, set: CatalogSetEntity | undefined, photos: Array<PhotoEntity>): CardSummary {
        const guess = card.candidates?.[0];
        const worth = ownedValue(card.ownPrice, card.priceTrend);

        return {
            id: card.id,
            status: card.status,
            readingState: card.readingState,
            catalogCardId: card.catalogCardId ?? undefined,
            name: known?.name ?? card.reading?.name ?? guess?.name ?? undefined,
            setName: set?.name ?? card.reading?.setName ?? undefined,
            setTotal: set?.officialCount || undefined,
            number: known?.localId ?? card.reading?.number ?? undefined,
            rarity: known?.rarity ?? undefined,
            image: known?.image ?? undefined,
            language: card.language ?? undefined,
            variant: card.variant ?? undefined,
            condition: card.condition ?? undefined,
            conditionSource: card.conditionSource ?? undefined,
            priceTrend: card.priceTrend ?? undefined,
            priceAvg30: card.priceAvg30 ?? undefined,
            priceLow: card.priceLow ?? undefined,
            ownPrice: card.ownPrice ?? undefined,
            value: worth?.value,
            valueSource: worth?.source,
            worthGrading: card.status === 'confirmed' && worthGrading(worth?.value, card.condition),
            priceCheckedAt: card.priceCheckedAt ?? undefined,
            createdAt: card.createdAt,
            photos: Object.fromEntries(photos.filter((photo) => photo.ownedCardId === card.id).map((photo) => [photo.side, photo.id]))
        };
    }

    private async find(id: number): Promise<OwnedCardEntity> {
        const card = await this.cards.findOneBy({ id });
        if (!card) {
            throw new NotFoundException('Unknown card');
        }

        return card;
    }

    private checkUpload(upload: PhotoUpload): void {
        if (!isJpeg(upload.photo) || !isJpeg(upload.thumb) || (upload.source && !isJpeg(upload.source))) {
            throw new BadRequestException(`The ${upload.side} photo is not a JPEG`);
        }
        if (upload.photo.length > MAX_PHOTO_BYTES || upload.thumb.length > MAX_THUMB_BYTES || (upload.source?.length ?? 0) > MAX_PHOTO_BYTES) {
            throw new BadRequestException(`The ${upload.side} photo is too large`);
        }
    }
}
