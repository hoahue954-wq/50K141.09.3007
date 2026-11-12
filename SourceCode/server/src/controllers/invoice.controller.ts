import type { RequestHandler } from 'express';
import { invoiceService } from '../services/invoice.service.js';
import { AppError } from '../utils/AppError.js';
import {
  createInvoiceSchema,
  invoiceListQuerySchema,
  settleInvoiceSchema,
} from '../validators/invoice.validators.js';

function getProfile(res: Parameters<RequestHandler>[1]) {
  const profile = res.locals.authProfile;
  if (!profile) throw new AppError(401, 'Vui lòng đăng nhập để tiếp tục.', 'AUTH_REQUIRED');
  return profile;
}

function getParam(req: Parameters<RequestHandler>[0], name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string') {
    throw new AppError(400, 'Tham số đường dẫn không hợp lệ.', 'INVALID_PATH_PARAMETER');
  }
  return value;
}

function getIdParam(req: Parameters<RequestHandler>[0], name: string): string {
  const value = getParam(req, name);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new AppError(400, 'Mã hóa đơn không hợp lệ.', 'INVALID_INVOICE_ID');
  }
  return value;
}

export const createInvoice: RequestHandler = async (req, res) => {
  const input = createInvoiceSchema.parse(req.body);
  res.status(201).json(await invoiceService.create(input, getProfile(res)));
};

export const listInvoices: RequestHandler = async (req, res) => {
  const query = invoiceListQuerySchema.parse(req.query);
  res.json(await invoiceService.list(query, getProfile(res).role.code === 'OWNER'));
};

export const getInvoice: RequestHandler = async (req, res) => {
  res.json(await invoiceService.getById(getIdParam(req, 'id'), getProfile(res).role.code === 'OWNER'));
};

export const getInvoiceByCode: RequestHandler = async (req, res) => {
  res.json(
    await invoiceService.getByCode(getParam(req, 'code'), getProfile(res).role.code === 'OWNER'),
  );
};

export const settleInvoice: RequestHandler = async (req, res) => {
  const input = settleInvoiceSchema.parse(req.body);
  if (input.amount_received === undefined) {
    throw new AppError(400, 'Vui lòng nhập số tiền thanh toán.', 'PAYMENT_AMOUNT_REQUIRED');
  }
  res.json(await invoiceService.settle(getIdParam(req, 'id'), input, getProfile(res)));
};

export const settleInvoiceLegacy: RequestHandler = async (req, res) => {
  const input = settleInvoiceSchema.parse(req.body);
  res.json(await invoiceService.settle(getIdParam(req, 'id'), input, getProfile(res)));
};

export const deleteInvoice: RequestHandler = async (req, res) => {
  await invoiceService.delete(getIdParam(req, 'id'), getProfile(res));
  res.json({ message: 'Đã xóa hóa đơn và hoàn lại tồn kho thành công.' });
};

export const getDashboard: RequestHandler = async (_req, res) => {
  res.json(await invoiceService.dashboard(getProfile(res)));
};
