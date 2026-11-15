import { IsOptional, IsString, MaxLength } from 'class-validator';

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
}
