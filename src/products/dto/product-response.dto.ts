import { ApiProperty, OmitType } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../common/dto/pagination.dto';
import { ProductEntity } from '../../database/entities';
import { CATEGORIES, GENERATIONS } from '../catalog.constants';

// Same fields as the frontend's Product type.
export class ProductResponseDto extends OmitType(ProductEntity, ['createdAt', 'updatedAt']) {}

export class AdminProductResponseDto extends ProductEntity {}

export class ProductListResponseDto {
  @ApiProperty({ type: [ProductResponseDto] })
  data: ProductResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class AdminProductListResponseDto {
  @ApiProperty({ type: [AdminProductResponseDto] })
  data: AdminProductResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class CatalogResponseDto {
  @ApiProperty({ example: CATEGORIES })
  categories: typeof CATEGORIES;

  @ApiProperty({ example: GENERATIONS })
  generations: typeof GENERATIONS;
}

export function toProductResponse(p: ProductEntity): ProductResponseDto {
  const { createdAt: _c, updatedAt: _u, ...rest } = p;
  return rest;
}
