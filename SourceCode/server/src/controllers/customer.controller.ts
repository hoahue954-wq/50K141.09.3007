import type { RequestHandler } from 'express';
import { customerService } from '../services/customer.service.js';
import {
  createCustomerSchema,
  customerListQuerySchema,
} from '../validators/customer.validators.js';
import { debtService } from '../services/debt.service.js';
import { AppError } from '../utils/AppError.js';

export const listCustomers: RequestHandler = async (req, res) => {
  const query = customerListQuerySchema.parse(req.query);
  res.json(await customerService.list(query));
};

export const createCustomer: RequestHandler = async (req, res) => {
  const input = createCustomerSchema.parse(req.body);
  res.status(201).json(await customerService.create(input));
};

export const getCustomerDebt: RequestHandler = async (req, res) => {
  const id = req.params.id;
  if (
    typeof id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  ) {
    throw new AppError(400, 'Mã khách hàng không hợp lệ.', 'INVALID_CUSTOMER_ID');
  }
  res.json(await debtService.getCustomerDebt(id));
};
