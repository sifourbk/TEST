import { Body, Controller, ForbiddenException, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/current-user.decorator';
import { AiService } from './ai.service';

const verifyDocSchema = z.object({ documentId: z.string().min(1) });
const verifyProofSchema = z.object({ proofId: z.string().min(1) });

@Controller('ai')
export class AiController {
  constructor(private readonly svc: AiService) {}

  // driver documents + bank proofs will be verified; in Phase 3 we implement documents only.
  @Post('verify-document')
  @UseGuards(JwtAuthGuard)
  async verifyDocument(@CurrentUser() user: { id: string; role: string }, @Body() body: any) {
    // Only admins can trigger verification in MVP; later we'll auto-trigger on upload.
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException();
    }
    const parsed = verifyDocSchema.parse(body);
    return this.svc.verifyDocumentMock(parsed.documentId);
  }

  @Post('verify-settlement-proof')
  @UseGuards(JwtAuthGuard)
  async verifySettlementProof(@CurrentUser() user: { id: string; role: string }, @Body() body: any) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    const parsed = verifyProofSchema.parse(body);
    return this.svc.verifySettlementProofMock(parsed.proofId);
  }
}