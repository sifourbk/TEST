import { z } from 'zod';
import { TruckType } from '@prisma/client';
import { OrderStatus } from '@prisma/client';

export const CreateOrderSchema = z.object({
  cityId: z.string().min(1),
  pickup: z.object({ lat: z.number().finite(), lng: z.number().finite() }),
  dropoff: z.object({ lat: z.number().finite(), lng: z.number().finite() }),
  weightKg: z.number().int().positive(),
  truckType: z.nativeEnum(TruckType),
});

export const CreateOfferSchema = z.object({
  amount: z.number().int().positive(),
});

export const AcceptOfferSchema = z.object({
  offerId: z.string().min(1),
});

export const SetOnlineSchema = z.object({
  cityId: z.string().min(1),
  isOnline: z.boolean(),
});

export const UpdateLocationSchema = z.object({
  lat: z.number().finite(),
  lng: z.number().finite(),
  accuracy: z.number().finite().optional(),
  timestamp: z.number().int().optional(),
});

export const DriverSetStatusSchema = z.object({
  status: z.enum([
    OrderStatus.EN_ROUTE,
    OrderStatus.ARRIVED,
    OrderStatus.LOADING,
    OrderStatus.IN_TRANSIT,
    OrderStatus.CANCELED,
  ] as const),
});

export const DeliverWithPinSchema = z.object({
  pin: z.string().regex(/^\d{4}$/),
});
