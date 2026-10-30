import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { paginate, Paginated } from '../../common/dto/pagination.dto';
import { ProcessingException } from '../../common/exceptions/processing.exception';
import { newOrderId } from '../../common/helpers/ids';
import { OrderEntity, OrderItem, OrderStatus, ProductEntity } from '../../database/entities';
import { NotificationsService } from '../../notifications/notifications.service';
import { AdminOrdersQueryDto, PlaceOrderRequestDto } from '../dto/order-request.dto';
import { OrdersSummaryResponseDto, OrderStatusResponseDto } from '../dto/order-response.dto';
import {
  ORDER_ALREADY_CANCELLED,
  ORDER_INSUFFICIENT_STOCK,
  ORDER_NOT_FOUND,
  ORDER_PRODUCT_NO_PRICE,
  ORDER_PRODUCT_UNAVAILABLE,
} from '../errors';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(OrderEntity)
    private readonly orders: Repository<OrderEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
  ) {}

  // Stock check, stock decrement and the order row are one transaction: either all
  // happen or none do. The old version reserved stock row by row and undid it by hand
  // on failure, which could leave stock wrong if the process died half way.
  async place(dto: PlaceOrderRequestDto): Promise<OrderEntity> {
    // Merge repeated lines so stock is checked against the full quantity.
    const qtyById = new Map<string, number>();
    for (const line of dto.items) {
      qtyById.set(line.productId, (qtyById.get(line.productId) ?? 0) + line.qty);
    }

    const order = await this.dataSource.transaction(async (manager) => {
      // Locked in id order, so two checkouts with the same parts queue up instead of deadlocking.
      const products = await manager
        .getRepository(ProductEntity)
        .createQueryBuilder('p')
        .setLock('pessimistic_write')
        .where({ id: In([...qtyById.keys()]) })
        .orderBy('p.id', 'ASC')
        .getMany();
      const byId = new Map(products.map((p) => [p.id, p]));

      const items: OrderItem[] = [];
      for (const [productId, qty] of qtyById) {
        const product = byId.get(productId);
        if (!product) throw new ProcessingException(ORDER_PRODUCT_UNAVAILABLE, { productId });
        // A price of 0 means "price on request": the customer has to ask the shop first.
        if (product.price <= 0) {
          throw new ProcessingException(ORDER_PRODUCT_NO_PRICE, {
            productId,
            name: product.name,
          });
        }
        if (product.stock < qty) {
          throw new ProcessingException(ORDER_INSUFFICIENT_STOCK, {
            productId,
            name: product.name,
            available: product.stock,
          });
        }
        // Prices come from the database, never from the browser.
        items.push({ productId, name: product.name, price: product.price, qty });
      }

      await this.changeStock(manager, items, -1);

      const repo = manager.getRepository(OrderEntity);
      return repo.save(
        repo.create({
          id: newOrderId(),
          name: dto.name,
          phone: dto.phone,
          email: dto.email,
          payment: dto.payment,
          items,
          total: items.reduce((sum, i) => sum + i.price * i.qty, 0),
          status: OrderStatus.NEW,
        }),
      );
    });

    this.logger.log(`Order ${order.id} placed (${order.items.length} lines, ${order.total} AMD)`);
    // The order is saved; a failed notification is only logged and must not fail checkout.
    void this.notifications.send('gcparts-order', {
      id: order.id,
      name: order.name,
      phone: order.phone,
      email: order.email,
      payment: order.payment,
      items: order.items,
      total: order.total,
    });
    return order;
  }

  // The customer's own orders, looked up by the ids saved in their browser.
  async statuses(ids: string[]): Promise<OrderStatusResponseDto[]> {
    if (!ids.length) return [];
    return this.orders.find({ select: { id: true, status: true }, where: { id: In(ids) } });
  }

  async list(query: AdminOrdersQueryDto): Promise<Paginated<OrderEntity>> {
    const qb = this.orders.createQueryBuilder('o');
    if (query.status) qb.andWhere('o.status = :status', { status: query.status });
    if (query.q) {
      qb.andWhere('(o.id ILIKE :q OR o.name ILIKE :q OR o.phone ILIKE :q OR o.email ILIKE :q)', {
        q: `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`,
      });
    }
    const [rows, total] = await qb
      .orderBy('o.createdAt', 'DESC')
      .addOrderBy('o.id', 'ASC')
      .skip((query.page - 1) * query.perPage)
      .take(query.perPage)
      .getManyAndCount();
    return paginate(rows, total, query);
  }

  async get(id: string): Promise<OrderEntity> {
    const order = await this.orders.findOneBy({ id });
    if (!order) throw new NotFoundException(ORDER_NOT_FOUND);
    return order;
  }

  // Cancelling puts the parts back on the shelf. The order row is locked, so two clicks
  // on "Cancelled" cannot restock twice.
  async setStatus(id: string, status: OrderStatus): Promise<OrderEntity> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(OrderEntity);
      const order = await repo
        .createQueryBuilder('o')
        .setLock('pessimistic_write')
        .where('o.id = :id', { id })
        .getOne();
      if (!order) throw new NotFoundException(ORDER_NOT_FOUND);
      if (order.status === OrderStatus.CANCELLED) {
        throw new ProcessingException(ORDER_ALREADY_CANCELLED);
      }
      if (order.status === status) return order;

      await repo.update(id, { status });
      if (status === OrderStatus.CANCELLED) await this.changeStock(manager, order.items, 1);
      this.logger.log(`Order ${id}: ${order.status} -> ${status}`);
      return { ...order, status };
    });
  }

  async summary(): Promise<OrdersSummaryResponseDto> {
    const rows = await this.orders
      .createQueryBuilder('o')
      .select('o.status', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .addSelect('COALESCE(SUM(o.total), 0)::bigint', 'sum')
      .groupBy('o.status')
      .getRawMany<{ status: OrderStatus; count: number; sum: string }>();

    const countByStatus = Object.fromEntries(
      Object.values(OrderStatus).map((s) => [s, 0]),
    ) as Record<OrderStatus, number>;
    let completedRevenue = 0;
    let openValue = 0;
    for (const row of rows) {
      countByStatus[row.status] = row.count;
      if (row.status === OrderStatus.COMPLETED) completedRevenue = Number(row.sum);
      if (row.status === OrderStatus.NEW || row.status === OrderStatus.READY_FOR_PICKUP) {
        openValue += Number(row.sum);
      }
    }
    return { countByStatus, completedRevenue, openValue };
  }

  private async changeStock(
    manager: EntityManager,
    items: { productId: string; qty: number }[],
    sign: 1 | -1,
  ): Promise<void> {
    for (const item of items) {
      await manager
        .createQueryBuilder()
        .update(ProductEntity)
        .set({ stock: () => 'stock + :delta' })
        .where('id = :id', { id: item.productId })
        .setParameter('delta', sign * item.qty)
        .execute();
    }
  }
}
