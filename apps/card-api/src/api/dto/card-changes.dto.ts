import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

import { CONDITIONS, Condition, FINISHES, Finish, LANGUAGES, Language } from '../../data/entities/types';

const MAX_NOTES_LENGTH = 2000;

export class CardChangesDto {
    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsIn(LANGUAGES)
    public language?: Language | null;

    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsIn(FINISHES)
    public variant?: Finish | null;

    @IsOptional()
    @IsBoolean()
    public firstEdition?: boolean;

    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsIn(CONDITIONS)
    public condition?: Condition | null;

    @IsOptional()
    @IsString()
    @MaxLength(MAX_NOTES_LENGTH)
    public notes?: string;
}
