import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { AppController } from '../common/decorators/app-controller.decorator';

// For the load balancer / uptime monitor. Says nothing about versions or internals.
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  @SkipThrottle()
  @AppController({
    title: 'Liveness and database check',
    public: true,
    response: [ApiOkResponse({ schema: { example: { status: 'ok' } } })],
  })
  async check(): Promise<{ status: 'ok' }> {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('DATABASE_UNAVAILABLE');
    }
  }
}
