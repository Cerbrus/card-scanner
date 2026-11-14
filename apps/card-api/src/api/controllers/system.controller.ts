import { Controller, Get, HttpCode, Post } from '@nestjs/common';

import { AppConfig } from '../../config/app.config';
import { CardService } from '../../core/services/card.service';
import { CatalogService, CatalogState } from '../../core/services/catalog.service';
import { SyncService, SyncState } from '../../core/services/sync.service';
import { OwnerOnly } from '../guards/owner.decorator';

interface SystemState {
    version: string;
    login: boolean;
    vision: { enabled: boolean; model: string };
    catalog: CatalogState;
    sync: SyncState;
}

@Controller({ path: 'system', version: '1' })
export class SystemController {
    constructor(
        private readonly config: AppConfig,
        private readonly catalog: CatalogService,
        private readonly cards: CardService,
        private readonly sync: SyncService
    ) {
    }

    @Get()
    public async state(): Promise<SystemState> {
        return {
            version: this.config.version,
            login: this.config.loginEnabled,
            vision: { enabled: this.config.visionEnabled, model: this.config.visionModel },
            catalog: await this.catalog.state(),
            sync: await this.sync.state()
        };
    }

    @OwnerOnly()
    @Post('catalog/refresh')
    @HttpCode(202)
    public refreshCatalog(): Promise<CatalogState> {
        void this.catalog.refresh();

        return this.catalog.state();
    }

    @OwnerOnly()
    @Post('prices/refresh')
    @HttpCode(200)
    public async refreshPrices(): Promise<{ priced: number }> {
        return { priced: await this.cards.refreshPrices() };
    }
}
