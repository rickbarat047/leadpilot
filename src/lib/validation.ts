import { z } from 'zod';
import { businessHoursSchema } from './business-hours';

export const signupSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email().max(160),
  password: z.string().min(8).max(128),
  businessName: z.string().min(1).max(120).optional(),
});
export const loginSchema = z.object({
  email: z.string().email(), password: z.string().min(1),
});
export const leadSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(160).optional().or(z.literal('')),
  phone: z.string().max(40).optional().default(''),
  source: z.string().max(40).optional().default('website'),
  service: z.string().max(120).optional().default(''),
  message: z.string().max(4000).optional().default(''),
});
export const messageSchema = z.object({ body: z.string().min(1).max(4000) });
export const businessSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  industry: z.string().max(80).optional(),
  description: z.string().max(2000).optional(),
  location: z.string().max(200).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().max(160).optional(),
  website: z.string().max(200).optional(),
  hours: businessHoursSchema.optional(),
  settings: z.record(z.unknown()).optional(),
});
