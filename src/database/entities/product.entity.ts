import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { TimestampedEntity } from './base.entity';
import { Generation } from './enums';

export class Fitment {
  @ApiProperty({ enum: Generation })
  gen: Generation;

  @ApiProperty({ example: 2011 })
  from: number;

  @ApiProperty({ example: 2021 })
  to: number;

  // Missing means the part fits every engine of that generation.
  @ApiPropertyOptional({ type: [String], example: ['3.6L V6'] })
  engines?: string[];
}

// Table shared with the original Drizzle schema, so ids stay text ("GC-1001").
@Entity('products')
export class ProductEntity extends TimestampedEntity {
  @ApiProperty({ example: 'GC-1001' })
  @PrimaryColumn({ type: 'text' })
  id: string;

  @ApiProperty()
  @Column({ type: 'text', unique: true })
  slug: string;

  @ApiProperty()
  @Column({ type: 'text' })
  name: string;

  // English name and description; empty means English visitors see the Russian text.
  @ApiProperty()
  @Column({ name: 'name_en', type: 'text', default: '' })
  nameEn: string;

  @ApiProperty({ example: 'brakes' })
  @Index('products_category_idx')
  @Column({ type: 'text' })
  category: string;

  @ApiProperty()
  @Column({ type: 'text' })
  brand: string;

  @ApiProperty()
  @Column({ name: 'part_number', type: 'text' })
  partNumber: string;

  // Whole drams (AMD), the shop's only currency.
  @ApiProperty()
  @Column({ type: 'integer' })
  price: number;

  @ApiPropertyOptional({ nullable: true, type: Number })
  @Column({ name: 'old_price', type: 'integer', nullable: true })
  oldPrice: number | null;

  @ApiProperty()
  @Column({ type: 'integer', default: 0 })
  stock: number;

  @ApiProperty()
  @Column({ type: 'real', default: 0 })
  rating: number;

  @ApiProperty()
  @Column({ type: 'integer', default: 0 })
  reviews: number;

  // A bundled image key of the frontend ("brakes") or a URL ("/images/<id>").
  @ApiProperty()
  @Column({ type: 'text' })
  image: string;

  @ApiProperty()
  @Column({ type: 'text' })
  description: string;

  @ApiProperty()
  @Column({ name: 'description_en', type: 'text', default: '' })
  descriptionEn: string;

  @ApiProperty({ type: [Fitment] })
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  fits: Fitment[];

  @ApiProperty()
  @Column({ type: 'boolean', default: false })
  featured: boolean;
}
