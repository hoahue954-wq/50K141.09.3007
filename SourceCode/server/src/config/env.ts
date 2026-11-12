import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL chưa được cấu hình'),
  SUPABASE_URL: z.string().url('SUPABASE_URL không hợp lệ'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY chưa được cấu hình'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  EVIDENCE_STORAGE_BUCKET: z.string().trim().min(1).default('slip-evidence'),
  PORT: z.coerce.number().int().positive().default(3000),
  FRONTEND_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean)),
  DEFAULT_MIN_STOCK: z.coerce.number().int().nonnegative().default(5),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const issues = parsedEnv.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Cấu hình môi trường không hợp lệ: ${issues}`);
}

export const env = parsedEnv.data;
