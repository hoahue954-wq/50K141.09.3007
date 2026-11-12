import { ProfileStatus } from '@prisma/client';
import { supabaseAuth } from '../config/supabase.js';
import { profileRepository } from '../repositories/profile.repository.js';
import { AppError } from '../utils/AppError.js';
import type { ApiUserProfile, AuthenticatedProfile } from '../types/auth.js';

export const authService = {
  async authenticate(accessToken: string): Promise<AuthenticatedProfile> {
    const { data, error } = await supabaseAuth.auth.getUser(accessToken);

    if (error || !data.user) {
      throw new AppError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.', 'AUTH_INVALID');
    }

    const profile = await profileRepository.findAuthProfileById(data.user.id);

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
