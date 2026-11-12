import type { RequestHandler } from 'express';
import { returnService } from '../services/return.service.js';
import { AppError } from '../utils/AppError.js';
import {
  createReturnSchema,
  returnListQuerySchema,
  updateReturnSchema,
} from '../validators/return.validators.js';

function getProfile(res: Parameters<RequestHandler>[1]) {
  const profile = res.locals.authProfile;
  if (!profile) throw new AppError(401, 'Vui lòng đăng nhập để tiếp tục.', 'AUTH_REQUIRED');
  return profile;
}

function getId(req: Parameters<RequestHandler>[0]): string {
  const id = req.params.id;
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new AppError(400, 'Mã phiếu đổi/trả không hợp lệ.', 'INVALID_RETURN_ID');
  }
  return id;
}

export const createReturn: RequestHandler = async (req, res) => {
  const input = createReturnSchema.parse(req.body);
  res.status(201).json(await returnService.create(input, getProfile(res)));
};

export const listReturns: RequestHandler = async (req, res) => {
  const query = returnListQuerySchema.parse(req.query);
  res.json(await returnService.list(query, getProfile(res)));
};

export const getReturn: RequestHandler = async (req, res) => {
  res.json(await returnService.getById(getId(req), getProfile(res)));
};

export const updateReturn: RequestHandler = async (req, res) => {
  const input = updateReturnSchema.parse(req.body);
  res.json(await returnService.update(getId(req), input, getProfile(res)));
};

export const approveReturn: RequestHandler = async (req, res) => {
  res.json(await returnService.approve(getId(req), getProfile(res)));
};

export const rejectReturn: RequestHandler = async (req, res) => {
  res.json(await returnService.reject(getId(req), getProfile(res)));
};

export const deleteReturn: RequestHandler = async (req, res) => {
  await returnService.delete(getId(req), getProfile(res));
  res.json({ message: 'Đã xóa mềm phiếu đổi/trả.' });
};
