import { z } from 'zod';

const dateValue = z.string().trim().min(1).refine((value) => {
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  const parsed = isDate ? new Date(`${value}T00:00:00Z`) : hasTimezone ? new Date(value) : new Date(NaN);
  return !Number.isNaN(parsed.getTime()) &&
    (!isDate || parsed.toISOString().slice(0, 10) === value);
}, 'Ngày không hợp lệ.');

const inventoryTransactionTypes = [
  'IMPORT', 'SALE', 'RETURN', 'DISPOSAL', 'ADJUSTMENT',
  'import', 'sale', 'return', 'disposal', 'adjustment',
] as const;

export const inventoryQuerySchema = z.object({
  search: z.string().trim().optional(),
  category_id: z.string().uuid('Danh mục không hợp lệ.').optional(),
});

export const inventoryTransactionQuerySchema = z.object({
  product_id: z.string().uuid('Sản phẩm không hợp lệ.').optional(),
  barcode: z.string().trim().min(1).optional(),
  type: z.enum(inventoryTransactionTypes).transform((value) => value.toUpperCase()).optional(),
  date: dateValue.optional(),
  start_date: dateValue.optional(),
  end_date: dateValue.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export type InventoryQuery = z.infer<typeof inventoryQuerySchema>;
export type InventoryTransactionQuery = z.infer<typeof inventoryTransactionQuerySchema>;
