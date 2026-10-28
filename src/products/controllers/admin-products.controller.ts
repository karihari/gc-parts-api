import { Body, Controller, Delete, Get, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AppController } from '../../common/decorators/app-controller.decorator';
import { AdminRole } from '../../database/entities';
import { ProductIdParamsDto } from '../dto/product-params.dto';
import { ProductRequestDto } from '../dto/product-request.dto';
import { AdminProductListResponseDto, AdminProductResponseDto } from '../dto/product-response.dto';
import { AdminProductsQueryDto } from '../dto/products-query.dto';
import { ProductsService } from '../services/products.service';

const STAFF = [AdminRole.ADMIN, AdminRole.STAFF];

@ApiTags('Admin / Products')
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @AppController({
    title: 'List products, including low-stock filter',
    roles: STAFF,
    response: [ApiOkResponse({ type: AdminProductListResponseDto })],
  })
  list(@Query() query: AdminProductsQueryDto): Promise<AdminProductListResponseDto> {
    return this.products.list(query);
  }

  @Get(':id')
  @AppController({
    title: 'One product by id',
    roles: STAFF,
    response: [ApiOkResponse({ type: AdminProductResponseDto })],
  })
  get(@Param() { id }: ProductIdParamsDto): Promise<AdminProductResponseDto> {
    return this.products.getById(id);
  }

  @Post()
  @AppController({
    title: 'Create a product',
    roles: STAFF,
    response: [ApiCreatedResponse({ type: AdminProductResponseDto })],
  })
  create(@Body() body: ProductRequestDto): Promise<AdminProductResponseDto> {
    return this.products.create(body);
  }

  @Put(':id')
  @AppController({
    title: 'Replace a product (the admin form always sends every field)',
    roles: STAFF,
    response: [ApiOkResponse({ type: AdminProductResponseDto })],
  })
  update(
    @Param() { id }: ProductIdParamsDto,
    @Body() body: ProductRequestDto,
  ): Promise<AdminProductResponseDto> {
    return this.products.update(id, body);
  }

  @Delete(':id')
  @AppController({
    title: 'Delete a product',
    roles: STAFF,
    httpCode: HttpStatus.NO_CONTENT,
    response: [ApiNoContentResponse()],
  })
  async delete(@Param() { id }: ProductIdParamsDto): Promise<void> {
    await this.products.delete(id);
  }
}
