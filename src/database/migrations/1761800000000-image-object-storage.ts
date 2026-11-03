import { MigrationInterface, QueryRunner } from 'typeorm';

// Photos can now live in an object storage bucket (Cloudflare R2) instead of the database.
export class ImageObjectStorage1761800000000 implements MigrationInterface {
  name = 'ImageObjectStorage1761800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product_images" ALTER COLUMN "data" DROP NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "product_images" ADD COLUMN IF NOT EXISTS "storage_key" text`,
    );
    await queryRunner.query(`ALTER TABLE "product_images" ADD COLUMN IF NOT EXISTS "size" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product_images" DROP COLUMN IF EXISTS "size"`);
    await queryRunner.query(`ALTER TABLE "product_images" DROP COLUMN IF EXISTS "storage_key"`);
    // Rows that only exist in the bucket have no data; they cannot be restored here.
    await queryRunner.query(`DELETE FROM "product_images" WHERE "data" IS NULL`);
    await queryRunner.query(`ALTER TABLE "product_images" ALTER COLUMN "data" SET NOT NULL`);
  }
}
