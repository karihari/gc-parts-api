import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { TimestampedEntity } from './base.entity';
import { OrderStatus, PaymentMethod } from './enums';

// Name and price are copied at order time so later product edits do not change the order.
export class OrderItem {
  @ApiProperty()
  productId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  price: number;

  @ApiProperty()
  qty: number;
}

// There is no delivery: the customer pays when they pick the order up.
@Entity('orders')
export class OrderEntity extends TimestampedEntity {
  @ApiProperty({ example: 'ORD-3F9A1C0B2E' })
  @PrimaryColumn({ type: 'text' })
  id: string;

  @ApiProperty()
  @Column({ type: 'text' })
  name: string;

  @ApiProperty({ example: '+374 98281116' })
  @Column({ type: 'text' })
  phone: string;

  @ApiProperty()
  @Column({ type: 'text' })
  email: string;

  @ApiProperty({ enum: PaymentMethod })
  @Column({ type: 'text' })
  payment: PaymentMethod;

  @ApiProperty({ type: [OrderItem] })
  @Column({ type: 'jsonb' })
  items: OrderItem[];

  // Whole drams.
  @ApiProperty()
  @Column({ type: 'integer' })
  total: number;

  @ApiProperty({ enum: OrderStatus })
  @Index('orders_status_idx')
  @Column({ type: 'text', default: OrderStatus.NEW })
  status: OrderStatus;
}
