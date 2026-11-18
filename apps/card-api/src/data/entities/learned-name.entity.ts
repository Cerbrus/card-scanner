import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('learned_name')
export class LearnedNameEntity {
    @PrimaryColumn({ type: 'varchar' })
    public read: string;

    @Column({ type: 'varchar' })
    public name: string;

    @Column({ type: 'datetime' })
    public learnedAt: Date;
}
