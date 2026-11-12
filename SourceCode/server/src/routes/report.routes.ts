import { RoleCode } from '@prisma/client';
import { Router } from 'express';
import {
  getDailyReport,
  getMonthlyReport,
  getProfitReport,
  getRevenueReport,
} from '../controllers/report.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/requireRole.js';

export const reportRouter = Router();

reportRouter.use(authenticate, requireRole(RoleCode.OWNER));
reportRouter.get('/reports/revenue', getRevenueReport);
reportRouter.get('/reports/profit', getProfitReport);
reportRouter.get('/reports/daily', getDailyReport);
reportRouter.get('/reports/monthly', getMonthlyReport);
