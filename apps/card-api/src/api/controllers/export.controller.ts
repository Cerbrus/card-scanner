import { Controller, Get, Header } from '@nestjs/common';

import { AppConfig } from '../../config/app.config';
import { collectionTable, toCsv } from '../../core/rules/collection-table';
import { CardService } from '../../core/services/card.service';

const BYTE_ORDER_MARK = '﻿';

@Controller({ path: 'export', version: '1' })
export class ExportController {
    constructor(
        private readonly cards: CardService,
        private readonly config: AppConfig
    ) {
    }

    @Get('cards.csv')
    @Header('Content-Type', 'text/csv; charset=utf-8')
    @Header('Content-Disposition', 'attachment; filename="pokemon-cards.csv"')
    public async cardsCsv(): Promise<string> {
        const rows = await this.cards.rows((photo) => `${this.config.publicUrl}/api/v1/photos/${photo.id}`);

        return BYTE_ORDER_MARK + toCsv(collectionTable(rows));
    }
}
