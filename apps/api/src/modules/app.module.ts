import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AdminModule } from './admin/admin.module';
import { DriverModule } from './driver/driver.module';
import { AiModule } from './ai/ai.module';
import { RedisModule } from './redis/redis.module';
import { OrdersModule } from './orders/orders.module';
import { SettlementsModule } from './settlements/settlements.module';
import { JobsModule } from './jobs/jobs.module';
import { SecurityModule } from './security/security.module';
import { SupportModule } from './support/support.module';

@Module({
  imports: [PrismaModule, SecurityModule, RedisModule, HealthModule, AuthModule, UsersModule, AdminModule, DriverModule, AiModule, OrdersModule, JobsModule, SettlementsModule, SupportModule],
  providers: [],
})
export class AppModule {}
