import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { OriginGuard } from './common/guards/origin.guard';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { EnquiriesModule } from './enquiries/enquiries.module';
import { HealthController } from './health/health.controller';
import { ImagesModule } from './images/images.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrdersModule } from './orders/orders.module';
import { ProductsModule } from './products/products.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    ScheduleModule.forRoot(),
    // Default limit per client IP; sensitive routes set stricter limits via @AppController.
    // In-memory storage is per process: use a Redis store when running several instances.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    NotificationsModule,
    AuthModule,
    UsersModule,
    ProductsModule,
    ImagesModule,
    OrdersModule,
    EnquiriesModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: cheap rejections first, then authentication, then authorisation.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
})
export class AppModule {}
