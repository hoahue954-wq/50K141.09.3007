import { z } from 'zod';

export const customerListQuerySchema = z.object({
  search: z.string().trim().optional(),
  is_regular: z.enum(['true', 'false']).optional(),
  type: z.enum(['loyal', 'guest']).optional(),
});

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1, 'Tên khách hàng không được để trống.'),
  phone: z.string().trim().optional(),
  type: z.enum(['loyal', 'guest']).optional(),
  is_regular: z.boolean().optional(),
  notes: z.string().trim().optional(),
});

export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
