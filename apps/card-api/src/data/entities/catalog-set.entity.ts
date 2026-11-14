import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('catalog_set')
export class CatalogSetEntity {
    @PrimaryColumn({ type: 'varchar' })
    public id: string;

    @Column({ type: 'varchar' })
    public name: string;

    @Column({ type: 'integer' })
    public officialCount: number;

    @Column({ type: 'integer' })
    public totalCount: number;

    @Column({ type: 'varchar', nullable: true })
    public logo?: string | null;

    @Column({ type: 'varchar', nullable: true })
    public symbol?: string | null;
}
