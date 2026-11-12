import type { RequestHandler } from 'express';
import { disposalService } from '../services/disposal.service.js';
import { AppError } from '../utils/AppError.js';
import {
  createDisposalSchema,
  disposalListQuerySchema,
  updateDisposalSchema,
} from '../validators/disposal.validators.js';

function getProfile(res: Parameters<RequestHandler>[1]) {
  const profile = res.locals.authProfile;
  if (!profile) throw new AppError(401, 'Vui lòng đăng nhập để tiếp tục.', 'AUTH_REQUIRED');
  return profile;
}

function getId(req: Parameters<RequestHandler>[0]): string {
  const id = req.params.id;
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new AppError(400, 'Mã phiếu hủy không hợp lệ.', 'INVALID_DISPOSAL_ID');
  }
  return id;
}

export const createDisposal: RequestHandler = async (req, res) => {
  const input = createDisposalSchema.parse(req.body);
  res.status(201).json(await disposalService.create(input, getProfile(res)));
};

export const listDisposals: RequestHandler = async (req, res) => {
  const query = disposalListQuerySchema.parse(req.query);
  res.json(await disposalService.list(query, getProfile(res)));
};

export const getDisposal: RequestHandler = async (req, res) => {
  res.json(await disposalService.getById(getId(req), getProfile(res)));
};

export const updateDisposal: RequestHandler = async (req, res) => {
  const input = updateDisposalSchema.parse(req.body);
  res.json(await disposalService.update(getId(req), input, getProfile(res)));
};

export const approveDisposal: RequestHandler = async (req, res) => {
  res.json(await disposalService.approve(getId(req), getProfile(res)));
};

export const rejectDisposal: RequestHandler = async (req, res) => {
  res.json(await disposalService.reject(getId(req), getProfile(res)));
};

export const deleteDisposal: RequestHandler = async (req, res) => {
  await disposalService.delete(getId(req), getProfile(res));
  res.json({ message: 'Đã xóa mềm phiếu hủy.' });
};
