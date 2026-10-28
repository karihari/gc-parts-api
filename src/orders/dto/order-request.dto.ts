import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
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
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { OrderStatus, PaymentMethod } from '../../database/entities';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const ORDER_ID = /^ORD-[A-Z0-9]{6,20}$/;

export class OrderLineDto {
  @ApiProperty({ example: 'GC-1001' })
  @IsString()
  @MaxLength(40)
  productId: string;

  @ApiProperty({ minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  qty: number;
}

// Only ids and quantities come from the browser; names and prices are read from the database.
export class PlaceOrderRequestDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({
    example: '+374 98281116',
    description: 'Dial code, a space, then the local number',
  })
  @Transform(trim)
  @Matches(/^\+\d{1,4} \d{5,14}$/, { message: 'phone must look like "+374 98281116"' })
  phone: string;

  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(200)
  email: string;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  payment: PaymentMethod;

  @ApiProperty({ type: [OrderLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  items: OrderLineDto[];
}

export class OrderStatusesRequestDto {
  @ApiProperty({ type: [String], example: ['ORD-3F9A1C0B2E'] })
  @IsArray()
  @ArrayMaxSize(100)
  @Matches(ORDER_ID, { each: true })
  ids: string[];
}

export class OrderIdParamsDto {
  @ApiProperty({ example: 'ORD-3F9A1C0B2E' })
  @Matches(ORDER_ID)
  id: string;
}

export class UpdateOrderStatusRequestDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status: OrderStatus;
}

export class AdminOrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  @IsOptional()
  status?: OrderStatus;

  @ApiPropertyOptional({ description: 'Order id, customer name, phone or email' })
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  @IsOptional()
  q?: string;
}
