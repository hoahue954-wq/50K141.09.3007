import { z } from 'zod';

const itemSchema = z
  .object({
    product_id: z.string().uuid('Sản phẩm không hợp lệ.').optional(),
    barcode: z.string().trim().min(1).optional(),
    product_barcode: z.string().trim().min(1).optional(),
    quantity: z.coerce.number().int('Số lượng phải là số nguyên.').positive('Số lượng phải lớn hơn 0.'),
  })
  .refine((item) => Boolean(item.product_id || item.barcode || item.product_barcode), {
    message: 'Mỗi dòng hàng cần có product_id hoặc mã vạch.',
  })
  .refine((item) => !item.barcode || !item.product_barcode || item.barcode === item.product_barcode, {
    message: 'Mã vạch sản phẩm không khớp.',
  });

const evidenceSchema = z.string().trim().min(1, 'Minh chứng là bắt buộc.');

const disposalFields = {
  reason: z.string().trim().min(1, 'Lý do hủy là bắt buộc.'),
  proof_image_url: evidenceSchema.optional(),
  evidence_url: evidenceSchema.optional(),
  items: z.array(itemSchema).min(1, 'Phiếu hủy phải có ít nhất một sản phẩm.'),
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

export const createDisposalSchema = z.object(disposalFields).transform(normalizeEvidence);
export const updateDisposalSchema = z.object(disposalFields).transform(normalizeEvidence);

const dateSchema = z.string().trim().min(1).refine((value) => {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  const parsed = dateOnly ? new Date(`${value}T00:00:00Z`) : hasTimezone ? new Date(value) : new Date(NaN);
  return !Number.isNaN(parsed.getTime()) &&
    (!dateOnly || parsed.toISOString().slice(0, 10) === value);
}, 'Ngày không hợp lệ.').optional();

export const disposalListQuerySchema = z.object({
  date: dateSchema,
  start_date: dateSchema,
  end_date: dateSchema,
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'pending', 'approved', 'rejected'])
    .transform((value) => value.toUpperCase() as 'PENDING' | 'APPROVED' | 'REJECTED')
    .optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export type DisposalItemInput = z.infer<typeof itemSchema>;
export type CreateDisposalInput = z.infer<typeof createDisposalSchema>;
export type UpdateDisposalInput = z.infer<typeof updateDisposalSchema>;
export type DisposalListQuery = z.infer<typeof disposalListQuerySchema>;
