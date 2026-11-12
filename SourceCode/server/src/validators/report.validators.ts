import { z } from 'zod';

const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải theo định dạng YYYY-MM-DD.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Ngày không hợp lệ.');

export const reportRangeSchema = z.object({
  from: dateSchema,
  to: dateSchema,
  group_by: z.enum(['day', 'week', 'month']).default('day'),
}).refine((value) => value.from <= value.to, {
  path: ['to'],
  message: 'Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.',
});

export const dailyReportSchema = z.object({ date: dateSchema });

export const monthlyReportSchema = z.object({
  year: z.coerce.number().int().min(2000).max(9999),
  month: z.coerce.number().int().min(1).max(12),
});

export type ReportRangeQuery = z.infer<typeof reportRangeSchema>;
