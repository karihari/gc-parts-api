import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

// Photos uploaded from the admin panel, served at GET /images/:id.
@Entity('product_images')
export class ProductImageEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ name: 'content_type', type: 'text' })
  contentType: string;

  // Base64 of the image bytes; kept as text for compatibility with the existing table.
  @Column({ type: 'text' })
  data: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
