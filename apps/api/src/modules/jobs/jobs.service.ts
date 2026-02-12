import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CommissionStatus, DriverStatus, SettlementStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Lightweight scheduler for weekly settlement jobs.
 *
 * Uses wall-clock checks (Africa/Algiers) on an interval to avoid extra dependencies.
 * Provides explicit run* methods for deterministic tests and manual admin triggers.
 */
@Injectable()
export class JobsService implements OnModuleInit {
  private readonly logger = new Logger(JobsService.name);
  private tickHandle: NodeJS.Timeout | null = null;
  private lastRanKey: Record<string, string> = {};

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Disable periodic ticking in tests if requested.
    if (process.env.JOBS_TICK_ENABLED === 'false') return;
    this.tickHandle = setInterval(() => {
      this.tick().catch((e) => this.logger.error(e));
    }, 30_000);
  }

  private async tick() {
    const now = new Date();
    const local = this.getLocalParts(now);

    // Sunday 00:05 - create settlements for previous week.
    if (local.weekday === 0 && local.hour === 0 && local.minute === 5) {
      const key = `create:${local.date}`;
      if (this.lastRanKey[key] !== local.date) {
        this.lastRanKey[key] = local.date;
        await this.runCreateWeeklySettlements(now);
      }
    }

    // Monday 00:00 - suspend drivers with unverified proof.
    if (local.weekday === 1 && local.hour === 0 && local.minute === 0) {
      const key = `suspend:${local.date}`;
      if (this.lastRanKey[key] !== local.date) {
        this.lastRanKey[key] = local.date;
        await this.runSuspendOverdueSettlements(now);
      }
    }
  }

  /**
   * Compute last week's [start, end) in Africa/Algiers time.
   * Week is Sunday -> Saturday.
   */
  private previousWeekRange(now: Date): { weekStart: Date; weekEnd: Date } {
    const tz = process.env.TZ || 'Africa/Algiers';
    const parts = this.getLocalParts(now);
    // Start of current week (Sunday 00:00 local)
    const currentWeekStartLocal = this.localMidnightOfDate(parts, tz);
    const currentWeekStart = currentWeekStartLocal;
    // Move back 7 days for previous week
    const prevWeekStart = new Date(currentWeekStart.getTime() - 7 * 24 * 3600 * 1000);
    return { weekStart: prevWeekStart, weekEnd: currentWeekStart };
  }

  /**
   * Create a Settlement per driver for commissions UNPAID whose order.completedAt is within previous week.
   * Commissions are marked IN_SETTLEMENT and linked to settlement.
   */
  async runCreateWeeklySettlements(now: Date) {
    const { weekStart, weekEnd } = this.previousWeekRange(now);
    // Find commissions eligible
    const commissions = await this.prisma.commission.findMany({
      where: {
        status: CommissionStatus.UNPAID,
        order: { completedAt: { gte: weekStart, lt: weekEnd } },
      },
      select: { id: true, driverId: true, amount: true },
    });

    const byDriver = new Map<string, { amount: number; ids: string[] }>();
    for (const c of commissions) {
      const existing = byDriver.get(c.driverId) ?? { amount: 0, ids: [] };
      existing.amount += c.amount;
      existing.ids.push(c.id);
      byDriver.set(c.driverId, existing);
    }

    const created: string[] = [];
    for (const [driverId, agg] of byDriver.entries()) {
      if (agg.amount <= 0) continue;
      const settlement = await this.prisma.settlement.upsert({
        where: {
          driverId_weekStart_weekEnd: {
            driverId,
            weekStart,
            weekEnd,
          },
        },
        create: {
          driverId,
          weekStart,
          weekEnd,
          amountDue: agg.amount,
          status: SettlementStatus.OPEN,
        },
        update: {},
      });

      await this.prisma.commission.updateMany({
        where: { id: { in: agg.ids } },
        data: { status: CommissionStatus.IN_SETTLEMENT, settlementId: settlement.id },
      });

      created.push(settlement.id);
    }

    this.logger.log(`Created/updated settlements: ${created.length} for week ${weekStart.toISOString()}..${weekEnd.toISOString()}`);
    return { weekStart, weekEnd, count: created.length };
  }

  // Public aliases used by controllers/tests.
  async createWeeklySettlements(now: Date) {
    return this.runCreateWeeklySettlements(now);
  }

  /**
   * Monday 00:00 rule: if proof NOT verified => driver auto-suspended.
   */
  async runSuspendOverdueSettlements(now: Date) {
    // Any settlement for previous week that is not VERIFIED becomes OVERDUE.
    const { weekStart, weekEnd } = this.previousWeekRange(now);

    const overdue = await this.prisma.settlement.findMany({
      where: {
        weekStart,
        weekEnd,
        status: { notIn: [SettlementStatus.VERIFIED] },
      },
      select: { id: true, driverId: true },
    });

    for (const s of overdue) {
      await this.prisma.settlement.update({
        where: { id: s.id },
        data: { status: SettlementStatus.OVERDUE, overdueAt: now },
      });
      await this.prisma.user.update({
        where: { id: s.driverId },
        data: { status: UserStatus.SUSPENDED },
      });
      await this.prisma.driverProfile.updateMany({
        where: { userId: s.driverId, status: { notIn: [DriverStatus.BANNED] } },
        data: { status: DriverStatus.SUSPENDED },
      });
    }

    return { weekStart, weekEnd, suspendedDrivers: overdue.map((x) => x.driverId) };
  }

  async suspendOverdueSettlements(now: Date) {
    return this.runSuspendOverdueSettlements(now);
  }

  /**
   * Extract Africa/Algiers wall-clock parts.
   */
  private getLocalParts(now: Date) {
    const tz = process.env.TZ || 'Africa/Algiers';
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      weekday: 'short',
    });
    const parts = dtf.formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    const year = Number(get('year'));
    const month = Number(get('month'));
    const day = Number(get('day'));
    const hour = Number(get('hour'));
    const minute = Number(get('minute'));
    const second = Number(get('second'));
    const weekdayShort = get('weekday') ?? 'Sun';
    const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const weekday = map[weekdayShort] ?? 0;
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { year, month, day, hour, minute, second, weekday, date };
  }

  /**
   * Returns a UTC Date that represents local Sunday's midnight at the start of current week.
   */
  private localMidnightOfDate(parts: { year: number; month: number; day: number; weekday: number }, tz: string): Date {
    // Compute date of Sunday for current week in local calendar.
    // We build a UTC date at noon to avoid DST edge cases (Algiers has no DST currently, but safe).
    const approxUtcNoon = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
    const local = this.getLocalParts(approxUtcNoon);
    // days since Sunday
    const delta = local.weekday;
    const sundayApprox = new Date(approxUtcNoon.getTime() - delta * 24 * 3600 * 1000);

    // Convert local Sunday date at 00:00 to UTC by using formatToParts.
    const sLocal = this.getLocalParts(sundayApprox);
    // Make a Date assuming it is local midnight, then adjust via timeZone offset by parsing.
    // Trick: create an ISO-like string and use Date in UTC then correct by comparing.
    const localIso = `${sLocal.year}-${String(sLocal.month).padStart(2, '0')}-${String(sLocal.day).padStart(2, '0')}T00:00:00`;
    // Interpret as if it were in tz by using Intl to get offset:
    const utcGuess = new Date(localIso + 'Z');
    // Determine the same instant's local parts; compute delta between desired and got.
    const got = this.getLocalParts(utcGuess);
    const gotIso = `${got.year}-${String(got.month).padStart(2, '0')}-${String(got.day).padStart(2, '0')}T${String(got.hour).padStart(2, '0')}:${String(got.minute).padStart(2, '0')}:${String(got.second).padStart(2, '0')}`;
    // If got is not midnight local, adjust by the difference in hours/minutes.
    const desiredMs = 0;
    const gotMs = (got.hour * 3600 + got.minute * 60 + got.second) * 1000;
    const diff = gotMs - desiredMs;
    return new Date(utcGuess.getTime() - diff);
  }
}
