import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository, SelectQueryBuilder } from 'typeorm';
import { paginate, Paginated } from '../../common/dto/pagination.dto';
import { newProductId, slugify } from '../../common/helpers/ids';
import { Fitment, ProductEntity } from '../../database/entities';
import { ProductRequestDto } from '../dto/product-request.dto';
import { AdminProductsQueryDto, ProductSort, ProductsQueryDto } from '../dto/products-query.dto';
import {
  PRODUCT_FITMENT_YEARS_REVERSED,
  PRODUCT_NOT_FOUND,
  PRODUCT_OLD_PRICE_NOT_HIGHER,
  PRODUCT_SLUG_CONFLICT,
} from '../errors';

const SLUG_RETRIES = 3;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(ProductEntity)
    private readonly products: Repository<ProductEntity>,
  ) {}

  async list(query: ProductsQueryDto | AdminProductsQueryDto): Promise<Paginated<ProductEntity>> {
    const qb = this.products.createQueryBuilder('p');
    this.applyFilters(qb, query);
    this.applySort(qb, query.sort);
    const [rows, total] = await qb
      .skip((query.page - 1) * query.perPage)
      .take(query.perPage)
      .getManyAndCount();
    return paginate(rows, total, query);
  }

  async getBySlug(slug: string): Promise<ProductEntity> {
    const product = await this.products.findOneBy({ slug });
    if (!product) throw new NotFoundException(PRODUCT_NOT_FOUND);
    return product;
  }

  async getById(id: string): Promise<ProductEntity> {
    const product = await this.products.findOneBy({ id });
    if (!product) throw new NotFoundException(PRODUCT_NOT_FOUND);
    return product;
  }

  async create(dto: ProductRequestDto): Promise<ProductEntity> {
    this.assertConsistent(dto);
    const id = newProductId();
    await this.withUniqueSlug(dto.name, id, (slug) =>
      this.products.insert({ ...this.toColumns(dto), id, slug }),
    );
    this.logger.log(`Product ${id} created`);
    return this.getById(id);
  }

  async update(id: string, dto: ProductRequestDto): Promise<ProductEntity> {
    this.assertConsistent(dto);
    await this.getById(id);
    await this.withUniqueSlug(dto.name, id, (slug) =>
      this.products.update(id, { ...this.toColumns(dto), slug }),
    );
    this.logger.log(`Product ${id} updated`);
    return this.getById(id);
  }

  // Past orders keep their own copy of name and price, so deleting a product is safe.
  async delete(id: string): Promise<void> {
    const result = await this.products.delete(id);
    if (!result.affected) throw new NotFoundException(PRODUCT_NOT_FOUND);
    this.logger.log(`Product ${id} deleted`);
  }

  private applyFilters(
    qb: SelectQueryBuilder<ProductEntity>,
    query: ProductsQueryDto | AdminProductsQueryDto,
  ): void {
    if (query.q) {
      qb.andWhere('(p.name ILIKE :q OR p.brand ILIKE :q OR p.partNumber ILIKE :q)', {
        q: `%${escapeLike(query.q)}%`,
      });
    }
    if (query.category) qb.andWhere('p.category = :category', { category: query.category });
    if (query.featured !== undefined)
      qb.andWhere('p.featured = :featured', { featured: query.featured });
    if (query.inStock) qb.andWhere('p.stock > 0');
    if ('maxStock' in query && query.maxStock !== undefined) {
      qb.andWhere('p.stock <= :maxStock', { maxStock: query.maxStock });
    }

    // Same rule as checkFit() in the frontend: one fitment entry must match the
    // generation, contain the year, and either list the engine or list no engines.
    if (query.gen || query.year || query.engine) {
      const conditions: string[] = [];
      if (query.gen) conditions.push(`f->>'gen' = :gen`);
      if (query.year) {
        conditions.push(`(f->>'from')::int <= :year AND (f->>'to')::int >= :year`);
      }
      if (query.engine) {
        conditions.push(`(NOT (f ? 'engines') OR jsonb_exists(f->'engines', :engine))`);
      }
      qb.andWhere(
        `EXISTS (SELECT 1 FROM jsonb_array_elements(p.fits) AS f WHERE ${conditions.join(' AND ')})`,
        { gen: query.gen, year: query.year, engine: query.engine },
      );
    }
  }

  private applySort(qb: SelectQueryBuilder<ProductEntity>, sort: ProductSort): void {
    switch (sort) {
      case ProductSort.NEWEST:
        qb.orderBy('p.createdAt', 'DESC');
        break;
      case ProductSort.PRICE_ASC:
        qb.orderBy('p.price', 'ASC');
        break;
      case ProductSort.PRICE_DESC:
        qb.orderBy('p.price', 'DESC');
        break;
      case ProductSort.RATING:
        qb.orderBy('p.rating', 'DESC').addOrderBy('p.reviews', 'DESC');
        break;
      case ProductSort.NAME:
        qb.orderBy('p.name', 'ASC');
        break;
      default:
        qb.orderBy('p.featured', 'DESC');
    }
    // A unique tie-breaker keeps pages stable, so no product shows up on two pages.
    qb.addOrderBy('p.id', 'ASC');
  }

  private assertConsistent(dto: ProductRequestDto): void {
    if (dto.oldPrice != null && dto.oldPrice <= dto.price) {
      throw new BadRequestException(PRODUCT_OLD_PRICE_NOT_HIGHER);
    }
    if (dto.fits.some((f) => f.from > f.to)) {
      throw new BadRequestException(PRODUCT_FITMENT_YEARS_REVERSED);
    }
  }

  private toColumns(dto: ProductRequestDto): Partial<ProductEntity> {
    return {
      name: dto.name,
      nameEn: dto.nameEn ?? '',
      category: dto.category,
      brand: dto.brand,
      partNumber: dto.partNumber,
      price: dto.price,
      oldPrice: dto.oldPrice ?? null,
      stock: dto.stock,
      image: dto.image,
      description: dto.description,
      descriptionEn: dto.descriptionEn ?? '',
      featured: dto.featured ?? false,
      fits: dto.fits.map((f): Fitment => {
        const fit: Fitment = { gen: f.gen, from: f.from, to: f.to };
        if (f.engines?.length) fit.engines = f.engines;
        return fit;
      }),
    };
  }

  // "front-grille", "front-grille-2", ... If two admins save the same name at the same
  // moment, the unique index rejects one of them and it retries with the next number.
  private async withUniqueSlug(
    name: string,
    id: string,
    write: (slug: string) => Promise<unknown>,
  ): Promise<void> {
    const base = slugify(name);
    for (let attempt = 0; attempt < SLUG_RETRIES; attempt++) {
      const slug = await this.nextFreeSlug(base, id);
      try {
        await write(slug);
        return;
      } catch (error) {
        const isSlugClash =
          error instanceof QueryFailedError &&
          (error.driverError as { code?: string; constraint?: string })?.code === '23505' &&
          /slug/.test(
            String((error.driverError as { constraint?: string; detail?: string }).detail),
          );
        if (!isSlugClash) throw error;
      }
    }
    throw new ConflictException(PRODUCT_SLUG_CONFLICT);
  }

  private async nextFreeSlug(base: string, id: string): Promise<string> {
    const taken = await this.products
      .createQueryBuilder('p')
      .select('p.slug', 'slug')
      .where('(p.slug = :base OR p.slug LIKE :pattern)', {
        base,
        pattern: `${escapeLike(base)}-%`,
      })
      .andWhere('p.id <> :id', { id })
      .getRawMany<{ slug: string }>();
    const takenSet = new Set(taken.map((t) => t.slug));
    let slug = base;
    for (let n = 2; takenSet.has(slug); n++) slug = `${base}-${n}`;
    return slug;
  }
}
