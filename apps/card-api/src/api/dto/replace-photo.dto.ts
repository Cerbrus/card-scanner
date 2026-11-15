import { IsIn, IsOptional } from 'class-validator';

export class ReplacePhotoDto {
    @IsOptional()
    @IsIn(['yes', 'no'])
    public keepSource?: string;
}
