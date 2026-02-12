import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentStatus, DocumentType } from '@prisma/client';

@Injectable()
export class DriverDocumentsService {
  constructor(private prisma: PrismaService) {}

  listMine(ownerId: string) {
    return this.prisma.document.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async upload(ownerId: string, type: DocumentType, fileUrl: string) {
    if (!fileUrl) throw new BadRequestException('fileUrl required');
    return this.prisma.document.create({
      data: {
        ownerId,
        type,
        fileUrl,
        status: DocumentStatus.PENDING,
      },
    });
  }
}