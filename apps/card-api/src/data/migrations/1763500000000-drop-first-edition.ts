import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropFirstEdition1763500000000 implements MigrationInterface {
    public name = 'DropFirstEdition1763500000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "owned_card" DROP COLUMN "first_edition"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "owned_card" ADD COLUMN "first_edition" boolean NOT NULL DEFAULT (0)`);
    }
}
