import type { RequestHandler } from 'express';
import { debtService } from '../services/debt.service.js';
import { AppError } from '../utils/AppError.js';
import {
  createDebtPaymentSchema,
  createDebtSchema,
  debtListQuerySchema,
} from '../validators/debt.validators.js';

function getProfile(res: Parameters<RequestHandler>[1]) {
  const profile = res.locals.authProfile;
  if (!profile) throw new AppError(401, 'Vui lòng đăng nhập để tiếp tục.', 'AUTH_REQUIRED');
  return profile;
}

function getId(req: Parameters<RequestHandler>[0]): string {
  const id = req.params.id;
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new AppError(400, 'Mã khách hàng không hợp lệ.', 'INVALID_CUSTOMER_ID');
  }
  return id;
}

export const createDebt: RequestHandler = async (req, res) => {
  res.status(201).json(await debtService.create(createDebtSchema.parse(req.body), getProfile(res)));
};

export const listDebts: RequestHandler = async (req, res) => {
  res.json(await debtService.list(debtListQuerySchema.parse(req.query)));
};

export const getCustomerDebt: RequestHandler = async (req, res) => {
  res.json(await debtService.getCustomerDebt(getId(req)));
};

export const createDebtPayment: RequestHandler = async (req, res) => {
  res.status(201).json(await debtService.pay(
    createDebtPaymentSchema.parse(req.body),
    getProfile(res),
  ));
};
