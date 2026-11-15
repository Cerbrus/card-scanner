import { MigrationInterface, QueryRunner } from 'typeorm';

export class PhotoSource1763400000000 implements MigrationInterface {
    public name = 'PhotoSource1763400000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "photo" ADD COLUMN "source_file" varchar`);
        await queryRunner.query(`ALTER TABLE "photo" ADD COLUMN "source_drive_file_id" varchar`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "photo" DROP COLUMN "source_drive_file_id"`);
        await queryRunner.query(`ALTER TABLE "photo" DROP COLUMN "source_file"`);
    }
}
