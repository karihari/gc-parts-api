import {
  Injectable,
  Logger,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { newImageId } from '../../common/helpers/ids';
import { ProductImageEntity } from '../../database/entities';

export const IMAGE_NOT_FOUND = 'IMAGE_NOT_FOUND';
export const IMAGE_TYPE_NOT_ALLOWED = 'IMAGE_TYPE_NOT_ALLOWED';

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
  ) {}

  async save(bytes: Buffer): Promise<{ id: string; url: string }> {
    const contentType = sniffImageType(bytes);
    if (!contentType) throw new UnsupportedMediaTypeException(IMAGE_TYPE_NOT_ALLOWED);

    const id = newImageId();
    await this.images.insert({ id, contentType, data: bytes.toString('base64') });
    this.logger.log(`Image ${id} stored (${contentType}, ${bytes.length} bytes)`);
    // The same "/images/<id>" form the shop already stores on products.
    return { id, url: `/images/${id}` };
  }

  async get(id: string): Promise<{ contentType: string; bytes: Buffer }> {
    const row = await this.images.findOneBy({ id });
    if (!row) throw new NotFoundException(IMAGE_NOT_FOUND);
    return { contentType: row.contentType, bytes: Buffer.from(row.data, 'base64') };
  }
}
