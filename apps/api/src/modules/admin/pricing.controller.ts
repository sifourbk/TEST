import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard, AdminRoles, AdminRolesGuard } from '../auth/guards';
import { AdminOnlyGuard } from './admin.guards';
import { PricingCreateSchema, PricingUpdateSchema } from './admin.dto';

@ApiTags('admin/pricing')
@ApiBearerAuth()
@Controller('admin/pricing')
@UseGuards(JwtAuthGuard, AdminOnlyGuard, AdminRolesGuard)
export class PricingController {
  constructor(private readonly prisma: PrismaService) {}

  @AdminRoles('SUPERADMIN','OPS','FINANCE')
  @Get()
  async list(@Query('cityId') cityId?: string) {
    return this.prisma.pricingProfile.findMany({ where: cityId ? { cityId } : undefined });
  }

  @AdminRoles('SUPERADMIN','OPS')
  @Post()
  async upsert(@Body() body: unknown) {
    const dto = PricingCreateSchema.parse(body);
    return this.prisma.pricingProfile.upsert({
      where: { cityId_truckType: { cityId: dto.cityId, truckType: dto.truckType as any } },
      update: dto,
      create: dto,
    });
  }

  @AdminRoles('SUPERADMIN','OPS')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const dto = PricingUpdateSchema.parse(body);
    return this.prisma.pricingProfile.update({ where: { id }, data: dto });
  }
}
