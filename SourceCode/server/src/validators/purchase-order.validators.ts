import { z } from 'zod';

const dateValue = z.string().trim().min(1).refine((value) => {
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  const parsed = isDate ? new Date(`${value}T00:00:00Z`) : hasTimezone ? new Date(value) : new Date(NaN);
  return !Number.isNaN(parsed.getTime()) &&
    (!isDate || parsed.toISOString().slice(0, 10) === value);
}, 'Ngày không hợp lệ.');

const purchaseOrderItemSchema = z
  .object({
    product_id: z.string().uuid('Sản phẩm không hợp lệ.').optional(),
    barcode: z.string().trim().min(1).optional(),
    product_barcode: z.string().trim().min(1).optional(),
    product_name: z.string().trim().optional(),
    quantity: z.coerce.number().int('Số lượng phải là số nguyên.').positive('Số lượng phải lớn hơn 0.'),
    import_price: z.coerce.number().finite().positive('Giá nhập phải lớn hơn 0.').optional(),
    cost_price: z.coerce.number().finite().positive('Giá nhập phải lớn hơn 0.').optional(),
  })
  .refine((item) => Boolean(item.product_id || item.barcode || item.product_barcode), {
    message: 'Mỗi dòng hàng cần có product_id hoặc mã vạch.',
  })
  .refine((item) => !item.barcode || !item.product_barcode || item.barcode === item.product_barcode, {
    message: 'Mã vạch sản phẩm không khớp.',
  })
  .refine((item) => item.import_price !== undefined || item.cost_price !== undefined, {
    message: 'Vui lòng nhập giá nhập.',
  })
  .transform((item) => ({
    ...item,
    import_price: item.import_price ?? item.cost_price!,
  }));

const purchaseOrderFields = {
  code: z.string().trim().optional(),
  order_date: dateValue.optional(),
  supplier_name: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  note: z.string().trim().optional(),
  items: z.array(purchaseOrderItemSchema).min(1, 'Phiếu nhập phải có ít nhất một sản phẩm.'),
};

export const createPurchaseOrderSchema = z.object(purchaseOrderFields);
export const updatePurchaseOrderSchema = z.object({
  supplier_name: purchaseOrderFields.supplier_name,
  notes: purchaseOrderFields.notes,
  note: purchaseOrderFields.note,
  items: purchaseOrderFields.items,
});

const dateQuery = dateValue.optional();
const statusValue = z.enum(['SAVED', 'COMPLETED', 'saved', 'completed'])
  .transform((value) => value.toUpperCase() as 'SAVED' | 'COMPLETED');

export const purchaseOrderListQuerySchema = z.object({
  date: dateQuery,
  start_date: dateQuery,
  end_date: dateQuery,
  status: statusValue.optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export type PurchaseOrderItemInput = z.infer<typeof purchaseOrderItemSchema>;
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>;
export type PurchaseOrderListQuery = z.infer<typeof purchaseOrderListQuerySchema>;
