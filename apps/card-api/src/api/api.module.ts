import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthController } from './controllers/auth.controller';
import { CardController } from './controllers/card.controller';
import { CatalogController } from './controllers/catalog.controller';
import { ContentPolicyController } from './controllers/content-policy.controller';
import { ExportController } from './controllers/export.controller';
import { GoogleController } from './controllers/google.controller';
import { HealthController } from './controllers/health.controller';
import { LogController } from './controllers/log.controller';
import { PhotoController } from './controllers/photo.controller';
import { SystemController } from './controllers/system.controller';
import { AuthGuard } from './guards/auth.guard';
import { CoreModule } from '../core/core.module';

@Module({
    imports: [CoreModule],
    controllers: [
        AuthController,
        CardController,
        CatalogController,
        ContentPolicyController,
        ExportController,
        GoogleController,
        HealthController,
        LogController,
        PhotoController,
        SystemController
    ],
    providers: [AuthGuard, { provide: APP_GUARD, useExisting: AuthGuard }]
})
export class ApiModule {
}
