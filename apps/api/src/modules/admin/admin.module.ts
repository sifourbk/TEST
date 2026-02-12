import { Module } from '@nestjs/common';
import { CitiesController } from './cities.controller';
import { ZonesController } from './zones.controller';
import { PricingController } from './pricing.controller';
import { CommissionController } from './commission.controller';
import { DocumentsAdminController } from './documents.controller';
import { VehiclesAdminController } from './vehicles.controller';
import { BansAdminController } from './bans.controller';
import { PenaltiesAdminController } from './penalties.controller';
import { AnalyticsController } from './analytics.controller';
import { AuditController } from './audit.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [
    CitiesController,
    ZonesController,
    PricingController,
    CommissionController,
    DocumentsAdminController,
    VehiclesAdminController,
    BansAdminController,
    PenaltiesAdminController,
    AnalyticsController,
    AuditController,
  ],
})
export class AdminModule {}
