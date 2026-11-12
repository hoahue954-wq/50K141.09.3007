import type { RequestHandler } from 'express';
import { authService } from '../services/auth.service.js';
import { AppError } from '../utils/AppError.js';

export const authenticate: RequestHandler = async (req, res, next) => {
  const authorization = req.header('authorization');
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  const accessToken = match?.[1];

  if (!accessToken) {
    next(new AppError(401, 'Vui lòng đăng nhập để tiếp tục.', 'AUTH_REQUIRED'));
    return;
  }

  try {
    res.locals.authProfile = await authService.authenticate(accessToken);
    next();
  } catch (error) {
    next(error);
  }
};
