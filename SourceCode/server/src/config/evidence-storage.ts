import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { env } from './env.js';
import { AppError } from '../utils/AppError.js';

const MAX_EVIDENCE_BYTES = 2 * 1024 * 1024;
const allowedTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);

let storageClient: SupabaseClient | undefined;

function getStorageClient(): SupabaseClient {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AppError(503, 'Chưa cấu hình khóa lưu trữ minh chứng trên máy chủ.', 'EVIDENCE_STORAGE_NOT_CONFIGURED');
  }
  storageClient ??= createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  return storageClient;
}

function parseDataUrl(dataUrl: string): { contentType: string; extension: string; data: Buffer } {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) {
    throw new AppError(400, 'Minh chứng phải là ảnh được gửi dưới dạng data URL hợp lệ.', 'INVALID_EVIDENCE');
  }
  const contentType = match[1]!.toLowerCase();
  const extension = allowedTypes.get(contentType);
  if (!extension) {
    throw new AppError(400, 'Định dạng ảnh minh chứng chỉ hỗ trợ JPEG, PNG, WebP hoặc GIF.', 'UNSUPPORTED_EVIDENCE_TYPE');
  }

  const data = Buffer.from(match[2]!, 'base64');
  if (data.length === 0 || data.length > MAX_EVIDENCE_BYTES) {
    throw new AppError(400, 'Ảnh minh chứng không được vượt quá 2 MB.', 'EVIDENCE_TOO_LARGE');
  }
  return { contentType, extension, data };
}

export const evidenceStorage = {
  async upload(dataUrl: string, type: 'disposals' | 'returns', userId: string): Promise<string> {
    const { contentType, extension, data } = parseDataUrl(dataUrl);
    const path = `${type}/${userId}/${randomUUID()}.${extension}`;
    const { error } = await getStorageClient()
      .storage
      .from(env.EVIDENCE_STORAGE_BUCKET)
      .upload(path, data, { contentType, upsert: false });
    if (error) {
      throw new AppError(502, 'Không thể lưu ảnh minh chứng vào Supabase Storage.', 'EVIDENCE_UPLOAD_FAILED');
    }
    return path;
  },

  async createSignedUrl(path: string): Promise<string> {
    const { data, error } = await getStorageClient()
      .storage
      .from(env.EVIDENCE_STORAGE_BUCKET)
      .createSignedUrl(path, 60 * 60);
    if (error || !data?.signedUrl) {
      throw new AppError(502, 'Không thể tạo liên kết xem ảnh minh chứng.', 'EVIDENCE_URL_FAILED');
    }
    return data.signedUrl;
  },

  async remove(path: string): Promise<void> {
    const { error } = await getStorageClient()
      .storage
      .from(env.EVIDENCE_STORAGE_BUCKET)
      .remove([path]);
    if (error) {
      throw new AppError(502, 'Không thể xóa ảnh minh chứng tạm trên Supabase Storage.', 'EVIDENCE_CLEANUP_FAILED');
    }
  },
};
