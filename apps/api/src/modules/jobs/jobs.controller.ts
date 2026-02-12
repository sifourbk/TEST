import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/guards';
import { AdminOnlyGuard } from '../admin/admin.guards';
import { JobsService } from './jobs.service';

const schema = z.object({ nowIso: z.string().datetime().optional() });

@Controller('admin/jobs')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post('run-create-settlements')
  async runCreate(@Body() body: any) {
    const parsed = schema.parse(body ?? {});
    const now = parsed.nowIso ? new Date(parsed.nowIso) : new Date();
    return this.jobs.createWeeklySettlements(now);
  }

  @Post('run-suspend-overdue')
  async runSuspend(@Body() body: any) {
    const parsed = schema.parse(body ?? {});
    const now = parsed.nowIso ? new Date(parsed.nowIso) : new Date();
    return this.jobs.suspendOverdueSettlements(now);
  }
}
