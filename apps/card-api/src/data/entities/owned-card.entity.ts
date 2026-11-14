import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { Candidate, CardReading, CardStatus, Condition, ConditionSource, Finish, Language, ReadingState } from './types';

@Entity('owned_card')
export class OwnedCardEntity {
    @PrimaryGeneratedColumn()
    public id: number;

    @Column({ type: 'varchar', nullable: true })
    public catalogCardId?: string | null;

    @Column({ type: 'varchar' })
    public status: CardStatus;

    @Column({ type: 'varchar' })
    public readingState: ReadingState;

    @Column({ type: 'text', nullable: true })
    public readingError?: string | null;

    @Column({ type: 'simple-json', nullable: true })
    public reading?: CardReading | null;

    @Column({ type: 'simple-json', nullable: true })
    public candidates?: Array<Candidate> | null;

    @Column({ type: 'varchar', nullable: true })
    public language?: Language | null;

    @Column({ type: 'varchar', nullable: true })
    public variant?: Finish | null;

    @Column({ type: 'boolean', default: false })
    public firstEdition: boolean;

    @Column({ type: 'varchar', nullable: true })
    public condition?: Condition | null;

    @Column({ type: 'varchar', nullable: true })
    public conditionSource?: ConditionSource | null;

    @Column({ type: 'text', nullable: true })
    public conditionNotes?: string | null;

    @Column({ type: 'text', default: '' })
    public notes: string;

    @Column({ type: 'real', nullable: true })
    public priceTrend?: number | null;

    @Column({ type: 'real', nullable: true })
    public priceAvg30?: number | null;

    @Column({ type: 'real', nullable: true })
    public priceLow?: number | null;

    @Column({ type: 'integer', nullable: true })
    public priceProductId?: number | null;

    @Column({ type: 'datetime', nullable: true })
    public priceCheckedAt?: Date | null;

    @Column({ type: 'real', nullable: true })
    public ownPrice?: number | null;

    @Column({ type: 'datetime', nullable: true })
    public ownPriceAt?: Date | null;

    @Column({ type: 'datetime' })
    public createdAt: Date;

    @Column({ type: 'datetime' })
    public updatedAt: Date;
}
