import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Put,
    UploadedFiles,
    UseInterceptors
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';

import { MAX_PHOTO_BYTES } from '../../core/rules/photo-file';
import { CardDetail, CardService, CardSummary, PhotoUpload } from '../../core/services/card.service';
import { PhotoSide } from '../../data/entities/types';
import { CardChangesDto } from '../dto/card-changes.dto';
import { ConfirmCardDto } from '../dto/confirm-card.dto';
import { ReplacePhotoDto } from '../dto/replace-photo.dto';
import { ScanTextDto } from '../dto/scan-text.dto';

type UploadedPhotos = Partial<Record<string, Array<{ buffer: Buffer }>>>;

const SIDES: Array<PhotoSide> = ['front', 'back'];
const UPLOAD_FIELDS = SIDES.flatMap((side) => [
    { name: side, maxCount: 1 },
    { name: `${side}Thumb`, maxCount: 1 },
    { name: `${side}Source`, maxCount: 1 }
]);
const REPLACE_FIELDS = [
    { name: 'photo', maxCount: 1 },
    { name: 'thumb', maxCount: 1 },
    { name: 'source', maxCount: 1 }
];

@Controller({ path: 'cards', version: '1' })
export class CardController {
    constructor(private readonly cards: CardService) {
    }

    @Get()
    public list(): Promise<Array<CardSummary>> {
        return this.cards.list();
    }

    @Post()
    @UseInterceptors(FileFieldsInterceptor(UPLOAD_FIELDS, { limits: { fileSize: MAX_PHOTO_BYTES } }))
    public create(@UploadedFiles() files: UploadedPhotos = {}, @Body() text: ScanTextDto = {}): Promise<CardSummary> {
        const uploads = SIDES.map((side): PhotoUpload => {
            const photo = files[side]?.[0]?.buffer;
            const thumb = files[`${side}Thumb`]?.[0]?.buffer;
            if (!photo || !thumb) {
                throw new BadRequestException(`Missing photo: ${side}`);
            }

            return { side, photo, thumb, source: files[`${side}Source`]?.[0]?.buffer };
        });

        return this.cards.create(uploads, text);
    }

    @Put(':id/photos/:side')
    @UseInterceptors(FileFieldsInterceptor(REPLACE_FIELDS, { limits: { fileSize: MAX_PHOTO_BYTES } }))
    public replacePhoto(
        @Param('id', ParseIntPipe) id: number,
        @Param('side') side: string,
        @UploadedFiles() files: UploadedPhotos = {},
        @Body() options: ReplacePhotoDto = {}
    ): Promise<CardDetail> {
        const photo = files['photo']?.[0]?.buffer;
        const thumb = files['thumb']?.[0]?.buffer;
        if (!SIDES.includes(side as PhotoSide)) {
            throw new BadRequestException(`Unknown side: ${side}`);
        }
        if (!photo || !thumb) {
            throw new BadRequestException('Send the photo and its thumbnail');
        }

        return this.cards.replacePhoto(id, { side: side as PhotoSide, photo, thumb, source: files['source']?.[0]?.buffer, keepSource: options.keepSource === 'yes' });
    }

    @Get(':id')
    public get(@Param('id', ParseIntPipe) id: number): Promise<CardDetail> {
        return this.cards.get(id);
    }

    @Patch(':id')
    public update(@Param('id', ParseIntPipe) id: number, @Body() changes: CardChangesDto): Promise<CardDetail> {
        return this.cards.update(id, changes);
    }

    @Post(':id/confirm')
    @HttpCode(200)
    public confirm(@Param('id', ParseIntPipe) id: number, @Body() body: ConfirmCardDto): Promise<CardDetail> {
        return this.cards.confirm(id, body.catalogCardId);
    }

    @Post(':id/read')
    @HttpCode(200)
    public read(@Param('id', ParseIntPipe) id: number): Promise<CardDetail> {
        return this.cards.read(id);
    }

    @Delete(':id')
    @HttpCode(204)
    public remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
        return this.cards.remove(id);
    }
}
