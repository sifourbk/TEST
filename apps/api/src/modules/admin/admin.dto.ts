import { z } from 'zod';

export const CityCreateSchema = z.object({
  name: z.string().min(2),
  isActive: z.boolean().optional(),
});

export const CityUpdateSchema = CityCreateSchema.partial();

export const ZoneCreateSchema = z.object({
  cityId: z.string().min(1),
  name: z.string().min(2),
  polygon: z.any(), // GeoJSON Polygon
});

export const ZoneUpdateSchema = ZoneCreateSchema.partial();

export const PricingCreateSchema = z.object({
  cityId: z.string().min(1),
  truckType: z.enum(['MINI','SMALL','MEDIUM','LARGE']),
  baseFee: z.number().int().nonnegative(),
  rateKm: z.number().nonnegative(),
  rateKg: z.number().nonnegative(),
  minFare: z.number().int().nonnegative(),
  maxFare: z.number().int().nonnegative(),
  negotiateMinPct: z.number().min(0).max(1),
  negotiateMaxPct: z.number().min(0).max(1),
  offerTimeoutSec: z.number().int().positive(),
  maxCountersPerSide: z.number().int().positive(),
});
export const PricingUpdateSchema = PricingCreateSchema.partial();

export const CommissionCreateSchema = z.object({
  cityId: z.string().min(1),
  truckType: z.enum(['MINI','SMALL','MEDIUM','LARGE']),
  percent: z.number().min(0).max(1),
  minCommission: z.number().int().nonnegative(),
  fixedFee: z.number().int().nonnegative().optional(),
});
export const CommissionUpdateSchema = CommissionCreateSchema.partial();
