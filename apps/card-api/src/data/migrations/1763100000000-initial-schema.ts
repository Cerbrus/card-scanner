import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1763100000000 implements MigrationInterface {
    public name = 'InitialSchema1763100000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await this.createCatalog(queryRunner);
        await this.createCollection(queryRunner);
        await queryRunner.query(`
            CREATE TABLE "setting" (
                "key" varchar PRIMARY KEY NOT NULL,
                "value" text NOT NULL
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_catalog_card_local_id" ON "catalog_card" ("local_id")`);
        await queryRunner.query(`CREATE INDEX "idx_catalog_card_name" ON "catalog_card" ("name" COLLATE NOCASE)`);
        await queryRunner.query(`CREATE INDEX "idx_photo_owned_card" ON "photo" ("owned_card_id")`);
        await queryRunner.query(`CREATE INDEX "idx_owned_card_status" ON "owned_card" ("status")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "setting"`);
        await queryRunner.query(`DROP TABLE "price_snapshot"`);
        await queryRunner.query(`DROP TABLE "photo"`);
        await queryRunner.query(`DROP TABLE "owned_card"`);
        await queryRunner.query(`DROP TABLE "catalog_card"`);
        await queryRunner.query(`DROP TABLE "catalog_set"`);
    }

    private async createCatalog(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "catalog_set" (
                "id" varchar PRIMARY KEY NOT NULL,
                "name" varchar NOT NULL,
                "official_count" integer NOT NULL,
                "total_count" integer NOT NULL,
                "logo" varchar,
                "symbol" varchar
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "catalog_card" (
                "id" varchar PRIMARY KEY NOT NULL,
                "set_id" varchar NOT NULL,
                "local_id" varchar NOT NULL,
                "name" varchar NOT NULL,
                "image" varchar,
                "rarity" varchar,
                "pricing" text,
                "details_fetched_at" datetime
            )
        `);
    }

    private async createCollection(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "owned_card" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "catalog_card_id" varchar,
                "status" varchar NOT NULL,
                "reading_state" varchar NOT NULL,
                "reading_error" text,
                "reading" text,
                "candidates" text,
                "language" varchar,
                "variant" varchar,
                "first_edition" boolean NOT NULL DEFAULT (0),
                "condition" varchar,
                "condition_source" varchar,
                "condition_notes" text,
                "notes" text NOT NULL DEFAULT (''),
                "price_trend" real,
                "price_avg30" real,
                "price_low" real,
                "price_product_id" integer,
                "price_checked_at" datetime,
                "created_at" datetime NOT NULL,
                "updated_at" datetime NOT NULL
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "photo" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "owned_card_id" integer NOT NULL,
                "side" varchar NOT NULL,
                "file" varchar NOT NULL,
                "thumb_file" varchar NOT NULL,
                "bytes" integer NOT NULL,
                "drive_file_id" varchar,
                "synced_at" datetime,
                CONSTRAINT "fk_photo_owned_card" FOREIGN KEY ("owned_card_id") REFERENCES "owned_card" ("id") ON DELETE CASCADE
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "price_snapshot" (
                "owned_card_id" integer NOT NULL,
                "day" varchar NOT NULL,
                "trend" real,
                "avg30" real,
                "low" real,
                PRIMARY KEY ("owned_card_id", "day"),
                CONSTRAINT "fk_price_snapshot_owned_card" FOREIGN KEY ("owned_card_id") REFERENCES "owned_card" ("id") ON DELETE CASCADE
            )
        `);
    }
}
