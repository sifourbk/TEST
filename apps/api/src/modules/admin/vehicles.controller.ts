import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard, AdminRoles, AdminRolesGuard } from '../auth/guards';
import { AdminOnlyGuard } from './admin.guards';
import { VehicleStatus } from '@prisma/client';
import { z } from 'zod';

const decisionSchema = z.object({ decision: z.enum(['ACTIVATE', 'REJECT']) });

@Controller('admin/vehicles')
@UseGuards(JwtAuthGuard, AdminOnlyGuard, AdminRolesGuard)
export class VehiclesAdminController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @AdminRoles('SUPERADMIN', 'VERIFICATION')
  async list(@Query('status') status?: string) {
    const where = status ? { status: status as any } : undefined;
    return this.prisma.vehicle.findMany({
      where,
      include: { owner: true, photos: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Patch(':id/decision')
  @AdminRoles('SUPERADMIN', 'VERIFICATION')
  async decide(@Param('id') id: string, @Body() body: any) {
    const parsed = decisionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id }, include: { photos: true } });
    if (!vehicle) throw new BadRequestException('Vehicle not found');
    if (parsed.data.decision === 'ACTIVATE') {
      if (vehicle.photos.length < 3) throw new BadRequestException('Cannot activate: <3 photos');

      if (vehicle.registrationHash) {
        const banned = await this.prisma.ban.count({ where: { registrationHash: vehicle.registrationHash, isActive: true } });
        if (banned > 0) {
          // Auto-ban owner and reject activation
          await this.prisma.$transaction(async (tx) => {
            await tx.ban.create({
              data: {
                userId: vehicle.ownerId,
                registrationHash: vehicle.registrationHash ?? undefined,
                reason: 'FRAUD',
                note: 'Attempted to activate a vehicle with banned registration hash',
              },
            });
            await tx.user.update({ where: { id: vehicle.ownerId }, data: { status: 'BANNED' } });
            await tx.driverProfile.updateMany({ where: { userId: vehicle.ownerId }, data: { status: 'BANNED' } });
          });
          throw new BadRequestException('Vehicle registration is banned');
        }
      }
      return this.prisma.vehicle.update({ where: { id }, data: { status: VehicleStatus.ACTIVE } });
    }
    return this.prisma.vehicle.update({ where: { id }, data: { status: VehicleStatus.REJECTED } });
  }
}