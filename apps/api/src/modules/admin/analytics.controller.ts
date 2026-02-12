import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminAnyGuard } from './admin.guards';

@Controller('admin/analytics')
@UseGuards(AdminAnyGuard)
export class AnalyticsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Basic analytics for the admin dashboard.
   *
   * Returns:
   * - orders/day (createdAt) for the last N days
   * - total commission (sum) for the last N days
   * - cancellation rate for the last N days
   * - avg pickup ETA (minutes) computed as avg(arrivedAt - createdAt)
   */
  @Get()
  async get(@Query('days') daysRaw?: string) {
    const days = Math.max(1, Math.min(180, daysRaw ? parseInt(daysRaw, 10) : 30));

    const ordersPerDay = await this.prisma.$queryRawUnsafe<
      Array<{ day: Date; count: bigint }>
    >(
      `
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
      FROM "Order"
      WHERE "createdAt" >= now() - ($1 || ' days')::interval
      GROUP BY day
      ORDER BY day ASC
      `,
      days.toString(),
    );

    const totals = await this.prisma.$queryRawUnsafe<
      Array<{
        total_orders: bigint;
        canceled_orders: bigint;
        total_commission: bigint | null;
        avg_pickup_eta_min: number | null;
      }>
    >(
      `
      SELECT
        (SELECT COUNT(*)::bigint FROM "Order" WHERE "createdAt" >= now() - ($1 || ' days')::interval) AS total_orders,
        (SELECT COUNT(*)::bigint FROM "Order" WHERE "createdAt" >= now() - ($1 || ' days')::interval AND status = 'CANCELED') AS canceled_orders,
        (SELECT COALESCE(SUM(amount),0)::bigint FROM "Commission" WHERE "createdAt" >= now() - ($1 || ' days')::interval) AS total_commission,
        (
          SELECT AVG(EXTRACT(EPOCH FROM ("arrivedAt" - "createdAt"))/60.0)
          FROM "Order"
          WHERE "createdAt" >= now() - ($1 || ' days')::interval
            AND "arrivedAt" IS NOT NULL
        ) AS avg_pickup_eta_min
      `,
      days.toString(),
    );

    const t = totals[0] ?? {
      total_orders: BigInt(0),
      canceled_orders: BigInt(0),
      total_commission: BigInt(0),
      avg_pickup_eta_min: null,
    };
    const totalOrders = Number(t.total_orders ?? BigInt(0));
    const canceledOrders = Number(t.canceled_orders ?? BigInt(0));
    const cancellationRate = totalOrders === 0 ? 0 : canceledOrders / totalOrders;
    const totalCommission = Number(t.total_commission ?? BigInt(0));

    return {
      days,
      ordersPerDay: ordersPerDay.map((r) => ({ date: r.day.toISOString().slice(0, 10), count: Number(r.count) })),
      totalCommission,
      cancellationRate,
      avgPickupEtaMin: t.avg_pickup_eta_min,
    };
  }
}
