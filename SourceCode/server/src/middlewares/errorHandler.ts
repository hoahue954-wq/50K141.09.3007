import { Prisma } from '@prisma/client';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, `Không tìm thấy API ${req.method} ${req.path}.`, 'NOT_FOUND'));
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      message: error.message,
      code: error.code,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      message: 'Dữ liệu đầu vào không hợp lệ.',
      code: 'VALIDATION_ERROR',
      details: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      res.status(409).json({ message: 'Dữ liệu đã tồn tại.', code: 'DUPLICATE_RESOURCE' });
      return;
    }

    if (error.code === 'P2003') {
      res.status(409).json({
        message: 'Không thể thực hiện do dữ liệu đang được sử dụng.',
        code: 'RELATED_RESOURCE',
      });
      return;
    }

    if (error.code === 'P2025') {
      res.status(404).json({ message: 'Không tìm thấy dữ liệu cần thao tác.', code: 'NOT_FOUND' });
      return;
    }
  }

  console.error('Unhandled request error:', error);
  res.status(500).json({ message: 'Đã xảy ra lỗi hệ thống.', code: 'INTERNAL_ERROR' });
};
