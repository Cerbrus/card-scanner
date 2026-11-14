import { IsString, MaxLength, MinLength } from 'class-validator';

const MAX_ID_LENGTH = 80;

export class ConfirmCardDto {
    @IsString()
    @MinLength(1)
    @MaxLength(MAX_ID_LENGTH)
    public catalogCardId: string;
}
