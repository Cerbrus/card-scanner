import { createReadStream, existsSync } from 'fs';

import { Controller, Get, Header, NotFoundException, Param, ParseIntPipe, Query, StreamableFile } from '@nestjs/common';

import { CardService } from '../../core/services/card.service';

@Controller({ path: 'photos', version: '1' })
export class PhotoController {
    constructor(private readonly cards: CardService) {
    }

    @Get(':id')
    @Header('Cache-Control', 'private, max-age=604800')
    public async get(@Param('id', ParseIntPipe) id: number, @Query('thumb') thumb?: string): Promise<StreamableFile> {
        const path = await this.cards.photoPath(id, thumb !== undefined);
        if (!existsSync(path)) {
            throw new NotFoundException('The photo file is gone');
        }

        return new StreamableFile(createReadStream(path), { type: 'image/jpeg' });
    }
}
