// npm run images:to-storage
// Moves photos that are still stored in the database (product_images.data) to the bucket.
// Safe to run again: only rows without a storage key are touched, and each row is cleared
// only after its bytes are in the bucket. Needs the R2_* variables and the database settings.
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { buildConfig } from '../../config/app-config';
import { validateEnv } from '../../config/env.validation';
import { StorageService } from '../../storage/storage.service';
import dataSource from '../data-source';
import { ProductImageEntity } from '../entities';

const logger = new Logger('MoveImages');

async function run(): Promise<void> {
  const storage = new StorageService(buildConfig(validateEnv(process.env)));
  if (!storage.enabled) throw new Error('Set the R2_* variables first');

  await dataSource.initialize();
  try {
    const images = dataSource.getRepository(ProductImageEntity);
    const rows = await images
      .createQueryBuilder('i')
      .select(['i.id', 'i.contentType', 'i.data'])
      .where('i.storage_key IS NULL AND i.data IS NOT NULL')
      .getMany();
    logger.log(`${rows.length} photos to move`);

    let moved = 0;
    for (const row of rows) {
      const bytes = Buffer.from(row.data ?? '', 'base64');
      const key = `products/${row.id}`;
      await storage.put(key, bytes, row.contentType);
      await images.update(row.id, { storageKey: key, size: bytes.length, data: null });
      moved++;
    }
    logger.log(`Moved ${moved} photos`);
  } finally {
    await dataSource.destroy();
  }
}

run().catch((error: Error) => {
  logger.error(error.message, error.stack);
  process.exit(1);
});
