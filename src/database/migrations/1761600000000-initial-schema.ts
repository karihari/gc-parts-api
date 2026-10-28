import { MigrationInterface, QueryRunner } from 'typeorm';

// Works on an empty database and on the database the Drizzle version of the shop
// already created: the three shop tables are created only if missing, and the
// additions (constraints, indexes, admin users, sessions) are applied on top.
export class InitialSchema1761600000000 implements MigrationInterface {
  name = 'InitialSchema1761600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "products" (
        "id" text PRIMARY KEY,
        "slug" text NOT NULL UNIQUE,
        "name" text NOT NULL,
        "category" text NOT NULL,
        "brand" text NOT NULL,
        "part_number" text NOT NULL,
        "price" integer NOT NULL,
        "old_price" integer,
        "stock" integer NOT NULL DEFAULT 0,
        "rating" real NOT NULL DEFAULT 0,
        "reviews" integer NOT NULL DEFAULT 0,
        "image" text NOT NULL,
        "description" text NOT NULL,
        "fits" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "featured" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_images" (
        "id" text PRIMARY KEY,
        "content_type" text NOT NULL,
        "data" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "orders" (
        "id" text PRIMARY KEY,
        "name" text NOT NULL,
        "phone" text NOT NULL,
        "email" text NOT NULL,
        "payment" text NOT NULL,
        "items" jsonb NOT NULL,
        "total" integer NOT NULL,
        "status" text NOT NULL DEFAULT 'New',
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now()`,
    );

    // Last line of defence: stock can never go negative, even if application code has a bug.
    await this.addConstraint(
      queryRunner,
      'products',
      'products_stock_non_negative',
      'CHECK ("stock" >= 0)',
    );
    await this.addConstraint(
      queryRunner,
      'products',
      'products_price_non_negative',
      'CHECK ("price" >= 0)',
    );
    await this.addConstraint(
      queryRunner,
      'orders',
      'orders_status_valid',
      `CHECK ("status" IN ('New', 'Ready for pickup', 'Completed', 'Cancelled'))`,
    );
    await this.addConstraint(
      queryRunner,
      'orders',
      'orders_payment_valid',
      `CHECK ("payment" IN ('card', 'cash'))`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "products_category_idx" ON "products" ("category")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "orders_status_idx" ON "orders" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "orders_created_at_idx" ON "orders" ("created_at" DESC)`,
    );

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "admin_role" AS ENUM ('admin', 'staff');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "session_revoke_reason" AS ENUM (
          'logout', 'rotated', 'reuse_detected', 'password_changed', 'user_disabled', 'logout_all'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" text NOT NULL UNIQUE,
        "name" text NOT NULL,
        "password_hash" text NOT NULL,
        "role" "admin_role" NOT NULL DEFAULT 'staff',
        "is_active" boolean NOT NULL DEFAULT true,
        "failed_login_attempts" integer NOT NULL DEFAULT 0,
        "locked_until" timestamptz,
        "last_login_at" timestamptz,
        "password_changed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "auth_sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "admin_users" ("id") ON DELETE CASCADE,
        "refresh_token_hash" text NOT NULL,
        "previous_refresh_token_hash" text,
        "rotated_at" timestamptz,
        "remember_me" boolean NOT NULL DEFAULT false,
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz,
        "revoked_reason" "session_revoke_reason",
        "user_agent" text,
        "ip" text,
        "last_used_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "auth_sessions_user_id_idx" ON "auth_sessions" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "auth_sessions_expires_at_idx" ON "auth_sessions" ("expires_at")`,
    );
  }

  // Drops only what this migration added; the shop's original tables and data stay.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "auth_sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_users"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "session_revoke_reason"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "admin_role"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "orders_created_at_idx"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "orders_status_idx"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "products_category_idx"`);
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_payment_valid"`,
    );
    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_status_valid"`);
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_price_non_negative"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_stock_non_negative"`,
    );
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "updated_at"`);
  }

  private async addConstraint(
    queryRunner: QueryRunner,
    table: string,
    name: string,
    definition: string,
  ): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "${table}" ADD CONSTRAINT "${name}" ${definition};
      EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  }
}
