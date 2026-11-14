import { z } from 'zod';

const itemSchema = z
  .object({
    product_id: z.string().uuid('Sản phẩm không hợp lệ.').optional(),
    barcode: z.string().trim().min(1).optional(),
    product_barcode: z.string().trim().min(1).optional(),
    quantity: z.coerce.number().int('Số lượng phải là số nguyên.').positive('Số lượng phải lớn hơn 0.'),
    selling_price: z.coerce.number().finite().nonnegative().optional(),
  })
  .refine((item) => Boolean(item.product_id || item.barcode || item.product_barcode), {
    message: 'Mỗi dòng hàng cần có product_id hoặc mã vạch.',
  })
  .refine((item) => !item.barcode || !item.product_barcode || item.barcode === item.product_barcode, {
    message: 'Mã vạch sản phẩm không khớp.',
  });

const evidenceSchema = z.string().trim().min(1, 'Minh chứng là bắt buộc.');
const typeSchema = z.enum(['RETURN', 'EXCHANGE', 'return', 'exchange'])
  .transform((value) => value.toUpperCase() as 'RETURN' | 'EXCHANGE');
const reasonSchema = z.string().trim().min(1, 'Lý do đổi/trả là bắt buộc.');
const evidenceFields = {
  proof_image_url: evidenceSchema.optional(),
  evidence_url: evidenceSchema.optional(),
};

function normalizeEvidence<T extends { proof_image_url?: string; evidence_url?: string }>(
  value: T,
  context: z.RefinementCtx,
): T & { proof_image_url: string } {
  const proofImageUrl = value.proof_image_url ?? value.evidence_url;
  if (!proofImageUrl) {
    context.addIssue({
      code: 'custom',
      path: ['proof_image_url'],
      message: 'Minh chứng là bắt buộc.',
    });
    return z.NEVER;
  }
  return { ...value, proof_image_url: proofImageUrl };
}

export const createReturnSchema = z
  .object({
    invoice_id: z.string().uuid('Hóa đơn không hợp lệ.').optional(),
    invoice_code: z.string().trim().min(1).optional(),
    original_invoice_code: z.string().trim().min(1).optional(),
    type: typeSchema,
    reason: reasonSchema,
    ...evidenceFields,
    items: z.array(itemSchema).min(1, 'Phiếu đổi/trả phải có ít nhất một sản phẩm trả.'),
    exchange_items: z.array(itemSchema).optional(),
  })
  .refine((value) => Boolean(value.invoice_id || value.invoice_code || value.original_invoice_code), {
    message: 'Cần cung cấp mã hóa đơn hoặc invoice_id.',
    path: ['invoice_id'],
  })
  .superRefine((value, context) => {
    if (value.type === 'EXCHANGE' && !value.exchange_items?.length) {
      context.addIssue({
        code: 'custom',
        path: ['exchange_items'],
        message: 'Phiếu đổi hàng cần có ít nhất một sản phẩm đổi.',
      });
    }
    if (value.type === 'RETURN' && value.exchange_items?.length) {
      context.addIssue({
        code: 'custom',
        path: ['exchange_items'],
        message: 'Phiếu chỉ trả hàng không được có sản phẩm đổi.',
      });
    }
  })
  .transform(normalizeEvidence);

export const updateReturnSchema = z
  .object({
    type: typeSchema.optional(),
    reason: reasonSchema,
    ...evidenceFields,
    items: z.array(itemSchema).min(1, 'Phiếu đổi/trả phải có ít nhất một sản phẩm trả.'),
    exchange_items: z.array(itemSchema).optional(),
  })
  .superRefine((value, context) => {
    if (value.type === 'EXCHANGE' && !value.exchange_items?.length) {
      context.addIssue({
        code: 'custom',
        path: ['exchange_items'],
        message: 'Phiếu đổi hàng cần có ít nhất một sản phẩm đổi.',
      });
    }
    if (value.type === 'RETURN' && value.exchange_items?.length) {
      context.addIssue({
        code: 'custom',
        path: ['exchange_items'],
        message: 'Phiếu chỉ trả hàng không được có sản phẩm đổi.',
      });
    }
  });

const dateSchema = z.string().trim().min(1).refine((value) => {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  const parsed = dateOnly ? new Date(`${value}T00:00:00Z`) : hasTimezone ? new Date(value) : new Date(NaN);
  return !Number.isNaN(parsed.getTime()) &&
    (!dateOnly || parsed.toISOString().slice(0, 10) === value);
}, 'Ngày không hợp lệ.').optional();

export const returnListQuerySchema = z.object({
  date: dateSchema,
  start_date: dateSchema,
  end_date: dateSchema,
  type: typeSchema.optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'pending', 'approved', 'rejected'])
    .transform((value) => value.toUpperCase() as 'PENDING' | 'APPROVED' | 'REJECTED')
    .optional(),
  search: z.string().trim().optional(),
  invoice_code: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export type ReturnItemInput = z.infer<typeof itemSchema>;
export type CreateReturnInput = z.infer<typeof createReturnSchema>;
export type UpdateReturnInput = z.infer<typeof updateReturnSchema>;
export type ReturnListQuery = z.infer<typeof returnListQuerySchema>;
