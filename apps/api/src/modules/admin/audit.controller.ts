import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminSuperGuard } from './admin.guards';

@Controller('admin/audit-logs')
@UseGuards(AdminSuperGuard)
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns audit logs (SuperAdmin only) with simple cursor pagination.
   *
   * Query:
   * - limit: 1..100 (default 50)
   * - cursor: auditLog.id (optional)
   */
  @Get()
  async list(@Query('limit') limitRaw?: string, @Query('cursor') cursor?: string) {
    const limit = Math.max(1, Math.min(100, limitRaw ? parseInt(limitRaw, 10) : 50));
    const logs = await this.prisma.auditLog.findMany({
      take: limit,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor },
          }
        : {}),
      orderBy: { createdAt: 'desc' },
    });
    return {
      items: logs,
      nextCursor: logs.length === limit ? logs[logs.length - 1].id : null,
    };
  }
}
