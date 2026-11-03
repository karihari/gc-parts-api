import { MigrationInterface, QueryRunner } from 'typeorm';

// More than one photo per product: `image` stays the cover, `gallery` holds the rest.
export class ProductGallery1761900000000 implements MigrationInterface {
  name = 'ProductGallery1761900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "gallery" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "gallery"`);
  }
}
