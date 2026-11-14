import { RoleCode } from '@prisma/client';
import { Router } from 'express';
import multer from 'multer';
import {
  getDailyReport,
  getMonthlyReport,
  getProfitReport,
  getRevenueReport,
  importExpenses,
} from '../controllers/report.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/requireRole.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const reportRouter = Router();

reportRouter.use(authenticate, requireRole(RoleCode.OWNER));
reportRouter.get('/reports/revenue', getRevenueReport);
reportRouter.get('/reports/profit', getProfitReport);
reportRouter.get('/reports/daily', getDailyReport);
reportRouter.get('/reports/monthly', getMonthlyReport);
reportRouter.post('/reports/expenses/import', upload.single('file'), importExpenses);
reportRouter.post('/expenses/import', upload.single('file'), importExpenses);
