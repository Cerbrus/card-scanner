import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';

import { Candidate, CatalogCardEntity, CatalogSetEntity, LearnedNameEntity } from '../../data/entities';
import { CatalogSource } from '../connectors/catalog.source';
import { MatchQuery, MatchSet, localIdForms, normalizeText, rankMatches, setIdOf } from '../rules/matching';
import { readPricing } from '../rules/pricing';
import { SettingService } from './setting.service';

export interface CatalogState {
    sets: number;
    cards: number;
    refreshedAt?: string;
    refreshing: boolean;
    error?: string;
}

const REFRESHED_AT = 'catalog.refreshedAt';
const CHUNK_SIZE = 400;
const POOL_LIMIT = 600;
const CANDIDATE_LIMIT = 8;
const DETAILS_MAX_AGE_MILLISECONDS = 20 * 60 * 60 * 1000;

@Injectable()
export class CatalogService {
    private readonly logger = new Logger('Catalog');
    private refreshing?: Promise<void>;
    private lastError?: string;

    constructor(
        @InjectRepository(CatalogSetEntity) private readonly sets: Repository<CatalogSetEntity>,
        @InjectRepository(CatalogCardEntity) private readonly cards: Repository<CatalogCardEntity>,
        @InjectRepository(LearnedNameEntity) private readonly learned: Repository<LearnedNameEntity>,
        private readonly source: CatalogSource,
        private readonly settings: SettingService
    ) {
    }

    public async state(): Promise<CatalogState> {
        return {
            sets: await this.sets.count(),
            cards: await this.cards.count(),
            refreshedAt: await this.settings.get(REFRESHED_AT),
            refreshing: this.refreshing !== undefined,
            error: this.lastError
        };
    }

    public refresh(): Promise<void> {
        this.refreshing ??= this.load()
            .then(() => {
                this.lastError = undefined;
            })
            .catch((error: unknown) => {
                this.lastError = String(error);
                this.logger.warn(`refresh failed: ${error}`);
            })
            .finally(() => {
                this.refreshing = undefined;
            });

        return this.refreshing;
    }

    public async learnName(read: string | null | undefined, name: string): Promise<void> {
        const key = normalizeText(read);
        if (!key || key === normalizeText(name) || (await this.cards.existsBy({ name: Like((read ?? '').trim().replace(/[%_]/g, '')) }))) {
            return;
        }

        await this.learned.save({ read: key, name, learnedAt: new Date() });
    }

    public async search(read: MatchQuery, limit = CANDIDATE_LIMIT): Promise<Array<Candidate>> {
        const key = normalizeText(read.name);
        const known = key ? await this.learned.findOneBy({ read: key }) : null;
        const query = known ? { ...read, name: known.name } : read;
        const pool = await this.pool(query);
        const sets = new Map<string, MatchSet>((await this.sets.find()).map((set) => [set.id, set]));

        return rankMatches(query, pool, sets, limit).map(({ card, set, score }) => ({
            catalogCardId: card.id,
            name: card.name,
            localId: card.localId,
            setId: card.setId,
            setName: set?.name ?? card.setId,
            image: card.image ?? undefined,
            score
        }));
    }

    public async byIds(ids: Array<string>): Promise<Map<string, CatalogCardEntity>> {
        const found = ids.length ? await this.cards.findBy({ id: In(Array.from(new Set(ids))) }) : [];

        return new Map(found.map((card) => [card.id, card]));
    }

    public async setsById(): Promise<Map<string, CatalogSetEntity>> {
        return new Map((await this.sets.find()).map((set) => [set.id, set]));
    }

    public async withDetails(id: string, now = new Date()): Promise<CatalogCardEntity | undefined> {
        const card = await this.cards.findOneBy({ id });
        if (!card) {
            return undefined;
        }
        if (card.detailsFetchedAt && now.getTime() - card.detailsFetchedAt.getTime() < DETAILS_MAX_AGE_MILLISECONDS) {
            return card;
        }

        try {
            const details = await this.source.card(id);
            card.rarity = details.rarity ?? card.rarity;
            card.pricing = readPricing(details);
            card.detailsFetchedAt = now;

            return await this.cards.save(card);
        } catch (error) {
            this.logger.warn(`details of ${id} could not be fetched: ${error}`);

            return card;
        }
    }

    private async pool(query: MatchQuery): Promise<Array<CatalogCardEntity>> {
        const forms = localIdForms(query.number);
        const name = (query.name ?? '').trim();
        const byNumber = forms.length ? await this.cards.find({ where: { localId: In(forms) }, take: POOL_LIMIT }) : [];
        const byName = name ? await this.cards.find({ where: { name: Like(`%${name.replace(/[%_]/g, '')}%`) }, take: POOL_LIMIT }) : [];

        return Array.from(new Map([...byNumber, ...byName].map((card) => [card.id, card])).values());
    }

    private async load(): Promise<void> {
        const [sets, cards] = await Promise.all([this.source.sets(), this.source.cards()]);
        const setRows = sets.map((set) => ({
            id: set.id,
            name: set.name,
            officialCount: set.cardCount?.official ?? 0,
            totalCount: set.cardCount?.total ?? 0,
            logo: set.logo ?? null,
            symbol: set.symbol ?? null
        }));
        const cardRows = cards.map((card) => ({
            id: card.id,
            setId: setIdOf(card.id, card.localId),
            localId: card.localId,
            name: card.name,
            image: card.image ?? null
        }));

        for (let start = 0; start < setRows.length; start += CHUNK_SIZE) {
            await this.sets.upsert(setRows.slice(start, start + CHUNK_SIZE), ['id']);
        }
        for (let start = 0; start < cardRows.length; start += CHUNK_SIZE) {
            await this.cards.upsert(cardRows.slice(start, start + CHUNK_SIZE), ['id']);
        }

        await this.settings.set(REFRESHED_AT, new Date().toISOString());
        this.logger.log(`catalogue refreshed: ${setRows.length} sets, ${cardRows.length} cards`);
    }
}
