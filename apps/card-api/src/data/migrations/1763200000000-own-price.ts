import { MigrationInterface, QueryRunner } from 'typeorm';

export class OwnPrice1763200000000 implements MigrationInterface {
    public name = 'OwnPrice1763200000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "owned_card" ADD COLUMN "own_price" real`);
        await queryRunner.query(`ALTER TABLE "owned_card" ADD COLUMN "own_price_at" datetime`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "owned_card" DROP COLUMN "own_price_at"`);
        await queryRunner.query(`ALTER TABLE "owned_card" DROP COLUMN "own_price"`);
    }
}
