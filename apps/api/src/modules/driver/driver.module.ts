import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DriverVehiclesController } from './vehicles/driver-vehicles.controller';
import { DriverVehiclesService } from './vehicles/driver-vehicles.service';
import { DriverDocumentsController } from './documents/driver-documents.controller';
import { DriverDocumentsService } from './documents/driver-documents.service';

@Module({
  imports: [PrismaModule],
  controllers: [DriverVehiclesController, DriverDocumentsController],
  providers: [DriverVehiclesService, DriverDocumentsService],
  exports: [DriverDocumentsService],
})
export class DriverModule {}
