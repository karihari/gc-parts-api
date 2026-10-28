import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Generation } from '../../database/entities';
import { BUNDLED_IMAGE_KEYS, CATEGORY_SLUGS, MAX_YEAR, MIN_YEAR } from '../catalog.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

const MAX_PRICE = 100_000_000;

// A bundled image key, an uploaded image path, or an https URL. Blocks javascript:,
// data: and other schemes that would turn the product image into an XSS vector.
const IMAGE_PATTERN = new RegExp(
  `^(${BUNDLED_IMAGE_KEYS.join('|')}|/images/[a-f0-9]{32}|https://[^\\s"'<>]+)$`,
);

export class FitmentDto {
  @ApiProperty({ enum: Generation })
  @IsEnum(Generation)
  gen: Generation;

  @ApiProperty({ minimum: MIN_YEAR, maximum: MAX_YEAR })
  @IsInt()
  @Min(MIN_YEAR)
  @Max(MAX_YEAR)
  from: number;

  @ApiProperty({ minimum: MIN_YEAR, maximum: MAX_YEAR })
  @IsInt()
  @Min(MIN_YEAR)
  @Max(MAX_YEAR)
  to: number;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(60, { each: true })
  @IsOptional()
  engines?: string[];
}

export class ProductRequestDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @ApiProperty({ enum: CATEGORY_SLUGS })
  @IsIn(CATEGORY_SLUGS)
  category: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  brand: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  partNumber: string;

  @ApiProperty({ description: 'Whole drams (AMD)' })
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE)
  price: number;

  @ApiPropertyOptional({ nullable: true, type: Number, description: 'Must be higher than price' })
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE)
  @IsOptional()
  oldPrice?: number | null;

  @ApiProperty()
  @IsInt()
  @Min(0)
  @Max(100_000)
  stock: number;

  @ApiProperty({ example: 'brakes' })
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  @Matches(IMAGE_PATTERN, { message: 'image must be a bundled key, /images/<id> or an https URL' })
  image: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  description: string;

  @ApiProperty({ type: [FitmentDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => FitmentDto)
  fits: FitmentDto[];

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  featured?: boolean;
}
