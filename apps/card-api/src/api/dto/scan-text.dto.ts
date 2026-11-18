import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { LANGUAGES, Language } from '../../data/entities/types';

const MAX_TEXT_LENGTH = 60;

export class ScanTextDto {
    @IsOptional()
    @IsString()
    @MaxLength(MAX_TEXT_LENGTH)
    public name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(MAX_TEXT_LENGTH)
    public number?: string;

    @IsOptional()
    @Matches(/^\d{4,10}$/)
    public digits?: string;

    @IsOptional()
    @IsIn(LANGUAGES)
    public language?: Language;
}
