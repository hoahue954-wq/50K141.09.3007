import type { RequestHandler } from 'express';
import { purchaseOrderService } from '../services/purchase-order.service.js';
import { AppError } from '../utils/AppError.js';
import {
  createPurchaseOrderSchema,
  purchaseOrderListQuerySchema,
  updatePurchaseOrderSchema,
} from '../validators/purchase-order.validators.js';

function getProfile(res: Parameters<RequestHandler>[1]) {
  const profile = res.locals.authProfile;
  if (!profile) throw new AppError(401, 'Vui lòng đăng nhập để tiếp tục.', 'AUTH_REQUIRED');
  return profile;
}

function getId(req: Parameters<RequestHandler>[0]): string {
  const id = req.params.id;
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new AppError(400, 'Mã phiếu nhập không hợp lệ.', 'INVALID_PURCHASE_ORDER_ID');
  }
  return id;
}

export const createPurchaseOrder: RequestHandler = async (req, res) => {
  const input = createPurchaseOrderSchema.parse(req.body);
  res.status(201).json(await purchaseOrderService.create(input, getProfile(res)));
};

export const listPurchaseOrders: RequestHandler = async (req, res) => {
  const query = purchaseOrderListQuerySchema.parse(req.query);
  res.json(await purchaseOrderService.list(query, getProfile(res)));
};

export const getPurchaseOrder: RequestHandler = async (req, res) => {
  res.json(await purchaseOrderService.getById(getId(req), getProfile(res)));
};

export const updatePurchaseOrder: RequestHandler = async (req, res) => {
  const input = updatePurchaseOrderSchema.parse(req.body);
  res.json(await purchaseOrderService.update(getId(req), input, getProfile(res)));
};

export const completePurchaseOrder: RequestHandler = async (req, res) => {
  res.json(await purchaseOrderService.complete(getId(req), getProfile(res)));
};

export const deletePurchaseOrder: RequestHandler = async (req, res) => {
  await purchaseOrderService.delete(getId(req), getProfile(res));
  res.json({ message: 'Đã xóa mềm phiếu nhập.' });
};
