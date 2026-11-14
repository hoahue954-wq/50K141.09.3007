import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { ProfileStatus, RoleCode } from '@prisma/client';
import { supabaseAuth } from '../src/config/supabase.js';
import { profileRepository } from '../src/repositories/profile.repository.js';
import { authService } from '../src/services/auth.service.js';
import { AppError } from '../src/utils/AppError.js';
import type { AuthenticatedProfile } from '../src/types/auth.js';

const mockProfile: AuthenticatedProfile = {
  id: 'user-123',
  username: 'staff1',
  fullName: 'Nhân viên 1',
  status: ProfileStatus.ACTIVE,
  createdAt: new Date(),
  role: {
    id: 'role-1',
    code: RoleCode.STAFF,
    name: 'Nhân viên',
  },
};

const originalGetUser = supabaseAuth.auth.getUser.bind(supabaseAuth.auth);
const originalFindAuthProfile = profileRepository.findAuthProfileById.bind(profileRepository);

beforeEach(() => {
  authService._clearUserCache();
  profileRepository.findAuthProfileById = (async () => mockProfile) as any;
});

afterEach(() => {
  supabaseAuth.auth.getUser = originalGetUser;
  profileRepository.findAuthProfileById = originalFindAuthProfile;
  authService._clearUserCache();
});

test('authenticate returns 401 AUTH_INVALID when Supabase reports invalid or expired token', async () => {
  supabaseAuth.auth.getUser = async () => ({
    data: { user: null },
    error: {
      status: 401,
      name: 'AuthApiError',
      message: 'invalid JWT',
    } as any,
  });

  await assert.rejects(
    () => authService.authenticate('invalid-token'),
    (err: unknown) =>
      err instanceof AppError &&
      err.statusCode === 401 &&
      err.code === 'AUTH_INVALID',
  );
});

test('authenticate retries and returns 503 AUTH_UNAVAILABLE on Supabase 5xx error', async () => {
  let callCount = 0;
  supabaseAuth.auth.getUser = async () => {
    callCount++;
    return {
      data: { user: null },
      error: {
        status: 502,
        name: 'AuthApiError',
        message: 'Bad Gateway',
      } as any,
    };
  };

  await assert.rejects(
    () => authService.authenticate('5xx-token'),
    (err: unknown) =>
      err instanceof AppError &&
      err.statusCode === 503 &&
      err.code === 'AUTH_UNAVAILABLE' &&
      err.message === 'Hệ thống đang bận, vui lòng thử lại.',
  );
  assert.equal(callCount, 2, 'Cần thử lại đúng 1 lần trước khi ném 503');
});

test('authenticate retries and returns 503 AUTH_UNAVAILABLE on Supabase network/timeout error', async () => {
  let callCount = 0;
  supabaseAuth.auth.getUser = async () => {
    callCount++;
    return {
      data: { user: null },
      error: {
        status: 0,
        name: 'AuthRetryableFetchError',
        message: 'TypeError: fetch failed',
      } as any,
    };
  };

  await assert.rejects(
    () => authService.authenticate('network-token'),
    (err: unknown) =>
      err instanceof AppError &&
      err.statusCode === 503 &&
      err.code === 'AUTH_UNAVAILABLE' &&
      err.message === 'Hệ thống đang bận, vui lòng thử lại.',
  );
  assert.equal(callCount, 2, 'Cần thử lại đúng 1 lần khi gặp lỗi mạng/timeout');
});

test('authenticate succeeds after 1 retry when transient Supabase error resolves', async () => {
  let callCount = 0;
  supabaseAuth.auth.getUser = async () => {
    callCount++;
    if (callCount === 1) {
      return {
        data: { user: null },
        error: {
          status: 503,
          name: 'AuthRetryableFetchError',
          message: 'Service Unavailable',
        } as any,
      };
    }
    return {
      data: { user: { id: 'user-123' } as any },
      error: null,
    };
  };

  const profile = await authService.authenticate('retry-success-token');
  assert.equal(profile.id, 'user-123');
  assert.equal(callCount, 2);
});

test('authenticate caches successful getUser and does not call Supabase within cache window', async () => {
  let callCount = 0;
  supabaseAuth.auth.getUser = async () => {
    callCount++;
    return {
      data: { user: { id: 'user-123' } as any },
      error: null,
    };
  };

  const profile1 = await authService.authenticate('cached-token');
  const profile2 = await authService.authenticate('cached-token');

  assert.equal(profile1.id, 'user-123');
  assert.equal(profile2.id, 'user-123');
  assert.equal(callCount, 1, 'Lần gọi thứ 2 phải lấy từ cache, không gọi lại Supabase');
});
