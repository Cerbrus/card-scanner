import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

import { CONDITIONS, Condition, FINISHES, Finish, LANGUAGES, Language } from '../../data/entities/types';

const MAX_NOTES_LENGTH = 2000;
const MAX_PRICE = 1000000;

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
    @ValidateIf((_, value) => value !== null)
    @IsIn(CONDITIONS)
    public condition?: Condition | null;

    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(MAX_PRICE)
    public ownPrice?: number | null;

    @IsOptional()
    @IsString()
    @MaxLength(MAX_NOTES_LENGTH)
    public notes?: string;
}
