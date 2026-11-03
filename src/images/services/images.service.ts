import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { newImageId } from '../../common/helpers/ids';
import { ProductEntity, ProductImageEntity } from '../../database/entities';
import { StorageService } from '../../storage/storage.service';

export const IMAGE_NOT_FOUND = 'IMAGE_NOT_FOUND';
export const IMAGE_TYPE_NOT_ALLOWED = 'IMAGE_TYPE_NOT_ALLOWED';
// A product still shows this photo; change the product first.
export const IMAGE_IN_USE = 'IMAGE_IN_USE';

const keyOf = (id: string) => `products/${id}`;

// The type is decided from the file's first bytes, never from the name or the
// Content-Type the browser sent, so an HTML or SVG file cannot pass as a photo
// and later run as a page on our domain.
function sniffImageType(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name);

  constructor(
    @InjectRepository(ProductImageEntity)
    private readonly images: Repository<ProductImageEntity>,
    @InjectRepository(ProductEntity)
    private readonly products: Repository<ProductEntity>,
    private readonly storage: StorageService,
  ) {}

  async save(bytes: Buffer): Promise<{ id: string; url: string }> {
    const contentType = sniffImageType(bytes);
    if (!contentType) throw new UnsupportedMediaTypeException(IMAGE_TYPE_NOT_ALLOWED);

    const id = newImageId();
    if (this.storage.enabled) {
      // Bucket first: a row must never point at bytes that were not stored.
      await this.storage.put(keyOf(id), bytes, contentType);
      await this.images.insert({
        id,
        contentType,
        data: null,
        storageKey: keyOf(id),
        size: bytes.length,
      });
    } else {
      await this.images.insert({
        id,
        contentType,
        data: bytes.toString('base64'),
        storageKey: null,
        size: bytes.length,
      });
    }
    this.logger.log(
      `Image ${id} stored in ${this.storage.enabled ? 'the bucket' : 'the database'} (${contentType}, ${bytes.length} bytes)`,
    );
    // The same "/images/<id>" form the shop already stores on products.
    return { id, url: `/images/${id}` };
  }

  // Either the bytes, or a public bucket address to send the browser to.
  async get(id: string): Promise<{ contentType: string; bytes: Buffer } | { redirectTo: string }> {
    const row = await this.images.findOneBy({ id });
    if (!row) throw new NotFoundException(IMAGE_NOT_FOUND);

    if (row.storageKey) {
      const publicUrl = this.storage.publicUrl(row.storageKey);
      if (publicUrl) return { redirectTo: publicUrl };
      const file = await this.storage.get(row.storageKey);
      if (!file) throw new NotFoundException(IMAGE_NOT_FOUND);
      return { contentType: row.contentType, bytes: file.bytes };
    }
    return { contentType: row.contentType, bytes: Buffer.from(row.data ?? '', 'base64') };
  }

  async delete(id: string): Promise<void> {
    const row = await this.images.findOneBy({ id });
    if (!row) throw new NotFoundException(IMAGE_NOT_FOUND);
    const url = `/images/${id}`;
    const inUse = await this.products
      .createQueryBuilder('p')
      .where('p.image = :url OR p.gallery @> :gallery::jsonb', {
        url,
        gallery: JSON.stringify([url]),
      })
      .getExists();
    if (inUse) throw new ConflictException(IMAGE_IN_USE);

    if (row.storageKey) await this.storage.delete(row.storageKey);
    await this.images.delete(id);
    this.logger.log(`Image ${id} deleted`);
  }
}
