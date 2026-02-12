import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TruckType } from '@prisma/client';

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compute an estimated fare using the current PricingProfile.
   * distanceKm is rounded to 0.1km.
   */
  async estimate(input: {
    cityId: string;
    truckType: TruckType;
    weightKg: number;
    pickupLat: number;
    pickupLng: number;
    dropoffLat: number;
    dropoffLng: number;
  }) {
    const profile = await this.prisma.pricingProfile.findUnique({
      where: { cityId_truckType: { cityId: input.cityId, truckType: input.truckType } },
    });
    if (!profile) throw new NotFoundException('Pricing profile not found');

    const distanceKm = round1(haversineKm(input.pickupLat, input.pickupLng, input.dropoffLat, input.dropoffLng));
    const raw = profile.baseFee + Math.round(distanceKm * profile.rateKm) + input.weightKg * profile.rateKg;
    const clamped = clampInt(raw, profile.minFare, profile.maxFare);
    return {
      profile,
      distanceKm,
      estimatedFare: clamped,
    };
  }
}

function clampInt(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function round1(v: number) {
  return Math.round(v * 10) / 10;
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
