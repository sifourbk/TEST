import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PricingService } from './pricing.service';
import { MatchingService } from './matching.service';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, PricingService, MatchingService],
})
export class OrdersModule {}
