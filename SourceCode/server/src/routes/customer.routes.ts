import { Router } from 'express';
import { createCustomer, getCustomerDebt, listCustomers } from '../controllers/customer.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/requireRole.js';
import { RoleCode } from '@prisma/client';

export const customerRouter = Router();

customerRouter.use(authenticate);
customerRouter.get('/customers', listCustomers);
customerRouter.post('/customers', createCustomer);
customerRouter.get('/customers/:id/debt', requireRole(RoleCode.OWNER, RoleCode.STAFF), getCustomerDebt);
