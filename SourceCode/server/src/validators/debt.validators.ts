import { z } from 'zod';

const amountSchema = z.coerce
  .number()
  .finite('Số tiền không hợp lệ.')
  .positive('Số tiền phải lớn hơn 0.')
  .max(9_999_999_999.99, 'Số tiền vượt giới hạn cho phép.');

export const createDebtSchema = z.object({
  customer_id: z.string().uuid('Khách hàng không hợp lệ.'),
  amount: amountSchema,
  invoice_id: z.string().uuid('Hóa đơn không hợp lệ.').optional(),
  note: z.string().trim().max(1000).optional(),
});

export const createDebtPaymentSchema = z.object({
  customer_id: z.string().uuid('Khách hàng không hợp lệ.'),
  amount: amountSchema,
  payment_method: z.enum(['CASH', 'TRANSFER', 'cash', 'transfer'])
    .transform((value) => value.toUpperCase() as 'CASH' | 'TRANSFER'),
  note: z.string().trim().max(1000).optional(),
});

export const debtListQuerySchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export type CreateDebtInput = z.infer<typeof createDebtSchema>;
export type CreateDebtPaymentInput = z.infer<typeof createDebtPaymentSchema>;
export type DebtListQuery = z.infer<typeof debtListQuerySchema>;
