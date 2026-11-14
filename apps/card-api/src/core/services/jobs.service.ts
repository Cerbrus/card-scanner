import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Subscription, debounceTime, tap } from 'rxjs';

import { CardService } from './card.service';
import { CatalogService } from './catalog.service';
import { ChangesService } from './changes.service';
import { SyncService } from './sync.service';
import { AppConfig } from '../../config/app.config';

const HOUR = 60 * 60 * 1000;
const CATALOG_MAX_AGE_MILLISECONDS = 7 * 24 * HOUR;
const CATALOG_CHECK_MILLISECONDS = 6 * HOUR;
const PRICES_EVERY_MILLISECONDS = 24 * HOUR;
const PRICES_FIRST_AFTER_MILLISECONDS = 2 * 60 * 1000;
const BACKUP_EVERY_MILLISECONDS = 24 * HOUR;
const SYNC_AFTER_CHANGE_MILLISECONDS = 20000;

@Injectable()
export class JobsService implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly logger = new Logger('Jobs');
    private readonly timers: Array<NodeJS.Timeout> = [];
    private subscription?: Subscription;

    constructor(
        private readonly config: AppConfig,
        private readonly catalog: CatalogService,
        private readonly cards: CardService,
        private readonly sync: SyncService,
        private readonly changes: ChangesService
    ) {
    }

    public onApplicationBootstrap(): void {
        if (!this.config.backgroundJobs) {
            return;
        }

        void this.refreshCatalogWhenOld();
        this.timers.push(
            setInterval(() => void this.refreshCatalogWhenOld(), CATALOG_CHECK_MILLISECONDS),
            setTimeout(() => void this.refreshPrices(), PRICES_FIRST_AFTER_MILLISECONDS),
            setInterval(() => void this.refreshPrices(), PRICES_EVERY_MILLISECONDS),
            setInterval(() => void this.sync.run(true), BACKUP_EVERY_MILLISECONDS)
        );
        this.timers.forEach((timer) => timer.unref());
        this.subscription = this.changes.changed$
            .pipe(
                debounceTime(SYNC_AFTER_CHANGE_MILLISECONDS),
                tap(() => void this.sync.run())
            )
            .subscribe();
    }

    public onModuleDestroy(): void {
        this.timers.forEach((timer) => clearTimeout(timer));
        this.subscription?.unsubscribe();
    }

    private async refreshCatalogWhenOld(): Promise<void> {
        const state = await this.catalog.state();
        const age = state.refreshedAt ? Date.now() - new Date(state.refreshedAt).getTime() : Infinity;
        if (!state.cards || age > CATALOG_MAX_AGE_MILLISECONDS) {
            await this.catalog.refresh();
        }
    }

    private async refreshPrices(): Promise<void> {
        try {
            this.logger.log(`prices refreshed: ${await this.cards.refreshPrices()} card(s) with a price`);
        } catch (error) {
            this.logger.warn(`prices could not be refreshed: ${error}`);
        }
    }
}
