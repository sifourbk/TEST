import { z } from 'zod';

export const RequestOtpSchema = z.object({
  phone: z.string().min(6),
});

export const VerifyOtpSchema = z.object({
  phone: z.string().min(6),
  otp: z.string().min(4),
  role: z.enum(['CUSTOMER', 'DRIVER', 'ADMIN']).optional(),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(10),
});
