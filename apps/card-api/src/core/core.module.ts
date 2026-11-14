import { Module } from '@nestjs/common';

import { CardReader } from './connectors/card.reader';
import { CatalogSource } from './connectors/catalog.source';
import { GoogleClient } from './connectors/google.client';
import { CardService } from './services/card.service';
import { CatalogService } from './services/catalog.service';
import { ChangesService } from './services/changes.service';
import { ContentPolicyService } from './services/content-policy.service';
import { JobsService } from './services/jobs.service';
import { LogService } from './services/log.service';
import { PriceService } from './services/price.service';
import { SessionService } from './services/session.service';
import { SettingService } from './services/setting.service';
import { SyncService } from './services/sync.service';
import { DataModule } from '../data/data.module';

const services = [
    CardService,
    CatalogService,
    ChangesService,
    ContentPolicyService,
    JobsService,
    LogService,
    PriceService,
    SessionService,
    SettingService,
    SyncService
];
const connectors = [CardReader, CatalogSource, GoogleClient];

@Module({
    imports: [DataModule],
    providers: [...connectors, ...services],
    exports: [...connectors, ...services]
})
export class CoreModule {
}
