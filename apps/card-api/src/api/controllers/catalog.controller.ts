import { Controller, Get, Query } from '@nestjs/common';

import { CatalogService } from '../../core/services/catalog.service';
import { Candidate } from '../../data/entities/types';

const SEARCH_LIMIT = 24;
const MAX_QUERY_LENGTH = 80;

@Controller({ path: 'catalog', version: '1' })
export class CatalogController {
    constructor(private readonly catalog: CatalogService) {
    }

    @Get('search')
    public search(@Query('name') name?: string, @Query('number') number?: string): Promise<Array<Candidate>> {
        const query = { name: name?.slice(0, MAX_QUERY_LENGTH), number: number?.slice(0, MAX_QUERY_LENGTH) };
        if (!query.name?.trim() && !query.number?.trim()) {
            return Promise.resolve([]);
        }

        return this.catalog.search(query, SEARCH_LIMIT);
    }
}
