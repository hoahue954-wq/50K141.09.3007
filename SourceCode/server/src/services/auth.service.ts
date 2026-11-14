import { ProfileStatus } from '@prisma/client';
import { supabaseAuth } from '../config/supabase.js';
import { profileRepository } from '../repositories/profile.repository.js';
import { AppError } from '../utils/AppError.js';
import type { ApiUserProfile, AuthenticatedProfile } from '../types/auth.js';

interface CachedUser {
  id: string;
  expiresAt: number;
}

const userCache = new Map<string, CachedUser>();

function getTokenExp(token: string): number | null {
  try {
    const parts = token.split('.');
    const part1 = parts[1];
    if (!part1 || parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(part1, 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function isTransientSupabaseError(error: any): boolean {
  if (!error) return false;
  const status = error.status;
  if (typeof status === 'number' && status >= 500) return true;
  if (status === 0) return true;
  if (error.name === 'AuthRetryableFetchError' || error.name === 'FetchError') return true;
  const msg = String(error.message || '').toLowerCase();
  if (
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset')
  ) {
    return true;
  }
  return false;
}

export const authService = {
  // Phương thức xóa cache phục vụ kiểm thử
  _clearUserCache(): void {
    userCache.clear();
  },

  async authenticate(accessToken: string): Promise<AuthenticatedProfile> {
    const now = Date.now();
    let supabaseUser: { id: string } | null = null;

    // 1. Kiểm tra cache ngắn (30s)
    const cached = userCache.get(accessToken);
    if (cached) {
      if (cached.expiresAt > now) {
        supabaseUser = { id: cached.id };
      } else {
        userCache.delete(accessToken);
      }
    }

    if (!supabaseUser) {
      let data: any = null;
      let error: any = null;

      try {
        const res = await supabaseAuth.auth.getUser(accessToken);
        data = res.data;
        error = res.error;
      } catch (err) {
        error = err;
      }

      // Lỗi tạm thời (mạng chập chờn, timeout, 5xx): thử lại 1 lần sau ~300ms
      if (isTransientSupabaseError(error)) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        try {
          const retryRes = await supabaseAuth.auth.getUser(accessToken);
          data = retryRes.data;
          error = retryRes.error;
        } catch (retryErr) {
          error = retryErr;
        }
      }

      // Sau khi thử lại nếu vẫn là lỗi tạm thời: ném 503 AUTH_UNAVAILABLE
      if (isTransientSupabaseError(error)) {
        throw new AppError(503, 'Hệ thống đang bận, vui lòng thử lại.', 'AUTH_UNAVAILABLE');
      }

      // Chỉ ném 401 khi Supabase báo token thật sự không hợp lệ hoặc hết hạn
      if (error || !data?.user) {
        throw new AppError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.', 'AUTH_INVALID');
      }

      supabaseUser = data.user;

      // Lưu cache kết quả thành công (tối đa 30s và không vượt quá exp của token)
      const tokenExp = getTokenExp(accessToken);
      const maxTtlMs = 30 * 1000;
      const ttlMs = tokenExp ? Math.min(maxTtlMs, Math.max(0, tokenExp - now)) : maxTtlMs;
      if (ttlMs > 0) {
        userCache.set(accessToken, { id: data.user.id, expiresAt: now + ttlMs });
        if (userCache.size > 500) {
          for (const [key, val] of userCache.entries()) {
            if (val.expiresAt <= now) userCache.delete(key);
          }
        }
      }
    }

    if (!supabaseUser) {
      throw new AppError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.', 'AUTH_INVALID');
    }

    const profile = await profileRepository.findAuthProfileById(supabaseUser.id);

    if (!profile) {
      throw new AppError(403, 'Tài khoản chưa được cấp quyền truy cập hệ thống.', 'PROFILE_NOT_FOUND');
    }

    if (profile.status !== ProfileStatus.ACTIVE) {
      throw new AppError(403, 'Tài khoản đã bị khóa. Vui lòng liên hệ Chủ cửa hàng.', 'ACCOUNT_LOCKED');
    }

    return profile;
  },

  toApiProfile(profile: AuthenticatedProfile): ApiUserProfile {
    return {
      id: profile.id,
      username: profile.username,
      full_name: profile.fullName,
      role: profile.role.code === 'OWNER' ? 'owner' : 'staff',
      status: profile.status === 'ACTIVE' ? 'active' : 'locked',
      created_at: profile.createdAt.toISOString(),
    };
  },
};
