import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard, AdminRoles, AdminRolesGuard } from '../auth/guards';
import { AdminOnlyGuard } from './admin.guards';
import { ZoneCreateSchema, ZoneUpdateSchema } from './admin.dto';

@ApiTags('admin/zones')
@ApiBearerAuth()
@Controller('admin/zones')
@UseGuards(JwtAuthGuard, AdminOnlyGuard, AdminRolesGuard)
export class ZonesController {
  constructor(private readonly prisma: PrismaService) {}

  @AdminRoles('SUPERADMIN','OPS','VERIFICATION','FINANCE','SUPPORT')
  @Get()
  async list(@Query('cityId') cityId?: string) {
    return this.prisma.zone.findMany({
      where: cityId ? { cityId } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  @AdminRoles('SUPERADMIN','OPS')
  @Post()
  async create(@Body() body: unknown) {
    const dto = ZoneCreateSchema.parse(body);
    return this.prisma.zone.create({
      data: { cityId: dto.cityId, name: dto.name, polygon: dto.polygon },
    });
  }

  @AdminRoles('SUPERADMIN','OPS')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const dto = ZoneUpdateSchema.parse(body);
    return this.prisma.zone.update({ where: { id }, data: dto });
  }

  @AdminRoles('SUPERADMIN')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.prisma.zone.delete({ where: { id } });
  }
}
