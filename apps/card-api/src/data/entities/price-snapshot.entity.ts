import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('price_snapshot')
export class PriceSnapshotEntity {
    @PrimaryColumn({ type: 'integer' })
    public ownedCardId: number;

    @PrimaryColumn({ type: 'varchar' })
    public day: string;

    @Column({ type: 'real', nullable: true })
    public trend?: number | null;

    @Column({ type: 'real', nullable: true })
    public avg30?: number | null;

    @Column({ type: 'real', nullable: true })
    public low?: number | null;
}
