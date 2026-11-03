import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ProductEntity, ProductImageEntity } from '../../database/entities';
import { StorageService } from '../../storage/storage.service';
import { IMAGE_IN_USE, ImagesService } from './images.service';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function fakeImages() {
  const rows = new Map<string, ProductImageEntity>();
  return {
    rows,
    repo: {
      insert: async (row: ProductImageEntity) => void rows.set(row.id, row),
      findOneBy: async ({ id }: { id: string }) => rows.get(id) ?? null,
      delete: async (id: string) => void rows.delete(id),
    } as unknown as Repository<ProductImageEntity>,
  };
}

function fakeStorage(enabled: boolean, publicBase?: string) {
  const objects = new Map<string, { bytes: Buffer; contentType: string }>();
  return {
    objects,
    storage: {
      enabled,
      publicUrl: (key: string) => (publicBase ? `${publicBase}/${key}` : undefined),
      put: async (key: string, bytes: Buffer, contentType: string) =>
        void objects.set(key, { bytes, contentType }),
      get: async (key: string) => objects.get(key) ?? null,
      delete: async (key: string) => void objects.delete(key),
    } as unknown as StorageService,
  };
}

const products = (inUse = false) =>
  ({
    createQueryBuilder: () => ({
      where() {
        return this;
      },
      getExists: async () => inUse,
    }),
  }) as unknown as Repository<ProductEntity>;

describe('ImagesService', () => {
  it('keeps the photo in the database when no bucket is configured', async () => {
    const db = fakeImages();
    const bucket = fakeStorage(false);
    const service = new ImagesService(db.repo, products(), bucket.storage);

    const { id, url } = await service.save(PNG);
    expect(url).toBe(`/images/${id}`);
    expect(bucket.objects.size).toBe(0);
    expect(db.rows.get(id)).toMatchObject({ storageKey: null, size: PNG.length });
    expect(await service.get(id)).toEqual({ contentType: 'image/png', bytes: PNG });
  });

  it('puts the photo in the bucket and not in the database', async () => {
    const db = fakeImages();
    const bucket = fakeStorage(true);
    const service = new ImagesService(db.repo, products(), bucket.storage);

    const { id } = await service.save(PNG);
    expect(bucket.objects.get(`products/${id}`)).toEqual({ bytes: PNG, contentType: 'image/png' });
    expect(db.rows.get(id)).toMatchObject({ data: null, storageKey: `products/${id}` });
    expect(await service.get(id)).toEqual({ contentType: 'image/png', bytes: PNG });
  });

  it('sends the browser to the public bucket address when there is one', async () => {
    const db = fakeImages();
    const bucket = fakeStorage(true, 'https://media.gcparts.am');
    const service = new ImagesService(db.repo, products(), bucket.storage);

    const { id } = await service.save(PNG);
    expect(await service.get(id)).toEqual({
      redirectTo: `https://media.gcparts.am/products/${id}`,
    });
  });

  it('still serves photos saved in the database before the bucket was set up', async () => {
    const db = fakeImages();
    const old = fakeStorage(false);
    const { id } = await new ImagesService(db.repo, products(), old.storage).save(PNG);

    const now = fakeStorage(true);
    expect(await new ImagesService(db.repo, products(), now.storage).get(id)).toEqual({
      contentType: 'image/png',
      bytes: PNG,
    });
  });

  it('deletes the bucket object and the row, unless a product still shows the photo', async () => {
    const db = fakeImages();
    const bucket = fakeStorage(true);
    const { id } = await new ImagesService(db.repo, products(), bucket.storage).save(PNG);

    await expect(
      new ImagesService(db.repo, products(true), bucket.storage).delete(id),
    ).rejects.toThrow(new ConflictException(IMAGE_IN_USE));
    expect(bucket.objects.size).toBe(1);

    await new ImagesService(db.repo, products(false), bucket.storage).delete(id);
    expect(bucket.objects.size).toBe(0);
    expect(db.rows.size).toBe(0);
    await expect(new ImagesService(db.repo, products(), bucket.storage).delete(id)).rejects.toThrow(
      NotFoundException,
    );
  });
});
