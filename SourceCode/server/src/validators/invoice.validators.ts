import { z } from 'zod';

const invoiceItemSchema = z
  .object({
    product_id: z.string().uuid().optional(),
    barcode: z.string().trim().min(1).optional(),
    product_barcode: z.string().trim().min(1).optional(),
    quantity: z.coerce.number().int('Số lượng phải là số nguyên.').positive('Số lượng phải lớn hơn 0.'),
  })
  .refine((item) => Boolean(item.product_id || item.barcode || item.product_barcode), {
    message: 'Mỗi dòng hàng cần có product_id hoặc barcode.',
  });

const amountReceivedSchema = z.coerce.number().finite().nonnegative();

export const createInvoiceSchema = z
  .object({
    items: z.array(invoiceItemSchema).min(1, 'Hóa đơn phải có ít nhất một sản phẩm.'),
    payment_method: z.enum(['CASH', 'TRANSFER', 'DEBT', 'cash', 'transfer', 'debt'])
      .transform((value) => value.toUpperCase() as 'CASH' | 'TRANSFER' | 'DEBT'),
    amount_received: amountReceivedSchema.optional(),
    cash_given: amountReceivedSchema.optional(),
    customer_id: z.string().uuid('Khách hàng không hợp lệ.').optional(),
    customer_name: z.string().trim().optional(),
  })
  .transform((value) => ({
    ...value,
    amount_received: value.amount_received ?? value.cash_given,
  }));

export const invoiceListQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải theo định dạng YYYY-MM-DD.')
    .refine((value) => {
      const date = new Date(`${value}T00:00:00+07:00`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }, 'Ngày không hợp lệ.')
    .optional(),
  status: z.enum(['PAID', 'UNPAID', 'paid', 'unpaid']).optional(),
  payment_method: z.enum(['CASH', 'TRANSFER', 'DEBT', 'cash', 'transfer', 'debt']).optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const settleInvoiceSchema = z
  .object({
    amount_received: amountReceivedSchema.optional(),
    payment_method: z.enum(['CASH', 'TRANSFER', 'cash', 'transfer']),
  })
  .transform((value) => ({
    ...value,
    payment_method: value.payment_method.toUpperCase() as 'CASH' | 'TRANSFER',
  }));

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;
export type SettleInvoiceInput = z.infer<typeof settleInvoiceSchema>;
