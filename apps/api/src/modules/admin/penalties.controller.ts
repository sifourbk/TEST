import { BadRequestException, Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard, AdminRoles, AdminRolesGuard } from '../auth/guards';
import { AdminOnlyGuard } from './admin.guards';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuditService } from '../audit/audit.service';

const markPaidSchema = z.object({
  proofUrl: z.string().optional(),
});

@Controller('admin/penalties')
@UseGuards(JwtAuthGuard, AdminOnlyGuard, AdminRolesGuard)
export class PenaltiesAdminController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get()
  @AdminRoles('SUPERADMIN', 'FINANCE')
  async list(@Query('status') status?: string) {
    return this.prisma.penaltyInvoice.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { user: true, settlement: true, markedPaidBy: true },
    });
  }

  @Patch(':id/mark-paid')
  @AdminRoles('SUPERADMIN', 'FINANCE')
  async markPaid(@CurrentUser() user: { id: string }, @Param('id') id: string, @Body() body: any) {
    const dto = markPaidSchema.parse(body ?? {});
    const inv = await this.prisma.penaltyInvoice.findUnique({ where: { id } });
    if (!inv) throw new BadRequestException('Penalty invoice not found');
    if (inv.status === 'PAID') return { ok: true };
    await this.prisma.penaltyInvoice.update({
      where: { id },
      data: { status: 'PAID', paidAt: new Date(), proofUrl: dto.proofUrl, markedPaidById: user.id },
    });
    await this.audit.log({ actorId: user.id, action: 'penalty.markPaid', entity: 'PenaltyInvoice', entityId: id, meta: { userId: inv.userId, amount: inv.amount } });
    return { ok: true };
  }
}
