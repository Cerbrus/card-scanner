import { MigrationInterface, QueryRunner } from 'typeorm';

export class LearnedName1763600000000 implements MigrationInterface {
    public name = 'LearnedName1763600000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "learned_name" ("read" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "learned_at" datetime NOT NULL)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "learned_name"`);
    }
}
