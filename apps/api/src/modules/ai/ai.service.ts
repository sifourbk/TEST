import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentStatus } from '@prisma/client';

@Injectable()
export class AiService {
  constructor(private prisma: PrismaService) {}

  /**
   * Phase 3: deterministic mock verification.
   *
   * Sets document.status=AI_REVIEWED and stores a mock AI decision.
   */
  async verifyDocumentMock(documentId: string) {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Document not found');
    return this.prisma.document.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.AI_REVIEWED,
        aiDecision: 'review',
        aiConfidence: 0.55,
        aiReasons: ['Mock AI mode: requires human review'],
        extractedJson: { mock: true },
      },
    });
  }

  /**
   * Phase 6: deterministic mock verification for settlement proofs.
   */
  async verifySettlementProofMock(proofId: string) {
    const proof = await this.prisma.settlementProof.findUnique({ where: { id: proofId } });
    if (!proof) throw new NotFoundException('Proof not found');
    return this.prisma.settlementProof.update({
      where: { id: proofId },
      data: {
        status: DocumentStatus.AI_REVIEWED,
        aiDecision: 'review',
        aiConfidence: 0.55,
        extractedJson: { mock: true },
      },
    });
  }
}