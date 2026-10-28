import { Body, Controller, HttpStatus, Post } from '@nestjs/common';
import { ApiConflictResponse, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AppController } from '../../common/decorators/app-controller.decorator';
import { OrderStatusesRequestDto, PlaceOrderRequestDto } from '../dto/order-request.dto';
import { OrderStatusResponseDto, PlacedOrderResponseDto } from '../dto/order-response.dto';
import { OrdersService } from '../services/orders.service';

@ApiTags('Orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @AppController({
    title: 'Place a pickup order',
    public: true,
    // Stops a script from reserving all the stock with fake orders.
    throttle: { limit: 10, ttl: 10 * 60_000 },
    response: [
      ApiCreatedResponse({ type: PlacedOrderResponseDto }),
      ApiConflictResponse({ description: 'ORDER_INSUFFICIENT_STOCK or ORDER_PRODUCT_UNAVAILABLE' }),
    ],
  })
  async place(@Body() body: PlaceOrderRequestDto): Promise<PlacedOrderResponseDto> {
    return PlacedOrderResponseDto.from(await this.orders.place(body));
  }

  // POST so the id list is not written to proxy and server access logs.
  @Post('statuses')
  @AppController({
    title: "Live status of the customer's own orders (ids kept in their browser)",
    public: true,
    httpCode: HttpStatus.OK,
    throttle: { limit: 60, ttl: 60_000 },
    response: [ApiOkResponse({ type: [OrderStatusResponseDto] })],
  })
  statuses(@Body() body: OrderStatusesRequestDto): Promise<OrderStatusResponseDto[]> {
    return this.orders.statuses(body.ids);
  }
}
