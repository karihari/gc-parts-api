import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../common/dto/pagination.dto';
import { OrderEntity, OrderItem, OrderStatus } from '../../database/entities';

export class PlacedOrderResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  total: number;

  @ApiProperty({ type: [OrderItem] })
  items: OrderItem[];

  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;

  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt: Date;

  static from(order: OrderEntity): PlacedOrderResponseDto {
    return {
      id: order.id,
      total: order.total,
      items: order.items,
      status: order.status,
      createdAt: order.createdAt,
    };
  }
}

// What a customer may see about their own orders: no contact details.
export class OrderStatusResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;
}

export class AdminOrderListResponseDto {
  @ApiProperty({ type: [OrderEntity] })
  data: OrderEntity[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class OrdersSummaryResponseDto {
  @ApiProperty({ example: { New: 3, 'Ready for pickup': 1, Completed: 20, Cancelled: 2 } })
  countByStatus: Record<OrderStatus, number>;

  @ApiProperty({ description: 'Sum of completed orders, whole drams' })
  completedRevenue: number;

  @ApiProperty({ description: 'Sum of orders not yet picked up, whole drams' })
  openValue: number;
}
