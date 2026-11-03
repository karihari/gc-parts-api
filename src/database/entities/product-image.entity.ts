import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

// Photos uploaded from the admin panel, served at GET /images/:id.
@Entity('product_images')
export class ProductImageEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ name: 'content_type', type: 'text' })
  contentType: string;

  // Base64 of the image bytes, for photos stored in the database (older uploads, or when no
  // object storage is configured). Empty once the photo lives in the bucket.
  @Column({ type: 'text', nullable: true })
  data: string | null;

  // Object key in the bucket ("products/<id>"); null while the bytes are in `data`.
  @Column({ name: 'storage_key', type: 'text', nullable: true })
  storageKey: string | null;

  @Column({ type: 'integer', nullable: true })
  size: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
