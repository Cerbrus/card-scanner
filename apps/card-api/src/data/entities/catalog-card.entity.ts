import { Column, Entity, PrimaryColumn } from 'typeorm';

import { CardPricing } from './types';

@Entity('catalog_card')
export class CatalogCardEntity {
    @PrimaryColumn({ type: 'varchar' })
    public id: string;

    @Column({ type: 'varchar' })
    public setId: string;

    @Column({ type: 'varchar' })
    public localId: string;

    @Column({ type: 'varchar' })
    public name: string;

    @Column({ type: 'varchar', nullable: true })
    public image?: string | null;

    @Column({ type: 'varchar', nullable: true })
    public rarity?: string | null;

    @Column({ type: 'simple-json', nullable: true })
    public pricing?: CardPricing | null;

    @Column({ type: 'datetime', nullable: true })
    public detailsFetchedAt?: Date | null;
}
