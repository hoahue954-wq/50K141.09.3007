import { RoleCode } from '@prisma/client';
import { Router } from 'express';
import {
  createDebt,
  createDebtPayment,
  listDebts,
} from '../controllers/debt.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/requireRole.js';

export const debtRouter = Router();

debtRouter.use(authenticate);
debtRouter.get('/debts', requireRole(RoleCode.OWNER, RoleCode.STAFF), listDebts);
debtRouter.post('/debts', requireRole(RoleCode.OWNER, RoleCode.STAFF), createDebt);
debtRouter.post('/debts/payments', requireRole(RoleCode.OWNER), createDebtPayment);
