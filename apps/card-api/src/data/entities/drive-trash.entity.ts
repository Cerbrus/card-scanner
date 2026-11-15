import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('drive_trash')
export class DriveTrashEntity {
    @PrimaryGeneratedColumn()
    public id: number;

    @Column({ type: 'varchar' })
    public driveFileId: string;

    @Column({ type: 'datetime' })
    public createdAt: Date;
}
