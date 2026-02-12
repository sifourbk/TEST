import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CommissionStatus, DocumentStatus, DriverStatus, SettlementStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class SettlementsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async listMine(driverId: string) {
    return this.prisma.settlement.findMany({
      where: { driverId },
      orderBy: { weekStart: 'desc' },
      include: {
        proofs: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  async uploadProof(driverId: string, settlementId: string, fileUrl: string) {
    const settlement = await this.prisma.settlement.findUnique({ where: { id: settlementId } });
    if (!settlement) throw new NotFoundException('Settlement not found');
    if (settlement.driverId !== driverId) throw new ForbiddenException();
    if (settlement.status === SettlementStatus.VERIFIED) throw new BadRequestException('Settlement already verified');

    const proof = await this.prisma.settlementProof.create({
      data: { settlementId, fileUrl, status: DocumentStatus.PENDING },
    });
    await this.audit.log({ actorId: driverId, action: 'settlement.proof.upload', entity: 'SettlementProof', entityId: proof.id, meta: { settlementId } });

    if (settlement.status === SettlementStatus.OPEN) {
      await this.prisma.settlement.update({ where: { id: settlementId }, data: { status: SettlementStatus.PROOF_PENDING } });
    }

    return proof;
  }

  async adminListSettlements(status?: SettlementStatus) {
    return this.prisma.settlement.findMany({
      where: status ? { status } : undefined,
      orderBy: { weekStart: 'desc' },
      include: { driver: true, proofs: { orderBy: { createdAt: 'desc' } } },
    });
  }

  async adminListProofs(status?: DocumentStatus) {
    return this.prisma.settlementProof.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { settlement: { include: { driver: true } } },
    });
  }

  async adminReviewProof(adminId: string, proofId: string, decision: 'approve' | 'reject' | 'fraud') {
    const proof = await this.prisma.settlementProof.findUnique({ where: { id: proofId } });
    if (!proof) throw new NotFoundException('Proof not found');
    const settlement = await this.prisma.settlement.findUnique({ where: { id: proof.settlementId } });
    if (!settlement) throw new NotFoundException('Settlement not found');

    if (decision === 'approve') {
      return this.prisma.$transaction(async (tx) => {
        await tx.settlementProof.update({
          where: { id: proofId },
          data: {
            status: DocumentStatus.APPROVED,
            reviewedById: adminId,
            reviewedAt: new Date(),
          },
        });
        await tx.settlement.update({
          where: { id: settlement.id },
          data: {
            status: SettlementStatus.VERIFIED,
            verifiedAt: new Date(),
          },
        });

        // settle commissions
        await tx.commission.updateMany({
          where: { settlementId: settlement.id },
          data: { status: CommissionStatus.SETTLED },
        });

        // unsuspend driver if they were suspended (MVP assumes settlement-only suspension)
        await tx.user.update({ where: { id: settlement.driverId }, data: { status: UserStatus.ACTIVE } });
        await tx.driverProfile.updateMany({ where: { userId: settlement.driverId }, data: { status: DriverStatus.APPROVED } });

        // best-effort audit
        await tx.auditLog.create({ data: { actorId: adminId, action: 'settlement.proof.approve', entity: 'SettlementProof', entityId: proofId, meta: { settlementId: settlement.id } } });

        return { ok: true };
      });
    }

    if (decision === 'reject') {
      await this.prisma.settlementProof.update({
        where: { id: proofId },
        data: { status: DocumentStatus.REJECTED, reviewedById: adminId, reviewedAt: new Date() },
      });
      await this.audit.log({ actorId: adminId, action: 'settlement.proof.reject', entity: 'SettlementProof', entityId: proofId, meta: { settlementId: settlement.id } });
      return { ok: true };
    }

    // fraud: ban driver + license_hash + registration_hash and create penalty invoice (10x amount_due)
    return this.prisma.$transaction(async (tx) => {
      await tx.settlementProof.update({
        where: { id: proofId },
        data: { status: DocumentStatus.FRAUD, reviewedById: adminId, reviewedAt: new Date() },
      });
      await tx.settlement.update({ where: { id: settlement.id }, data: { status: SettlementStatus.FRAUD } });

      const profile = await tx.driverProfile.findUnique({ where: { userId: settlement.driverId } });
      const activeVehicle = await tx.vehicle.findFirst({ where: { ownerId: settlement.driverId, status: 'ACTIVE' } });
      const licenseHash = profile?.licenseHash ?? undefined;
      const registrationHash = activeVehicle?.registrationHash ?? undefined;

      await tx.ban.create({
        data: {
          userId: settlement.driverId,
          licenseHash,
          registrationHash,
          reason: 'FRAUD',
          note: 'Settlement proof marked as fraud',
        },
      });

      await tx.penaltyInvoice.create({
        data: {
          userId: settlement.driverId,
          settlementId: settlement.id,
          amount: settlement.amountDue * 10,
          status: 'UNPAID',
        },
      });

      await tx.user.update({ where: { id: settlement.driverId }, data: { status: UserStatus.BANNED } });
      await tx.driverProfile.updateMany({ where: { userId: settlement.driverId }, data: { status: DriverStatus.BANNED } });

      await tx.auditLog.create({ data: { actorId: adminId, action: 'settlement.proof.fraud', entity: 'SettlementProof', entityId: proofId, meta: { settlementId: settlement.id, penalty: settlement.amountDue * 10 } } });

      return { ok: true };
    });
  }
}
