import type { RequestHandler } from 'express';
import type { RoleCode } from '@prisma/client';
import { AppError } from '../utils/AppError.js';

export function requireRole(...allowedRoles: RoleCode[]): RequestHandler {
  return (_req, res, next) => {
    const profile = res.locals.authProfile;

    if (!profile) {
      next(new AppError(401, 'Vui lòng đăng nhập để tiếp tục.', 'AUTH_REQUIRED'));
      return;
    }

    if (!allowedRoles.includes(profile.role.code)) {
      next(new AppError(403, 'Bạn không có quyền thực hiện thao tác này.', 'FORBIDDEN'));
      return;
    }

    next();
  };
}
