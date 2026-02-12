import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TruckType, DriverStatus, UserStatus, VehicleStatus } from '@prisma/client';

type LatLng = { lat: number; lng: number };

@Injectable()
export class MatchingService {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  async setDriverOnline(input: { driverId: string; cityId: string; isOnline: boolean }) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { ownerId: input.driverId, status: VehicleStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
    });
    if (!vehicle) throw new Error('No active vehicle');

    const key = onlineSetKey(input.cityId, vehicle.truckType);
    if (input.isOnline) {
      await this.redis.sadd(key, input.driverId);
    } else {
      await this.redis.srem(key, input.driverId);
    }
    return { ok: true, truckType: vehicle.truckType };
  }

  async updateDriverLocation(input: { driverId: string; cityId: string; lat: number; lng: number }) {
    await this.redis.hset(locKey(input.driverId), { lat: String(input.lat), lng: String(input.lng), ts: String(Date.now()) });
    return { ok: true };
  }

  /**
   * Match eligible online drivers for an order. This is a simplified MVP matching:
   * - same city + truckType
   * - driver eligibility (approved, not suspended/banned)
   * - has ACTIVE vehicle with >=3 photos and capacity >= weight
   * - best-effort nearby filtering using last known location in Redis
   */
  async matchOrder(input: {
    cityId: string;
    truckType: TruckType;
    weightKg: number;
    pickup: LatLng;
    limit?: number;
  }) {
    const limit = input.limit ?? 10;
    const onlineIds = await this.redis.smembers(onlineSetKey(input.cityId, input.truckType));
    if (onlineIds.length === 0) return [];

    // Fetch candidates in one DB query.
    const candidates = await this.prisma.user.findMany({
      where: {
        id: { in: onlineIds },
        role: 'DRIVER',
        status: UserStatus.ACTIVE,
        driverProfile: { is: { status: DriverStatus.APPROVED } },
        vehicles: {
          some: {
            status: VehicleStatus.ACTIVE,
            truckType: input.truckType,
            capacityKg: { gte: input.weightKg },
            photos: { some: {} },
          },
        },
      },
      select: { id: true, vehicles: { where: { status: VehicleStatus.ACTIVE }, select: { id: true, capacityKg: true, truckType: true, photos: { select: { id: true } } } } },
    });

    // Enforce >=3 photos
    const eligible = candidates.filter((c) => c.vehicles.some((v) => v.truckType === input.truckType && v.capacityKg >= input.weightKg && v.photos.length >= 3));

    const withDistance: Array<{ id: string; distanceKm: number }> = [];
    for (const d of eligible) {
      const loc = await this.redis.hgetall(locKey(d.id));
      if (!loc.lat || !loc.lng) continue;
      const dist = haversineKm(input.pickup.lat, input.pickup.lng, parseFloat(loc.lat), parseFloat(loc.lng));
      withDistance.push({ id: d.id, distanceKm: dist });
    }

    withDistance.sort((a, b) => a.distanceKm - b.distanceKm);
    return withDistance.slice(0, limit).map((x) => x.id);
  }
}

function onlineSetKey(cityId: string, truckType: TruckType) {
  return `naqlo:online:${cityId}:${truckType}`;
}

function locKey(driverId: string) {
  return `naqlo:loc:${driverId}`;
}

// Haversine distance in km
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
