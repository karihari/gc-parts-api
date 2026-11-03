import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  PayloadTooLargeException,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { IsString, Matches } from 'class-validator';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AppController } from '../../common/decorators/app-controller.decorator';
import { AdminRole } from '../../database/entities';
import { ImagesService } from '../services/images.service';

// Photos are resized in the browser first, so 3 MB is plenty.
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_FILE_REQUIRED = 'IMAGE_FILE_REQUIRED';
const IMAGE_TOO_LARGE = 'IMAGE_TOO_LARGE';

class ImageIdParamsDto {
  @ApiProperty()
  @IsString()
  @Matches(/^[a-f0-9]{32}$/)
  id: string;
}

class UploadedImageResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: '/images/3f9a1c0b2e4d4f6a8b0c1d2e3f4a5b6c' })
  url: string;
}

@ApiTags('Images')
@Controller()
export class ImagesController {
  constructor(private readonly images: ImagesService) {}

  @Post('admin/images')
  @AppController({
    title: 'Upload a product photo (JPEG, PNG or WebP, max 3 MB)',
    roles: [AdminRole.ADMIN, AdminRole.STAFF],
    throttle: { limit: 30, ttl: 60_000 },
    response: [ApiCreatedResponse({ type: UploadedImageResponseDto })],
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  async upload(@Req() req: FastifyRequest): Promise<UploadedImageResponseDto> {
    if (!req.isMultipart()) throw new BadRequestException(IMAGE_FILE_REQUIRED);
    const file = await req.file({ limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } });
    if (!file) throw new BadRequestException(IMAGE_FILE_REQUIRED);

    const bytes = await file.toBuffer().catch((error: { code?: string }) => {
      if (error.code === 'FST_REQ_FILE_TOO_LARGE')
        throw new PayloadTooLargeException(IMAGE_TOO_LARGE);
      throw error;
    });
    return this.images.save(bytes);
  }

  @Get('images/:id')
  @SkipThrottle()
  @AppController({
    title: 'Serve an uploaded product photo',
    public: true,
    response: [ApiOkResponse({ description: 'The image bytes' })],
  })
  async serve(@Param() { id }: ImageIdParamsDto, @Res() reply: FastifyReply): Promise<void> {
    const image = await this.images.get(id);
    if ('redirectTo' in image) {
      // The bucket has a public address, so Cloudflare's CDN serves the bytes.
      await reply
        .header('cache-control', 'public, max-age=86400')
        .header('cross-origin-resource-policy', 'cross-origin')
        .redirect(image.redirectTo, 302);
      return;
    }
    reply
      .header('content-type', image.contentType)
      // An id is never reused, so the photo can be cached for good.
      .header('cache-control', 'public, max-age=31536000, immutable')
      // The shop frontend runs on another origin and must be allowed to show it.
      .header('cross-origin-resource-policy', 'cross-origin')
      .send(image.bytes);
  }

  @Delete('admin/images/:id')
  @AppController({
    title: 'Delete an uploaded photo (refused while a product still shows it)',
    roles: [AdminRole.ADMIN, AdminRole.STAFF],
    httpCode: HttpStatus.NO_CONTENT,
    response: [ApiNoContentResponse()],
  })
  async remove(@Param() { id }: ImageIdParamsDto): Promise<void> {
    await this.images.delete(id);
  }
}
