import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard, AdminRoles, AdminRolesGuard } from '../auth/guards';
import { AdminOnlyGuard } from './admin.guards';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuditService } from '../audit/audit.service';

const createSchema = z.object({
  userId: z.string().optional(),
  licenseHash: z.string().optional(),
  registrationHash: z.string().optional(),
  deviceHash: z.string().optional(),
  reason: z.enum(['FRAUD', 'NON_PAYMENT', 'OTHER']).optional(),
  note: z.string().optional(),
});

@Controller('admin/bans')
@UseGuards(JwtAuthGuard, AdminOnlyGuard, AdminRolesGuard)
export class BansAdminController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get()
  @AdminRoles('SUPERADMIN', 'OPS', 'FINANCE', 'VERIFICATION')
  async list(@Query('active') active?: string) {
    const where = active === 'true' ? { isActive: true } : active === 'false' ? { isActive: false } : undefined;
    return this.prisma.ban.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { user: true, liftedBy: true },
    });
  }

  @Post()
  @AdminRoles('SUPERADMIN')
  async create(@CurrentUser() actor: { id: string }, @Body() body: any) {
    const dto = createSchema.parse(body);
    if (!dto.userId && !dto.licenseHash && !dto.registrationHash && !dto.deviceHash) {
      throw new BadRequestException('At least one ban target must be provided');
    }
    const ban = await this.prisma.ban.create({
      data: {
        userId: dto.userId,
        licenseHash: dto.licenseHash,
        registrationHash: dto.registrationHash,
        deviceHash: dto.deviceHash,
        reason: (dto.reason as any) ?? 'OTHER',
        note: dto.note,
      },
    });
    await this.audit.log({ actorId: actor.id, action: 'ban.create', entity: 'Ban', entityId: ban.id, meta: { userId: ban.userId, reason: ban.reason } });
    return ban;
  }

  @Patch(':id/lift')
  @AdminRoles('SUPERADMIN')
  async lift(@CurrentUser() actor: { id: string }, @Param('id') id: string) {
    const ban = await this.prisma.ban.findUnique({ where: { id } });
    if (!ban) throw new BadRequestException('Ban not found');
    if (!ban.isActive) return { ok: true };

    // Must have no unpaid penalties.
    if (ban.userId) {
      const unpaid = await this.prisma.penaltyInvoice.count({ where: { userId: ban.userId, status: 'UNPAID' } });
      if (unpaid > 0) throw new BadRequestException('Cannot lift ban: unpaid penalty invoices exist');
    }

    const updated = await this.prisma.ban.update({
      where: { id },
      data: { isActive: false, liftedAt: new Date(), liftedById: actor.id },
    });
    await this.audit.log({ actorId: actor.id, action: 'ban.lift', entity: 'Ban', entityId: updated.id, meta: { userId: updated.userId } });

    // If this ban was tied to a user, reactivate the user only if they have no other active bans.
    if (ban.userId) {
      const remaining = await this.prisma.ban.count({ where: { userId: ban.userId, isActive: true } });
      if (remaining === 0) {
        await this.prisma.user.update({ where: { id: ban.userId }, data: { status: 'ACTIVE' } });
        await this.prisma.driverProfile.updateMany({ where: { userId: ban.userId }, data: { status: 'APPROVED' } });
      }
    }

    return { ok: true, ban: updated };
  }
}
