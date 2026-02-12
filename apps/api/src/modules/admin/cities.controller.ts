import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard, AdminRoles, AdminRolesGuard } from '../auth/guards';
import { AdminOnlyGuard } from './admin.guards';
import { CityCreateSchema, CityUpdateSchema } from './admin.dto';

@ApiTags('admin/cities')
@ApiBearerAuth()
@Controller('admin/cities')
@UseGuards(JwtAuthGuard, AdminOnlyGuard, AdminRolesGuard)
export class CitiesController {
  constructor(private readonly prisma: PrismaService) {}

  @AdminRoles('SUPERADMIN','OPS','VERIFICATION','FINANCE','SUPPORT')
  @Get()
  async list() {
    return this.prisma.city.findMany({ orderBy: { name: 'asc' } });
  }

  @AdminRoles('SUPERADMIN','OPS')
  @Post()
  async create(@Body() body: unknown) {
    const dto = CityCreateSchema.parse(body);
    return this.prisma.city.create({ data: { name: dto.name, isActive: dto.isActive ?? true } });
  }

  @AdminRoles('SUPERADMIN','OPS')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const dto = CityUpdateSchema.parse(body);
    return this.prisma.city.update({ where: { id }, data: dto });
  }

  @AdminRoles('SUPERADMIN')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.prisma.city.delete({ where: { id } });
  }
}
