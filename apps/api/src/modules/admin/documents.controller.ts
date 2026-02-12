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
import { HashService } from '../security/hash.service';
import { JwtAuthGuard, AdminRoles, AdminRolesGuard } from '../auth/guards';
import { AdminOnlyGuard } from './admin.guards';
import { z } from 'zod';
import { DocumentStatus } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';

const reviewSchema = z.object({ decision: z.enum(['APPROVED', 'REJECTED', 'FRAUD']), extractedJson: z.any().optional() });

@Controller('admin/documents')
@UseGuards(JwtAuthGuard, AdminOnlyGuard, AdminRolesGuard)
export class DocumentsAdminController {
  constructor(private prisma: PrismaService, private readonly hash: HashService) {}

  @Get()
  @AdminRoles('SUPERADMIN', 'VERIFICATION')
  async list(@Query('status') status?: string) {
    const where = status ? { status: status as any } : undefined;
    return this.prisma.document.findMany({
      where,
      include: { owner: true, reviewedBy: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Patch(':id/review')
  @AdminRoles('SUPERADMIN', 'VERIFICATION')
  async review(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const statusMap: Record<string, DocumentStatus> = {
      APPROVED: DocumentStatus.APPROVED,
      REJECTED: DocumentStatus.REJECTED,
      FRAUD: DocumentStatus.FRAUD,
    };

    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new BadRequestException('Document not found');

    const extracted = (parsed.data.extractedJson ?? undefined) as any | undefined;
    const sanitized = extracted ? { ...extracted } : undefined;

    // Never store raw identifiers; store only hashes.
    let licenseHash: string | undefined;
    let registrationHash: string | undefined;

    if (sanitized?.licenseNumber && typeof sanitized.licenseNumber === 'string') {
      licenseHash = this.hash.hmacSha256(sanitized.licenseNumber);
      delete sanitized.licenseNumber;
      sanitized.licenseHash = licenseHash;
    }
    if (sanitized?.registrationNumber && typeof sanitized.registrationNumber === 'string') {
      registrationHash = this.hash.hmacSha256(sanitized.registrationNumber);
      delete sanitized.registrationNumber;
      sanitized.registrationHash = registrationHash;
    }

    // On approval, persist hashes to profile/vehicle and block if hashes are banned.
    if (parsed.data.decision === 'APPROVED') {
      if (doc.type === 'DRIVER_LICENSE' && licenseHash) {
        await this.prisma.driverProfile.upsert({
          where: { userId: doc.ownerId },
          update: { licenseHash },
          create: { userId: doc.ownerId, licenseHash },
        });
        const banned = await this.prisma.ban.count({ where: { licenseHash, isActive: true } });
        if (banned > 0) {
          await this.banUserForHash(doc.ownerId, { licenseHash }, 'FRAUD', 'Banned due to banned license hash');
        }
      }
      if (doc.type === 'VEHICLE_REGISTRATION' && registrationHash) {
        const vehicleId = sanitized?.vehicleId;
        if (vehicleId && typeof vehicleId === 'string') {
          await this.prisma.vehicle.update({ where: { id: vehicleId }, data: { registrationHash } });
        }
        const banned = await this.prisma.ban.count({ where: { registrationHash, isActive: true } });
        if (banned > 0) {
          await this.banUserForHash(doc.ownerId, { registrationHash }, 'FRAUD', 'Banned due to banned registration hash');
        }
      }
    }

    // On fraud, ban user + hashes.
    if (parsed.data.decision === 'FRAUD') {
      await this.banUserForHash(
        doc.ownerId,
        {
          licenseHash: licenseHash ?? undefined,
          registrationHash: registrationHash ?? undefined,
        },
        'FRAUD',
        'Document marked as fraud',
      );
    }

    return this.prisma.document.update({
      where: { id },
      data: {
        status: statusMap[parsed.data.decision],
        reviewedById: user.id,
        reviewedAt: new Date(),
        extractedJson: sanitized ?? undefined,
      },
    });
  }

  private async banUserForHash(
    userId: string,
    hashes: { licenseHash?: string; registrationHash?: string },
    reason: 'FRAUD' | 'NON_PAYMENT' | 'OTHER',
    note?: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.ban.create({
        data: {
          userId,
          licenseHash: hashes.licenseHash,
          registrationHash: hashes.registrationHash,
          reason,
          note,
        },
      });
      await tx.user.update({ where: { id: userId }, data: { status: 'BANNED' } });
      await tx.driverProfile.updateMany({ where: { userId }, data: { status: 'BANNED' } });
    });
  }
}
