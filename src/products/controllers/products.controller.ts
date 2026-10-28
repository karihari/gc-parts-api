import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AppController } from '../../common/decorators/app-controller.decorator';
import { CATEGORIES, GENERATIONS } from '../catalog.constants';
import {
  CatalogResponseDto,
  ProductListResponseDto,
  ProductResponseDto,
  toProductResponse,
} from '../dto/product-response.dto';
import { ProductsQueryDto } from '../dto/products-query.dto';
import { ProductsService } from '../services/products.service';

@ApiTags('Catalog')
@Controller()
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get('catalog')
  @AppController({
    title: 'Categories and Grand Cherokee generations',
    public: true,
    response: [ApiOkResponse({ type: CatalogResponseDto })],
  })
  catalog(): CatalogResponseDto {
    return { categories: CATEGORIES, generations: GENERATIONS };
  }

  @Get('products')
  @AppController({
    title: 'Search products, optionally only those that fit a vehicle',
    public: true,
    response: [ApiOkResponse({ type: ProductListResponseDto })],
  })
  async list(@Query() query: ProductsQueryDto): Promise<ProductListResponseDto> {
    const page = await this.products.list(query);
    return { ...page, data: page.data.map(toProductResponse) };
  }

  @Get('products/:slug')
  @AppController({
    title: 'One product by its URL slug',
    public: true,
    response: [ApiOkResponse({ type: ProductResponseDto }), ApiNotFoundResponse()],
  })
  async getBySlug(@Param('slug') slug: string): Promise<ProductResponseDto> {
    return toProductResponse(await this.products.getBySlug(slug.slice(0, 200)));
  }
}
