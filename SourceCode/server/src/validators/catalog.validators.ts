import { z } from 'zod';

const nonEmptyString = (label: string) =>
  z.string().trim().min(1, `${label} không được để trống.`);
const categoryFields = {
  name: nonEmptyString('Tên danh mục'),
  description: z.string().trim().optional(),
};

export const categoryCreateSchema = z.object(categoryFields).strict();
export const categoryUpdateSchema = z
  .object({
    name: categoryFields.name.optional(),
    description: categoryFields.description,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Vui lòng cung cấp thông tin cần cập nhật.');

const positivePrice = z.coerce.number().finite().positive('Giá bán phải là số lớn hơn 0.');
const positiveCostPrice = z.coerce.number().finite().positive('Giá nhập phải là số lớn hơn 0.');
const nonnegativeInteger = z.coerce.number().int().nonnegative();
const zeroOpeningStock = z.coerce.number().int().refine(
  (value) => value === 0,
  'Tồn kho ban đầu phải bằng 0; hãy sử dụng phiếu nhập hàng.',
);

const productImageUrl = z
  .string()
  .trim()
  .refine(
    (value) => {
      if (!value) return true;
      try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    },
    'Đường dẫn ảnh phải là URL hợp lệ bắt đầu bằng http:// hoặc https://.'
  )
  .optional()
  .or(z.literal(''));

export const productCreateSchema = z.object({
  barcode: z.string().trim().regex(/^\d{13}$/, 'Mã vạch phải gồm đúng 13 chữ số.'),
  name: nonEmptyString('Tên sản phẩm'),
  category_id: z.string().uuid('Danh mục không hợp lệ.'),
  category_name: z.string().trim().optional(),
  cost_price: positiveCostPrice,
  selling_price: positivePrice,
  unit: nonEmptyString('Đơn vị tính'),
  stock_quantity: zeroOpeningStock.optional(),
  min_stock: nonnegativeInteger.default(0),
  image_url: productImageUrl,
});

export const productUpdateSchema = z
  .object({
    barcode: z.string().trim().regex(/^\d{13}$/, 'Mã vạch phải gồm đúng 13 chữ số.').optional(),
    name: nonEmptyString('Tên sản phẩm').optional(),
    category_id: z.string().uuid('Danh mục không hợp lệ.').optional(),
    category_name: z.string().trim().optional(),
    cost_price: positiveCostPrice,
    selling_price: positivePrice.optional(),
    unit: nonEmptyString('Đơn vị tính').optional(),
    stock_quantity: z.never().optional(),
    min_stock: nonnegativeInteger.optional(),
    image_url: productImageUrl,
  })
  .refine((value) => Object.keys(value).length > 0, 'Vui lòng cung cấp thông tin cần cập nhật.');

export const catalogSearchSchema = z.object({
  search: z.string().trim().optional(),
  category_id: z.string().uuid('Danh mục không hợp lệ.').optional(),
});

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
