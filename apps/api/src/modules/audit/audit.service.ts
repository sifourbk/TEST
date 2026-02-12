import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: { actorId?: string; action: string; entity: string; entityId?: string; meta?: any }) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: params.actorId,
          action: params.action,
          entity: params.entity,
          entityId: params.entityId,
          meta: params.meta,
        },
      });
    } catch {
      // Best-effort; audit logging should not break the main flow.
    }
  }
}
