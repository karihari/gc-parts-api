import { MigrationInterface, QueryRunner } from 'typeorm';

// English product texts and the contact-form inbox. Like the first migration it is safe on
// a database the Drizzle version of the shop already extended: everything is "IF NOT EXISTS".
export class BilingualProductsAndEnquiries1761700000000 implements MigrationInterface {
  name = 'BilingualProductsAndEnquiries1761700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "name_en" text NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "description_en" text NOT NULL DEFAULT ''`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "enquiries" (
        "id" text PRIMARY KEY,
        "name" text NOT NULL,
        "phone" text NOT NULL,
        "email" text NOT NULL,
        "part" text NOT NULL DEFAULT '',
        "message" text NOT NULL DEFAULT '',
        "vehicle" text NOT NULL DEFAULT '',
        "status" text NOT NULL DEFAULT 'New',
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `ALTER TABLE "enquiries" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_status_valid"
          CHECK ("status" IN ('New', 'Resolved'));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "enquiries_status_idx" ON "enquiries" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "enquiries_created_at_idx" ON "enquiries" ("created_at" DESC)`,
    );
  }

  // Drops only what this migration added.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "enquiries"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "description_en"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "name_en"`);
  }
}
