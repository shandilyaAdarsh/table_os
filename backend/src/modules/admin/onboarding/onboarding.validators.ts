import { z } from 'zod';

export const RestaurantInfoSchema = z.object({
  display_name: z.string().min(1, 'Display name is required').max(255),
  city: z.string().min(1, 'City is required').max(100),
  state: z.string().min(1, 'State is required').max(100),
  full_address: z.string().min(1, 'Full address is required'),
  timezone: z.string().refine((tz) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch (e) {
      return false;
    }
  }, { message: 'Invalid IANA timezone identifier (e.g., America/New_York or Asia/Kolkata)' }),
});
export const BusinessConfigSchema = z.object({
  currency_code: z.string().length(3, 'Currency code must be exactly 3 characters (e.g. USD)'),
  business_type: z.string().min(1, 'Business type is required').max(50).optional().nullable(),
  tax_registration_number: z.string().max(100).optional().nullable(),
});

export const GstLegalConfigSchema = z.object({
  gstin: z.string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}$/, 'Invalid GSTIN format')
    .optional()
    .nullable()
    .or(z.literal('')),
  fssai_license_number: z.string().regex(/^[0-9]{14}$/, 'FSSAI License must be exactly 14 digits'),
  gst_type: z.enum(['Intra-state', 'Inter-state', 'Composition Scheme', 'Non-GST Registered']),
  default_tax_rate: z.number().min(0).max(100),
  cgst_rate: z.number().min(0).max(100).optional().default(0),
  sgst_rate: z.number().min(0).max(100).optional().default(0),
  igst_rate: z.number().min(0).max(100).optional().default(0),
});

export const TablesHoursConfigSchema = z.object({
  number_of_tables: z.number().int().min(1).max(500),
  table_prefix: z.string().min(1).max(10),
  opening_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]( [AP]M)?$/, 'Invalid opening time format'),
  closing_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]( [AP]M)?$/, 'Invalid closing time format'),
});

