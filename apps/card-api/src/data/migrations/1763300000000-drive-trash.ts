import { MigrationInterface, QueryRunner } from 'typeorm';

export class DriveTrash1763300000000 implements MigrationInterface {
    public name = 'DriveTrash1763300000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "drive_trash" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "drive_file_id" varchar NOT NULL, "created_at" datetime NOT NULL)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "drive_trash"`);
    }
}
