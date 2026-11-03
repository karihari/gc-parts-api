import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, AppConfig, StorageConfig } from '../config/app-config';

export interface StoredFile {
  bytes: Buffer;
  contentType: string;
}

// Object storage for uploaded files: Cloudflare R2 through its S3 API, like LPMS does with
// S3. The API runs in a container, so Worker bindings are not reachable; access keys are.
// Without configuration `enabled` is false and callers keep files in the database.
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly config?: StorageConfig;
  private readonly client?: S3Client;

  constructor(@Inject(APP_CONFIG) appConfig: AppConfig) {
    this.config = appConfig.storage;
    if (this.config) {
      this.client = new S3Client({
        region: 'auto',
        endpoint: this.config.endpoint,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        },
        // Needed by local S3 stand-ins; R2 accepts it too.
        forcePathStyle: true,
      });
      this.logger.log(`Object storage enabled (bucket ${this.config.bucket})`);
    } else {
      this.logger.log('Object storage not configured; uploads stay in the database');
    }
  }

  get enabled(): boolean {
    return Boolean(this.client);
  }

  // Where the bucket is reachable by browsers, if it has a public address.
  publicUrl(key: string): string | undefined {
    return this.config?.publicUrl ? `${this.config.publicUrl}/${key}` : undefined;
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    await this.requireClient().send(
      new PutObjectCommand({
        Bucket: this.config!.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        // Keys are never reused, so browsers and the CDN may keep a file for good.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  }

  // Returns null when the object does not exist.
  async get(key: string): Promise<StoredFile | null> {
    try {
      const res = await this.requireClient().send(
        new GetObjectCommand({ Bucket: this.config!.bucket, Key: key }),
      );
      const bytes = Buffer.from(await res.Body!.transformToByteArray());
      return { bytes, contentType: res.ContentType ?? 'application/octet-stream' };
    } catch (error) {
      if (error instanceof NoSuchKey || (error as { name?: string }).name === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.requireClient().send(
      new DeleteObjectCommand({ Bucket: this.config!.bucket, Key: key }),
    );
  }

  private requireClient(): S3Client {
    if (!this.client) throw new Error('Object storage is not configured');
    return this.client;
  }
}
