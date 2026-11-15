import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { PhotoSide } from './types';

@Entity('photo')
export class PhotoEntity {
    @PrimaryGeneratedColumn()
    public id: number;

    @Column({ type: 'integer' })
    public ownedCardId: number;

    @Column({ type: 'varchar' })
    public side: PhotoSide;

    @Column({ type: 'varchar' })
    public file: string;

    @Column({ type: 'varchar' })
    public thumbFile: string;

    @Column({ type: 'integer' })
    public bytes: number;

    @Column({ type: 'varchar', nullable: true })
    public driveFileId?: string | null;

    @Column({ type: 'datetime', nullable: true })
    public syncedAt?: Date | null;

    @Column({ type: 'varchar', nullable: true })
    public sourceFile?: string | null;

    @Column({ type: 'varchar', nullable: true })
    public sourceDriveFileId?: string | null;
}
