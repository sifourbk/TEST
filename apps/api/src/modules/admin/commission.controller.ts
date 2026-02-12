import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard, AdminRoles, AdminRolesGuard } from '../auth/guards';
import { AdminOnlyGuard } from './admin.guards';
import { CommissionCreateSchema, CommissionUpdateSchema } from './admin.dto';

@ApiTags('admin/commission')
@ApiBearerAuth()
@Controller('admin/commission')
@UseGuards(JwtAuthGuard, AdminOnlyGuard, AdminRolesGuard)
export class CommissionController {
  constructor(private readonly prisma: PrismaService) {}

  @AdminRoles('SUPERADMIN','FINANCE','OPS')
  @Get()
  async list(@Query('cityId') cityId?: string) {
    return this.prisma.commissionRule.findMany({ where: cityId ? { cityId } : undefined });
  }

  @AdminRoles('SUPERADMIN','FINANCE')
  @Post()
  async upsert(@Body() body: unknown) {
    const dto = CommissionCreateSchema.parse(body);
    return this.prisma.commissionRule.upsert({
      where: { cityId_truckType: { cityId: dto.cityId, truckType: dto.truckType as any } },
      update: { ...dto, fixedFee: dto.fixedFee ?? 0 },
      create: { ...dto, fixedFee: dto.fixedFee ?? 0 },
    });
  }

  @AdminRoles('SUPERADMIN','FINANCE')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const dto = CommissionUpdateSchema.parse(body);
    return this.prisma.commissionRule.update({ where: { id }, data: dto });
  }
}
