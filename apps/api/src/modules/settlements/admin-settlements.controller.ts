import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/guards';
import { AdminOnlyGuard } from '../admin/admin.guards';
import { CurrentUser } from '../auth/current-user.decorator';
import { SettlementsService } from './settlements.service';

const reviewSchema = z.object({
  decision: z.enum(['approve', 'reject', 'fraud']),
});

@Controller('admin/settlements')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AdminSettlementsController {
  constructor(private readonly svc: SettlementsService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.svc.adminListSettlements(status as any);
  }

  @Get('proofs')
  proofs(@Query('status') status?: string) {
    return this.svc.adminListProofs(status as any);
  }

  @Patch('proofs/:id/review')
  review(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any) {
    const dto = reviewSchema.parse(body);
    return this.svc.adminReviewProof(user.id, id, dto.decision);
  }
}
