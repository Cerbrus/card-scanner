import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CatalogService } from './catalog.service';
import { PriceFigures, PriceSnapshotEntity } from '../../data/entities';
import { PrintChoice, dayOf, hasPrice, pickPrice } from '../rules/pricing';

export interface Quote {
    price?: PriceFigures;
    reachedSource: boolean;
}

@Injectable()
export class PriceService {
    constructor(
        @InjectRepository(PriceSnapshotEntity) private readonly snapshots: Repository<PriceSnapshotEntity>,
        private readonly catalog: CatalogService
    ) {
    }

    public async quote(catalogCardId: string, print: PrintChoice): Promise<Quote> {
        const card = await this.catalog.withDetails(catalogCardId);
        const price = pickPrice(card?.pricing, print);

        return { price: hasPrice(price) ? price : undefined, reachedSource: card?.detailsFetchedAt != null };
    }

    public async record(ownedCardId: number, price: PriceFigures, now = new Date()): Promise<void> {
        await this.snapshots.save({
            ownedCardId,
            day: dayOf(now),
            trend: price.trend ?? null,
            avg30: price.avg30 ?? null,
            low: price.low ?? null
        });
    }

    public history(ownedCardId: number): Promise<Array<PriceSnapshotEntity>> {
        return this.snapshots.find({ where: { ownedCardId }, order: { day: 'ASC' } });
    }

    public all(): Promise<Array<PriceSnapshotEntity>> {
        return this.snapshots.find({ order: { day: 'ASC', ownedCardId: 'ASC' } });
    }
}
