import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AppController } from '../../common/decorators/app-controller.decorator';
import { AdminRole, OrderEntity } from '../../database/entities';
import {
  AdminOrdersQueryDto,
  OrderIdParamsDto,
  UpdateOrderStatusRequestDto,
} from '../dto/order-request.dto';
import { AdminOrderListResponseDto, OrdersSummaryResponseDto } from '../dto/order-response.dto';
import { OrdersService } from '../services/orders.service';

const STAFF = [AdminRole.ADMIN, AdminRole.STAFF];

@ApiTags('Admin / Orders')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @AppController({
    title: 'List orders, newest first',
    roles: STAFF,
    response: [ApiOkResponse({ type: AdminOrderListResponseDto })],
  })
  list(@Query() query: AdminOrdersQueryDto): Promise<AdminOrderListResponseDto> {
    return this.orders.list(query);
  }

  // Declared before ":id" so "summary" is not read as an order id.
  @Get('summary')
  @AppController({
    title: 'Order counts and totals for the dashboard',
    roles: STAFF,
    response: [ApiOkResponse({ type: OrdersSummaryResponseDto })],
  })
  summary(): Promise<OrdersSummaryResponseDto> {
    return this.orders.summary();
  }

  @Get(':id')
  @AppController({
    title: 'One order',
    roles: STAFF,
    response: [ApiOkResponse({ type: OrderEntity })],
  })
  get(@Param() { id }: OrderIdParamsDto): Promise<OrderEntity> {
    return this.orders.get(id);
  }

  @Patch(':id/status')
  @AppController({
    title: 'Change order status; Cancelled returns the parts to stock',
    roles: STAFF,
    response: [ApiOkResponse({ type: OrderEntity })],
  })
  setStatus(
    @Param() { id }: OrderIdParamsDto,
    @Body() body: UpdateOrderStatusRequestDto,
  ): Promise<OrderEntity> {
    return this.orders.setStatus(id, body.status);
  }
}
