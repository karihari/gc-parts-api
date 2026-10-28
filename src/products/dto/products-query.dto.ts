import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Generation } from '../../database/entities';
import { CATEGORY_SLUGS, MAX_YEAR, MIN_YEAR } from '../catalog.constants';

export enum ProductSort {
  RELEVANCE = 'relevance',
  NEWEST = 'newest',
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
  RATING = 'rating',
  NAME = 'name',
}

const toBool = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : value === true || value === 'true' || value === '1';

export class ProductsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search in name, brand and part number' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ enum: CATEGORY_SLUGS })
  @IsIn(CATEGORY_SLUGS)
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ enum: Generation, description: 'Only parts that fit this generation' })
  @IsEnum(Generation)
  @IsOptional()
  gen?: Generation;

  @ApiPropertyOptional({ description: 'Only parts that fit this model year' })
  @Type(() => Number)
  @IsInt()
  @Min(MIN_YEAR)
  @Max(MAX_YEAR)
  @IsOptional()
  year?: number;

  @ApiPropertyOptional({ example: '3.6L V6', description: 'Only parts that fit this engine' })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  engine?: string;

  @ApiPropertyOptional()
  @Transform(toBool)
  @IsBoolean()
  @IsOptional()
  featured?: boolean;

  @ApiPropertyOptional()
  @Transform(toBool)
  @IsBoolean()
  @IsOptional()
  inStock?: boolean;

  @ApiPropertyOptional({ enum: ProductSort, default: ProductSort.RELEVANCE })
  @IsEnum(ProductSort)
  @IsOptional()
  sort: ProductSort = ProductSort.RELEVANCE;
}

export class AdminProductsQueryDto extends ProductsQueryDto {
  @ApiPropertyOptional({ description: 'Only products with stock at or below this number' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  maxStock?: number;
}
