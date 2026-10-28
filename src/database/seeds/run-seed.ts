// npm run seed
// 1. Inserts the starting products (existing ids are left untouched).
// 2. Creates the first admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD, only if no admin exists yet.
//    Remove those two variables from .env once the admin can sign in.
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { PasswordService } from '../../auth/services/password.service';
import { PASSWORD_MIN_LENGTH } from '../../auth/password-policy';
import dataSource from '../data-source';
import { AdminRole, AdminUserEntity, ProductEntity } from '../entities';
import { SEED_PRODUCTS } from './products.seed';

const logger = new Logger('Seed');

async function seed(): Promise<void> {
  await dataSource.initialize();
  try {
    const result = await dataSource
      .createQueryBuilder()
      .insert()
      .into(ProductEntity)
      .values(
        SEED_PRODUCTS.map((p) => ({
          ...p,
          fits: p.fits as ProductEntity['fits'],
          oldPrice: p.oldPrice ?? null,
          featured: p.featured ?? false,
        })),
      )
      .orIgnore()
      // Only rows actually inserted come back, so skipped ids are not counted.
      .returning(['id'])
      .execute();
    logger.log(`Seeded ${(result.raw as unknown[]).length} of ${SEED_PRODUCTS.length} products`);

    const users = dataSource.getRepository(AdminUserEntity);
    if ((await users.count()) > 0) {
      logger.log('Admin users already exist; first admin not created');
      return;
    }
    const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!email || !password) {
      logger.warn('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create the first admin');
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      throw new Error(`SEED_ADMIN_PASSWORD must be at least ${PASSWORD_MIN_LENGTH} characters`);
    }
    await users.save(
      users.create({
        email,
        name: process.env.SEED_ADMIN_NAME?.trim() || 'Shop Admin',
        role: AdminRole.ADMIN,
        passwordHash: await new PasswordService().hash(password),
        passwordChangedAt: new Date(),
      }),
    );
    logger.log(`Created first admin ${email}`);
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((error: Error) => {
  logger.error(error.message, error.stack);
  process.exit(1);
});
