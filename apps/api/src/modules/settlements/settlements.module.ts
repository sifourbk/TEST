import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SettlementsService } from './settlements.service';
import { DriverSettlementsController } from './driver-settlements.controller';
import { AdminSettlementsController } from './admin-settlements.controller';
import { JobsModule } from '../jobs/jobs.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, JobsModule, AuditModule],
  providers: [SettlementsService],
  controllers: [DriverSettlementsController, AdminSettlementsController],
  exports: [SettlementsService],
})
export class SettlementsModule {}
