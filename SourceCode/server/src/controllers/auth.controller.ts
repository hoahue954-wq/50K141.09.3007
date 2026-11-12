import type { RequestHandler } from 'express';
import { authService } from '../services/auth.service.js';
import { AppError } from '../utils/AppError.js';
import { sendData } from '../utils/response.js';

export const getCurrentUser: RequestHandler = (_req, res, next) => {
  const profile = res.locals.authProfile;

  if (!profile) {
    next(new AppError(401, 'Vui lòng đăng nhập để tiếp tục.', 'AUTH_REQUIRED'));
    return;
  }

  sendData(res, authService.toApiProfile(profile));
};
